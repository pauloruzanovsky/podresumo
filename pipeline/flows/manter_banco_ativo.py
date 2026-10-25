"""
Toca o banco e mostra o estado do acervo.

Por que existe: no plano gratuito o Supabase pausa o projeto depois de uns
dias sem uso, e projeto pausado some do DNS — o site e o pipeline caem juntos
(aconteceu em outubro de 2026). Uma leitura por dia basta pra contar como uso.

Roda antes do download na rotina diária, de propósito separado dele: se o
YouTube bloquear logo na primeira tentativa, o banco ainda assim é acessado.

Sem custo: só leituras no Supabase.

Uso:
    python -m flows.manter_banco_ativo
"""

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ESTADOS = {
    "listed": "sem transcrição",
    "pending": "transcrição baixada, aguardando extração",
    "done": "no site",
}


def main():
    try:
        podcasts = supabase.table("podcasts").select("id, nome").execute().data
        episodios = supabase.table("episodes").select("podcast_id, status").execute().data
    except Exception as e:
        # Sai com erro: a rotina precisa relatar isso, não seguir em frente.
        print(f"BANCO INACESSÍVEL: {e}")
        sys.exit(1)

    print("banco ativo — leitura feita\n")
    nomes = {p["id"]: p["nome"] for p in podcasts}
    por_podcast = {}
    for e in episodios:
        por_podcast.setdefault(nomes.get(e["podcast_id"], "?"), Counter())[e["status"]] += 1

    for nome, contagem in sorted(por_podcast.items()):
        print(nome)
        for status, rotulo in ESTADOS.items():
            print(f"  {status:<8} {contagem.get(status, 0):>4}  {rotulo}")
        outros = {k: v for k, v in contagem.items() if k not in ESTADOS}
        if outros:
            print(f"  outros: {outros}")


if __name__ == "__main__":
    main()
