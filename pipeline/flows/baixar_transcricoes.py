"""
Baixa a transcrição dos episódios que ainda não estão no banco e salva como
`pending`, sem chamar o Claude.

Por que separado da sync: a sync extrai na hora, em chamada normal. Baixando
primeiro e extraindo depois em lote (`reprocessar_batch`), a extração custa
metade. O site só mostra episódio `done`, então os `pending` ficam invisíveis
até o lote ser coletado.

Tem que rodar de uma máquina residencial: o YouTube bloqueia transcrição pra
IP de datacenter (por isso a sync no GitHub Actions está desligada).

Uso:
    python -m flows.baixar_transcricoes --playlist-id PL... --podcast socios --listar
    python -m flows.baixar_transcricoes --playlist-id PL... --podcast socios [--max 50]
    python -m flows.baixar_transcricoes --ids-arquivo lista.txt --podcast huberman

`--ids-arquivo` é pra seleção feita à mão (um id de vídeo por linha), quando os
episódios escolhidos não são os mais recentes da playlist. `--reaproveitar`
aponta uma pasta com transcrições já baixadas (<id>.txt), que não gastam uma
tentativa no YouTube.

Depois:
    python -m flows.reprocessar_batch --estimar --podcast socios --pendentes
"""

import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract.transcript import fetch_transcript
from extract.youtube import fetch_episodes, fetch_videos
from flows.reprocessar_batch import acha_podcast
from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Pausa entre downloads: são dezenas de pedidos seguidos ao mesmo endpoint, e
# o YouTube bloqueia o IP quando acha que é robô (na primeira leva, com 3s de
# pausa, bloqueou depois de ~18).
PAUSA_SEG = 8

# Vídeos com a legenda desativada no YouTube: não há transcrição pra baixar,
# hoje ou depois. Ficam fora da fila pra não gastar uma das ~15 tentativas que
# o YouTube deixa por dia.
SEM_LEGENDA = {
    "hR1gy3THj3o",  # #264 — Estados Unidos vs. Venezuela
    "0PwFujd0F1I",  # #80 — Ascensão, declínio (e queda?) dos Estados Unidos
    "mVrVcGrL7hE",  # #23 — Como é viver num país socialista?
    "Jp43mamrhcI",  # #19 — Do zero a 700 franquias
    "O9Mzk4hUK0A",  # #18 — Especial Dia dos Namorados
    "lINP5eZXzW8",  # #17 — Gestão de negócios
    "APcfwTmXHcM",  # #12 — Democracia: o Deus que falhou?
}

# Falhas seguidas que indicam bloqueio: insistir só prolonga o castigo.
MAX_FALHAS_SEGUIDAS = 2


def minutos(duracao: str | None) -> int:
    """'2h18min' -> 138; '9min' -> 9 (formato de extract.youtube.parse_duration)."""
    m = re.match(r"(?:(\d+)h)?(\d+)min", duracao or "")
    return int(m.group(1) or 0) * 60 + int(m.group(2)) if m else 0


def episodio_inteiro(e: dict, desde: str | None, min_minutos: int, excluir: list[str]) -> bool:
    """Canal em inglês posta corte, short e "Essentials" no mesmo feed dos
    episódios: só entra o episódio inteiro, publicado a partir de `desde`."""
    return (
        (not desde or (e["data"] or "") >= desde)
        and minutos(e["duracao"]) >= min_minutos
        and not any(x.lower() in e["titulo"].lower() for x in excluir)
    )


def faltantes(eps: list[dict]) -> list[dict]:
    # `listed` é só catálogo (catalogar_episodios): ainda falta a transcrição.
    com_transcricao = {
        e["id"] for e in supabase.table("episodes").select("id, status").execute().data
        if e["status"] != "listed"
    }
    return [
        e for e in eps
        if e["video_id"] not in com_transcricao and e["video_id"] not in SEM_LEGENDA
    ]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    origem = p.add_mutually_exclusive_group(required=True)
    origem.add_argument("--playlist-id")
    origem.add_argument("--ids-arquivo", help="arquivo com um id de vídeo por linha")
    p.add_argument("--reaproveitar", metavar="PASTA",
                   help="pasta com transcrições já baixadas (<id>.txt)")
    p.add_argument("--podcast", required=True, help='trecho do nome, ex.: "socios"')
    p.add_argument("--max", type=int, default=50,
                   help="quantos vídeos da playlist olhar, do mais recente pro mais antigo")
    p.add_argument("--limite", type=int, help="baixa no máximo N nesta rodada")
    p.add_argument("--pausa", type=int, default=PAUSA_SEG,
                   help="segundos entre um download e outro")
    p.add_argument("--listar", action="store_true", help="só mostra o que falta")
    p.add_argument("--desde", metavar="AAAA-MM-DD", help="ignora vídeo publicado antes")
    p.add_argument("--min-minutos", type=int, default=0,
                   help="ignora vídeo mais curto (corte, short)")
    p.add_argument("--excluir", nargs="+", default=[], metavar="TRECHO",
                   help='ignora vídeo com este trecho no título, ex.: "Essentials"')
    args = p.parse_args()

    podcast = acha_podcast(args.podcast)
    if args.ids_arquivo:
        with open(args.ids_arquivo, encoding="utf-8") as f:
            eps = fetch_videos(f.read().split())
    else:
        eps = fetch_episodes(args.playlist_id, args.max)
    eps = [e for e in eps if episodio_inteiro(e, args.desde, args.min_minutos, args.excluir)]
    novos = faltantes(eps)

    def salva_antes(e):
        return args.reaproveitar and os.path.exists(os.path.join(args.reaproveitar, f"{e['video_id']}.txt"))

    # os já baixados vêm primeiro: não contam pra pausa nem pro bloqueio
    novos.sort(key=lambda e: not salva_antes(e))
    if args.limite and not args.listar:
        novos = novos[:args.limite]
    print(f"\n{len(novos)} episódio(s) sem transcrição no banco:")
    for e in novos:
        print(f"  #{e['ep_number']}  {e['data']}  {e['titulo'][:60]}")
    if args.listar or not novos:
        return

    print()
    salvos, sem_transcricao, seguidas = 0, [], 0
    inicio = time.time()
    for i, e in enumerate(novos):
        if salva_antes(e):
            with open(os.path.join(args.reaproveitar, f"{e['video_id']}.txt"), encoding="utf-8") as f:
                transcricao = f.read()
        else:
            if i:
                time.sleep(args.pausa)
            transcricao = fetch_transcript(e["video_id"])
        if not transcricao:
            sem_transcricao.append(e)
            seguidas += 1
            if seguidas >= MAX_FALHAS_SEGUIDAS:
                print(f"{seguidas} falhas seguidas: provável bloqueio do "
                      f"YouTube. Parando depois de {i + 1} tentativas em "
                      f"{int(time.time() - inicio)}s.")
                break
            continue
        seguidas = 0

        # upsert: o episódio pode já existir como `listed`.
        supabase.table("episodes").upsert({
            "id": e["video_id"],
            "podcast_id": podcast["id"],
            "ep_number": e["ep_number"],
            "titulo": e["titulo"],
            "data": e["data"],
            "duracao": e["duracao"],
            "thumbnail": e["thumbnail"],
            "link_youtube": f"https://www.youtube.com/watch?v={e['video_id']}",
            "status": "pending",
            "transcricao": transcricao,
        }).execute()
        salvos += 1

    print(f"\n=== {salvos} transcrição(ões) salva(s) como pending ===")
    if salvos:
        # endereço legível pros episódios que acabaram de entrar
        from flows.preencher_slugs import main as preencher_slugs
        preencher_slugs()
    if sem_transcricao:
        print(f"{len(sem_transcricao)} sem transcrição disponível:")
        for e in sem_transcricao:
            print(f"  #{e['ep_number']}  {e['video_id']}  {e['titulo'][:60]}")


if __name__ == "__main__":
    main()
