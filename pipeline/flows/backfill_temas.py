"""
OBSOLETO desde o reprocessamento com extração rica (flows/reprocessar_batch.py).

`livros.temas` agora vem da extração e descreve o LIVRO. Este script sobrescreve
com as tags do EPISÓDIO, que é o problema que a extração veio resolver — era o
que marcava "A Lógica do Cisne Negro" como Bitcoin e Produtividade.

Só rode se quiser voltar ao comportamento antigo de propósito.

Backfill: deriva livros.temas[] a partir das tags dos episódios que citam o livro.

Regra:
- Agrupa tags por lowercase (dedupe case-insensitive)
- Em cada grupo, escolhe a forma mais frequente (empate: prefere começar com
  maiúscula; empate ainda: ordem alfabética — determinístico)
- One-shot, idempotente. Roda quantas vezes quiser.

Uso:
    python -m flows.backfill_temas
"""

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase


def best_form(counter: Counter) -> str:
    """Forma mais frequente. Empate → começa com maiúscula; empate → alfabético."""
    return min(
        counter.items(),
        key=lambda kv: (-kv[1], not kv[0][:1].isupper(), kv[0]),
    )[0]


def derive_temas(tag_lists: list[list[str]]) -> list[str]:
    groups: dict[str, Counter] = {}
    for tags in tag_lists:
        for tag in tags or []:
            t = (tag or "").strip()
            if not t:
                continue
            groups.setdefault(t.lower(), Counter())[t] += 1
    return sorted(best_form(c) for c in groups.values())


def extract_tag_lists(rels: list[dict]) -> list[list[str]]:
    """episode_livros pode embarcar `episodes` como dict (N→1) ou list — aceita ambos."""
    out: list[list[str]] = []
    for rel in rels:
        ep = rel.get("episodes")
        if isinstance(ep, list):
            for e in ep:
                out.append((e or {}).get("tags") or [])
        elif isinstance(ep, dict):
            out.append(ep.get("tags") or [])
    return out


def main():
    print("=== BACKFILL DE TEMAS EM LIVROS ===\n")

    livros = supabase.table("livros").select(
        "id, titulo, episode_livros(episodes(tags))"
    ).execute()

    updated = 0
    sem_temas = 0
    samples = []

    for livro in livros.data:
        rels = livro.get("episode_livros") or []
        tag_lists = extract_tag_lists(rels)
        temas = derive_temas(tag_lists)

        supabase.table("livros").update({"temas": temas}).eq("id", livro["id"]).execute()
        updated += 1
        if not temas:
            sem_temas += 1
        elif len(samples) < 5:
            samples.append((livro["titulo"], temas))

    print(f"  Atualizados: {updated} livros")
    print(f"  Sem temas (0 eps citando ou eps sem tags): {sem_temas}\n")

    print("=== AMOSTRA ===")
    for titulo, temas in samples:
        print(f"  - {titulo}: {temas}")


if __name__ == "__main__":
    main()
