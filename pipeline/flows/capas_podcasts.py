"""
Capa de cada podcast, grava em podcasts.thumbnail.

Vem da busca pública da Apple Podcasts: é a arte oficial do programa, a mesma
que o feed entrega aos outros aplicativos, em 600 px. Não pede chave. O canal
do YouTube dá só o avatar, que costuma ser outra imagem.

Só grava quando o nome bate exato: a busca devolve também resumos e cópias
("The Tim Ferriss Show | 5 minute podcast summaries"). Sem custo.

Uso:
    python -m flows.capas_podcasts
"""

import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flows.reprocessar_batch import sem_acento
from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BUSCA = "https://itunes.apple.com/search?"


def procura_capa(nome: str) -> str | None:
    url = BUSCA + urllib.parse.urlencode({"media": "podcast", "limit": 10, "term": nome})
    with urllib.request.urlopen(url, timeout=20) as r:
        resultados = json.load(r)["results"]
    for podcast in resultados:
        if sem_acento(podcast["collectionName"]) == sem_acento(nome):
            return podcast.get("artworkUrl600")
    return None


def main():
    for podcast in supabase.table("podcasts").select("id, nome").execute().data:
        capa = procura_capa(podcast["nome"])
        if capa:
            supabase.table("podcasts").update({"thumbnail": capa}).eq("id", podcast["id"]).execute()
        print(f"  {'ok' if capa else '--'}  {podcast['nome']}")


if __name__ == "__main__":
    main()
