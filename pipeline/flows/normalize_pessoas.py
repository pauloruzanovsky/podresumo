"""
Unifica as grafias de uma pessoa: "Felipe SantAna" vira "Felipe Sant'Ana".

A extração escreve o nome como ouviu, episódio a episódio, e cada grafia vira
uma pessoa no site: dividia os placares de quem mais cita, o filtro da estante
e a busca. Corrige nos três lugares onde o nome mora: `episode_livros.quem_citou`,
`episodes.convidados` e `livros.autor`.

A lista é conferida à mão, de propósito: por semelhança de texto, Rodrigo
Barbosa e Rodrigo Barros seriam a mesma pessoa. Grafia nova entra em ALIASES.
Roda sozinho no fim de `reprocessar_batch --coletar`.

Uso:
    python -m flows.normalize_pessoas           # só mostra
    python -m flows.normalize_pessoas --apply
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from load.supabase import supabase, todas

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# nome certo -> grafias a trocar
ALIASES = {
    "Felipe Sant'Ana": ["Felipe San'tAna", "Felipe Sant'Anna", "Felipe SantAna", "Felipe SantAnna", "Felipe Santana"],
    "Sérgio Sacani": ["Sergio Sacani"],
    "Fábio Fares": ["Fabio Fares"],
    "Heni Ozi Cukier": ["Heni Ozi Cukier (Professor HOC)", "Professor HOC"],
    "Duda Vieira": ["Duda Viera"],
    "Charles Wicz": ["Charles Wics"],
    "Ju Fraccaroli": ["Ju Fracaroli"],
    "Junior das Neves": ["Junior Das Neves"],
    "Mário Trentim": ["Mario Trentim"],
    "Natália Beauty": ["Natalia Beauty"],
    "Roberta Carbonari": ["Roberta Carbonari Muzy"],
    "Luciano Bruno": ["Dr. Luciano Bruno"],
}

CANONICO = {grafia: certo for certo, grafias in ALIASES.items() for grafia in grafias}

# Pessoas diferentes de nome parecido: o relatório de pendências não as sugere.
PESSOAS_DIFERENTES = [
    {"Rodrigo Barbosa", "Rodrigo Barros"},
    {"Neil Strauss", "Neil Howe e William Strauss"},
]


def citacoes(aplicar: bool) -> int:
    n = 0
    for grafia, certo in CANONICO.items():
        linhas = supabase.table("episode_livros").select("episode_id").eq("quem_citou", grafia).execute().data
        n += len(linhas)
        if linhas and aplicar:
            supabase.table("episode_livros").update({"quem_citou": certo}).eq("quem_citou", grafia).execute()
    return n


def convidados(aplicar: bool) -> int:
    n = 0
    episodios = todas(lambda: supabase.table("episodes").select("id, convidados").order("id"))
    for e in episodios:
        atual = e.get("convidados") or []
        novo = list(dict.fromkeys(CANONICO.get(c.strip(), c) for c in atual))
        if novo != atual:
            n += 1
            if aplicar:
                supabase.table("episodes").update({"convidados": novo}).eq("id", e["id"]).execute()
    return n


def autores(aplicar: bool) -> int:
    n = 0
    for grafia, certo in CANONICO.items():
        for l in supabase.table("livros").select("id, titulo").eq("autor", grafia).execute().data:
            # (titulo, autor) é único: se o livro já existe com o nome certo,
            # é fusão de livros, e quem decide é o normalize_livros
            existe = supabase.table("livros").select("id").eq("titulo", l["titulo"]).eq("autor", certo).execute().data
            if existe:
                print(f"  ⚠️ {l['titulo']}: já existe com {certo}; ver normalize_livros")
                continue
            n += 1
            if aplicar:
                supabase.table("livros").update({"autor": certo}).eq("id", l["id"]).execute()
    return n


def main(aplicar: bool = True):
    print("=== PESSOAS ===")
    print(f"  citações: {citacoes(aplicar)}")
    print(f"  episódios com convidado: {convidados(aplicar)}")
    print(f"  livros com autor: {autores(aplicar)}")
    if not aplicar:
        print("Nada foi gravado. Rode com --apply pra executar.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    main(p.parse_args().apply)
