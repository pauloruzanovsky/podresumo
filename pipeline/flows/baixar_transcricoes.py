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

Depois:
    python -m flows.reprocessar_batch --estimar --podcast socios --pendentes
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract.transcript import fetch_transcript
from extract.youtube import fetch_episodes
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
}

# Falhas seguidas que indicam bloqueio: insistir só prolonga o castigo.
MAX_FALHAS_SEGUIDAS = 2


def faltantes(playlist_id: str, maximo: int) -> list[dict]:
    eps = fetch_episodes(playlist_id, maximo)
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
    p.add_argument("--playlist-id", required=True)
    p.add_argument("--podcast", required=True, help='trecho do nome, ex.: "socios"')
    p.add_argument("--max", type=int, default=50,
                   help="quantos vídeos da playlist olhar, do mais recente pro mais antigo")
    p.add_argument("--limite", type=int, help="baixa no máximo N nesta rodada")
    p.add_argument("--pausa", type=int, default=PAUSA_SEG,
                   help="segundos entre um download e outro")
    p.add_argument("--listar", action="store_true", help="só mostra o que falta")
    args = p.parse_args()

    podcast = acha_podcast(args.podcast)
    novos = faltantes(args.playlist_id, args.max)
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
