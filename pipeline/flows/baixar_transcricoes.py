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

# Pausa entre downloads: são dezenas de pedidos seguidos ao mesmo endpoint.
PAUSA_SEG = 3


def faltantes(playlist_id: str, maximo: int) -> list[dict]:
    eps = fetch_episodes(playlist_id, maximo)
    no_banco = {e["id"] for e in supabase.table("episodes").select("id").execute().data}
    return [e for e in eps if e["video_id"] not in no_banco]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--playlist-id", required=True)
    p.add_argument("--podcast", required=True, help='trecho do nome, ex.: "socios"')
    p.add_argument("--max", type=int, default=50,
                   help="quantos vídeos da playlist olhar, do mais recente pro mais antigo")
    p.add_argument("--listar", action="store_true", help="só mostra o que falta")
    args = p.parse_args()

    podcast = acha_podcast(args.podcast)
    novos = faltantes(args.playlist_id, args.max)
    print(f"\n{len(novos)} episódio(s) fora do banco:")
    for e in novos:
        print(f"  #{e['ep_number']}  {e['data']}  {e['titulo'][:60]}")
    if args.listar or not novos:
        return

    print()
    salvos, sem_transcricao = 0, []
    for i, e in enumerate(novos):
        if i:
            time.sleep(PAUSA_SEG)
        transcricao = fetch_transcript(e["video_id"])
        if not transcricao:
            sem_transcricao.append(e)
            continue

        supabase.table("episodes").insert({
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
    if sem_transcricao:
        print(f"{len(sem_transcricao)} sem transcrição disponível:")
        for e in sem_transcricao:
            print(f"  #{e['ep_number']}  {e['video_id']}  {e['titulo'][:60]}")


if __name__ == "__main__":
    main()
