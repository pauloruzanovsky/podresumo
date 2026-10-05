"""
Busca capas no Open Library e grava a URL em livros.capa_url.

Sem custo de API — o Open Library é aberto e não pede chave. A cobertura é
parcial (erra boa parte dos títulos em português), e é por isso que o site
tem capa gerada como base: aqui a capa real é uma camada por cima, não o
alicerce do layout.

Estratégia de busca, em ordem, até achar:
  1. título + autor
  2. só o título (nome de autor com "e", "coautor" etc. atrapalha o match)
  3. título sem subtítulo (corta em ":" ou " - ")

Uso:
    python -m flows.backfill_capas            # só livros sem capa
    python -m flows.backfill_capas --refazer  # revisita todos

Requer a migração supabase/migrations/003_livros_capa.sql.
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BUSCA = "https://openlibrary.org/search.json"
CAPA = "https://covers.openlibrary.org/b/id/{}-M.jpg"
# O Open Library pede um User-Agent identificável; sem ele a API responde 403.
UA = "PodResumo/1.0 (acervo de livros citados em podcasts)"
PAUSA = 0.35  # gentileza com uma API pública e gratuita


def normaliza(texto: str) -> str:
    t = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    ).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


def combina(doc: dict, titulo: str, autor: str | None) -> bool:
    """A busca do Open Library é difusa: "A Peste" traz "Who Is a Pest?".

    Aceitar o primeiro resultado põe capa errada no livro, o que é pior que
    não ter capa. Aqui o resultado só passa se o título bater de verdade —
    igual, ou um sendo prefixo do outro (diferença de subtítulo) — e, quando
    sabemos o autor, se o sobrenome aparecer entre os autores do resultado.
    """
    achado = normaliza(doc.get("title") or "")
    nosso = normaliza(titulo)
    if not achado or not nosso:
        return False

    if not (
        achado == nosso
        or achado.startswith(nosso + " ")
        or nosso.startswith(achado + " ")
    ):
        return False

    if autor:
        partes = normaliza(autor).split()
        sobrenome = partes[-1] if partes else ""
        autores = " ".join(normaliza(a) for a in (doc.get("author_name") or []))
        if sobrenome and autores and sobrenome not in autores:
            return False

    return True


def consulta(titulo: str, autor: str | None, **params) -> int | None:
    """cover_i do primeiro resultado que realmente corresponda ao livro."""
    url = f"{BUSCA}?" + urllib.parse.urlencode(
        {**params, "limit": "5", "fields": "cover_i,title,author_name"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            docs = json.load(r).get("docs") or []
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
        print(f"      erro na busca: {err}")
        return None

    for doc in docs:
        if doc.get("cover_i") and combina(doc, titulo, autor):
            return doc["cover_i"]
    return None


def sem_subtitulo(titulo: str) -> str:
    return re.split(r"\s*[:—–]\s|\s+-\s+", titulo)[0].strip()


def procura_capa(titulo: str, autor: str | None) -> int | None:
    tentativas = []
    if autor:
        tentativas.append({"title": titulo, "author": autor})
    tentativas.append({"title": titulo})
    curto = sem_subtitulo(titulo)
    if curto and curto != titulo:
        tentativas.append({"title": curto})

    for params in tentativas:
        cover = consulta(titulo, autor, **params)
        time.sleep(PAUSA)
        if cover:
            return cover
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refazer", action="store_true",
                        help="revisita livros que já têm capa")
    args = parser.parse_args()

    try:
        resp = supabase.table("livros").select(
            "id, titulo, autor, capa_url, episode_livros(episode_id)"
        ).eq("tipo", "livro").order("titulo").execute()
    except Exception:
        print("A coluna `capa_url` não existe no banco.")
        print("Rode supabase/migrations/003_livros_capa.sql antes.")
        return

    # Só livros que aparecem no site — não gastar requisição com órfão.
    livros = [l for l in resp.data if (l.get("episode_livros") or [])]
    alvos = livros if args.refazer else [l for l in livros if not l.get("capa_url")]

    print(f"=== CAPAS: {len(alvos)} livros a consultar (de {len(livros)}) ===\n")

    achou = 0
    for i, livro in enumerate(alvos, 1):
        cover = procura_capa(livro["titulo"], livro.get("autor"))
        url = CAPA.format(cover) if cover else None
        if url:
            achou += 1
        supabase.table("livros").update({"capa_url": url}).eq("id", livro["id"]).execute()
        marca = "OK " if url else "-- "
        print(f"  [{i:>3}/{len(alvos)}] {marca} {livro['titulo'][:55]}")

    # `livros` é o snapshot de ANTES da rodada. Com --refazer todo mundo foi
    # revisitado, então o total é só o que achamos agora; sem --refazer, é o
    # que já tinha capa mais o que achamos.
    ja_tinham = 0 if args.refazer else len([l for l in livros if l.get("capa_url")])
    total_com_capa = ja_tinham + achou

    print(f"\n=== {achou}/{len(alvos)} encontradas nesta rodada ===")
    print(f"acervo com capa real: {total_com_capa}/{len(livros)} "
          f"({100 * total_com_capa // max(len(livros), 1)}%)")
    print("O resto usa a capa gerada — nenhum card fica vazio.")


if __name__ == "__main__":
    main()
