"""
Dá endereço legível a livros e episódios que ainda não têm (coluna `slug`,
migração 007):

    livro     /livro/em-nome-do-povo
              /livro/historia-do-brasil-pedro-calmon   (título repetido: + autor)
    episódio  /episodio/312-o-que-a-escola-nao-ensina-sobre-a-historia-do-brasil

Nunca reescreve um slug existente: o endereço já pode estar no WhatsApp ou
no Google, e trocar quebraria o link. Título corrigido depois continua com o
endereço antigo — de propósito.

Roda sozinho no fim da coleta do lote; à mão, depois de qualquer gravação:
    python -m flows.preencher_slugs
"""

import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MAX_CHARS = 80


def slug_texto(texto: str) -> str:
    t = "".join(
        c for c in unicodedata.normalize("NFD", texto or "")
        if unicodedata.category(c) != "Mn"
    ).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) > MAX_CHARS:
        # corta na palavra, não no meio dela
        t = t[:MAX_CHARS].rsplit("-", 1)[0]
    return t


def titulo_episodio(titulo: str, numero: str | None) -> str:
    """'TÍTULO | Os Sócios 296' -> 'TÍTULO': o número vai na frente do slug."""
    return re.sub(r"\s*\|[^|]*$", "", titulo) if numero else titulo


def candidatos_livro(titulo: str, autor: str | None):
    base = slug_texto(titulo) or "livro"
    yield base
    if autor:
        yield f"{base}-{slug_texto(autor)}"
    n = 2
    while True:
        yield f"{base}-{n}"
        n += 1


def candidatos_episodio(titulo: str, numero: str | None):
    texto = slug_texto(titulo_episodio(titulo, numero)) or "episodio"
    base = f"{numero}-{texto}" if numero else texto
    yield base
    n = 2
    while True:
        yield f"{base}-{n}"
        n += 1


def preencher(tabela: str, campos: str, candidatos, ordem: str, prioridade=None):
    linhas = supabase.table(tabela).select(f"id, slug, {campos}").order(ordem).execute().data
    usados = {l["slug"] for l in linhas if l["slug"]}
    sem = [l for l in linhas if not l["slug"]]
    if prioridade:
        sem.sort(key=prioridade)
    for linha in sem:
        slug = next(s for s in candidatos(linha) if s not in usados)
        supabase.table(tabela).update({"slug": slug}).eq("id", linha["id"]).execute()
        usados.add(slug)
    print(f"{tabela}: {len(sem)} slug(s) novo(s), {len(linhas) - len(sem)} já tinham")
    return len(sem)


def main():
    # Livro mais citado primeiro: num título repetido, ele fica com o
    # endereço curto e o outro leva o autor. Empate desempata pelo id, pra
    # ordem ser a mesma entre rodadas.
    preencher(
        "livros", "titulo, autor, episode_livros(episode_id)",
        lambda l: candidatos_livro(l["titulo"], l["autor"]), "id",
        prioridade=lambda l: -len(l.get("episode_livros") or []),
    )
    preencher(
        "episodes", "titulo, ep_number",
        lambda e: candidatos_episodio(e["titulo"], e["ep_number"]), "data",
    )


if __name__ == "__main__":
    main()
