"""
Cataloga todos os episódios de uma playlist no banco, como `listed`: só os
dados do YouTube (título, número, data, thumbnail), sem transcrição e sem
extração.

Pra que serve: o site mostra o índice completo do podcast — do primeiro ao
último episódio — marcando quais já têm os livros mapeados. Sem o catálogo ele
só conheceria os episódios já processados.

Os estados de um episódio:
    listed   catalogado, sem transcrição           (este script)
    pending  transcrição baixada, sem extração     (baixar_transcricoes)
    done     extraído; é o único que o site abre   (reprocessar_batch / sync)

Sem custo: só a YouTube Data API, que não bloqueia IP de datacenter.

Uso:
    python -m flows.catalogar_episodios --playlist-id PL... --podcast socios --listar
    python -m flows.catalogar_episodios --playlist-id PL... --podcast socios
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract.youtube import fetch_episodes
from flows.reprocessar_batch import acha_podcast
from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--playlist-id", required=True)
    p.add_argument("--podcast", required=True, help='trecho do nome, ex.: "socios"')
    p.add_argument("--listar", action="store_true", help="só mostra o que entraria")
    args = p.parse_args()

    podcast = acha_podcast(args.podcast)
    # 5000 = "a playlist inteira"; fetch_episodes pagina de 50 em 50.
    eps = fetch_episodes(args.playlist_id, 5000)
    no_banco = {e["id"] for e in supabase.table("episodes").select("id").execute().data}
    novos = [e for e in eps if e["video_id"] not in no_banco]

    print(f"\nplaylist: {len(eps)} vídeos | já no banco: {len(eps) - len(novos)} "
          f"| a catalogar: {len(novos)}")
    sem_numero = [e for e in novos if not e["ep_number"]]
    if sem_numero:
        print(f"{len(sem_numero)} sem número de episódio no título:")
        for e in sem_numero:
            print(f"  {e['data']}  {e['titulo'][:70]}")
    if args.listar or not novos:
        return

    linhas = [
        {
            "id": e["video_id"],
            "podcast_id": podcast["id"],
            "ep_number": e["ep_number"],
            "titulo": e["titulo"],
            "data": e["data"],
            "duracao": e["duracao"],
            "thumbnail": e["thumbnail"],
            "link_youtube": f"https://www.youtube.com/watch?v={e['video_id']}",
            "status": "listed",
        }
        for e in novos
    ]
    for i in range(0, len(linhas), 100):
        supabase.table("episodes").insert(linhas[i:i + 100]).execute()
    print(f"\n=== {len(linhas)} episódio(s) catalogado(s) como listed ===")


if __name__ == "__main__":
    main()
