"""
Limpeza de livros duplicados e órfãos no banco.
SEM custo de API — só operações no Supabase.

Uso:
    python -m flows.cleanup_livros
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase


# (canonical_id, [ids_to_merge_into_canonical])
MERGES = [
    # A Lógica do Cisne Negro (+ "A Lógica do Negro" que é erro de transcrição)
    ("47f7e919-3f8d-4041-8ae5-83a2616f4cde", ["30ca1660-8327-4b10-a9ae-0af87cfd3565", "60fbe1bd"]),
    # Antifrágil
    ("73db7e84-a81f-47a3-ae69-a6c1e73c0329", ["5f2b744f-d150-4374-9fbb-d2fe0e3f73d2"]),
    # Coisa de Rico — merge tudo no que tem titulo completo
    ("b8c61670", ["e1ca0b8f-78e7-4482-8595-0ddfde31eddf", "2856cfe3-2370-482b-804e-be8c4e978e4a"]),
    # Inteligência do Carisma
    ("0929281c-1a67-43a1-9433-4a867ab152b5", ["886aafe1-b49f-47da-b105-d25bb0a0f7ad"]),
    # Padrão Bitcoin
    ("e3a0792f-bd04-41a7-96bc-0d318c746615", ["6f2f59f1-1834-46cd-a3bd-a906be23db66"]),
    # Padrão Fiduciário
    ("5a2592a5-45b2-45b0-9298-51af2de6fd39", ["710e3728-a171-4088-8753-eedac40886c2"]),
    # Cartas a/de um Estoico
    ("355e0b2b", ["4d3bed82"]),
]

# Corrigir autores no canônico após merge
AUTHOR_FIXES = {
    "e3a0792f-bd04-41a7-96bc-0d318c746615": "Saifedean Ammous",   # Padrão Bitcoin
    "5a2592a5-45b2-45b0-9298-51af2de6fd39": "Saifedean Ammous",   # Padrão Fiduciário
    "0929281c-1a67-43a1-9433-4a867ab152b5": "Oliviero Toscani",   # Inteligência do Carisma
    "b8c61670": "Michel Alcoforado",                                # Coisa de Rico
}

# Corrigir títulos
TITLE_FIXES = {
    "b8c61670": "Coisa de Rico",  # remover subtítulo longo
}


def resolve_id(short_id):
    """Resolve IDs curtos buscando no banco. Retorna None se não existe."""
    if len(short_id) == 36:
        # Verificar se existe
        r = supabase.table("livros").select("id").eq("id", short_id).execute()
        return short_id if r.data else None
    # Buscar todos e filtrar por prefixo
    result = supabase.table("livros").select("id").execute()
    for row in result.data:
        if row["id"].startswith(short_id):
            return row["id"]
    return None


def merge_livros():
    """Mergea duplicados reassociando episode_livros."""
    print("=== MERGEANDO DUPLICADOS ===\n")

    for canonical_short, merge_ids_short in MERGES:
        canonical_id = resolve_id(canonical_short)
        if not canonical_id:
            print(f"  Canonico nao encontrado: {canonical_short}, pulando...")
            continue
        canonical = supabase.table("livros").select("titulo").eq("id", canonical_id).single().execute()
        print(f"  Canonico: {canonical.data['titulo']}")

        for merge_short in merge_ids_short:
            merge_id = resolve_id(merge_short)
            if not merge_id:
                print(f"    Ja removido: {merge_short}")
                continue
            merge_book = supabase.table("livros").select("titulo").eq("id", merge_id).execute()
            if not merge_book.data:
                print(f"    Nao encontrado: {merge_short}")
                continue

            print(f"    <- {merge_book.data[0]['titulo']}")

            # Buscar relações do livro a ser mergeado
            rels = supabase.table("episode_livros").select("*").eq("livro_id", merge_id).execute()

            for rel in rels.data:
                # Verificar se já existe relação com o canônico nesse episódio
                existing = supabase.table("episode_livros").select("*").eq(
                    "episode_id", rel["episode_id"]
                ).eq("livro_id", canonical_id).execute()

                if existing.data:
                    # Já existe — deletar o duplicado
                    supabase.table("episode_livros").delete().eq(
                        "episode_id", rel["episode_id"]
                    ).eq("livro_id", merge_id).execute()
                else:
                    # Reassociar pro canônico
                    supabase.table("episode_livros").update(
                        {"livro_id": canonical_id}
                    ).eq("episode_id", rel["episode_id"]).eq("livro_id", merge_id).execute()

            # Deletar o livro mergeado
            supabase.table("livros").delete().eq("id", merge_id).execute()

        print()


def fix_metadata():
    """Corrige autores e títulos."""
    print("=== CORRIGINDO METADADOS ===\n")

    for short_id, author in AUTHOR_FIXES.items():
        livro_id = resolve_id(short_id)
        if not livro_id:
            print(f"  Nao encontrado: {short_id}")
            continue
        supabase.table("livros").update({"autor": author}).eq("id", livro_id).execute()
        print(f"  Autor: {author} -> {livro_id[:8]}")

    for short_id, title in TITLE_FIXES.items():
        livro_id = resolve_id(short_id)
        if not livro_id:
            print(f"  Nao encontrado: {short_id}")
            continue
        supabase.table("livros").update({"titulo": title}).eq("id", livro_id).execute()
        print(f"  Titulo: {title} -> {livro_id[:8]}")

    print()


def delete_orphans():
    """Deleta livros com 0 citações."""
    print("=== DELETANDO ORFAOS (0 CITACOES) ===\n")

    livros = supabase.table("livros").select("id, titulo, episode_livros(episode_id)").execute()

    deleted = 0
    for l in livros.data:
        count = len(l.get("episode_livros") or [])
        if count == 0:
            print(f"  X {l['titulo']}")
            supabase.table("livros").delete().eq("id", l["id"]).execute()
            deleted += 1

    print(f"\n  Deletados: {deleted}")


def main():
    merge_livros()
    delete_orphans()
    fix_metadata()

    # Contagem final
    final = supabase.table("livros").select("id", count="exact").execute()
    print(f"\n=== RESULTADO FINAL: {final.count} livros ===")


if __name__ == "__main__":
    main()
