"""
Monta o e-mail semanal com o que entrou no site nos últimos 7 dias e deixa
como RASCUNHO no Buttondown — o Paulo revisa e envia de lá. Nunca envia
sozinho.

Conteúdo:
  1. destaque: uma fala marcante da semana
  2. livros citados nos episódios novos (capa no site, quem citou, minuto)
  3. episódios novos
  4. placar de quem mais cita livros (só convidados)

Sem custo de API da Anthropic: só lê o banco e chama o Buttondown.

Configurar no pipeline/.env:
  BUTTONDOWN_API_KEY=...    (buttondown.com/requests)
  AMAZON_TAG=podlibris-20   (opcional: link de afiliado nos livros)

Uso:
    python -m flows.newsletter --simular      # imprime o e-mail, não cria nada
    python -m flows.newsletter                # cria o rascunho no Buttondown
    python -m flows.newsletter --dias 14      # janela diferente de 7 dias
"""

import argparse
import os
import sys
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SITE = "https://podlibris.com"
PODCAST = "Os Sócios Podcast"
# Mesma regra do site (web/lib/podcasts.ts): quem apresenta fica fora do placar
# e o livro deles não vira destaque.
APRESENTADORES = {"Bruno Perini", "Malu Perini"}
MAX_LIVROS = 12
MAX_EPISODIOS = 8


def minuto(seg: int) -> str:
    h, m, s = seg // 3600, (seg % 3600) // 60, seg % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def link_amazon(titulo: str, autor: str | None) -> str:
    termo = f"{titulo} {autor}" if autor else titulo
    url = "https://www.amazon.com.br/s?" + urllib.parse.urlencode({"k": termo, "i": "stripbooks"})
    tag = os.getenv("AMAZON_TAG")
    return f"{url}&tag={urllib.parse.quote(tag)}" if tag else url


def titulo_limpo(titulo: str, numero: str | None) -> str:
    return titulo.rsplit("|", 1)[0].strip() if numero and "|" in titulo else titulo


def carregar(dias: int):
    podcast = next(
        p for p in supabase.table("podcasts").select("id, nome").execute().data
        if p["nome"] == PODCAST
    )
    desde = (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()

    episodios = (
        supabase.table("episodes")
        .select("id, slug, titulo, ep_number, data, link_youtube, processed_at")
        .eq("podcast_id", podcast["id"])
        .eq("status", "done")
        .gte("processed_at", desde)
        .order("data", desc=True)
        .execute()
        .data
    )
    ids = [e["id"] for e in episodios]
    citacoes = []
    for i in range(0, len(ids), 50):
        citacoes += (
            supabase.table("episode_livros")
            .select(
                "episode_id, citacao_literal, quem_citou, timestamp_seg, "
                "livros!inner(slug, titulo, autor, tipo)"
            )
            .in_("episode_id", ids[i:i + 50])
            .eq("livros.tipo", "livro")
            .execute()
            .data
        )

    # placar de todos os tempos, como na estante
    todas = (
        supabase.table("episode_livros")
        .select("quem_citou, episodes!inner(podcast_id), livros!inner(tipo)")
        .eq("episodes.podcast_id", podcast["id"])
        .eq("livros.tipo", "livro")
        .execute()
        .data
    )
    placar = Counter(
        c["quem_citou"].strip() for c in todas
        if c.get("quem_citou") and c["quem_citou"].strip() not in APRESENTADORES
    ).most_common(5)
    return episodios, citacoes, placar


def montar(episodios, citacoes, placar):
    por_ep = {e["id"]: e for e in episodios}
    n_livros_ep = Counter(c["episode_id"] for c in citacoes)

    # livros mais citados na semana primeiro; um bloco por livro
    por_livro: dict[str, list] = {}
    for c in citacoes:
        por_livro.setdefault(c["livros"]["slug"] or c["livros"]["titulo"], []).append(c)
    livros = sorted(por_livro.values(), key=lambda cs: -len(cs))

    # destaque: fala curta de convidado sobre livro que não é da casa
    candidatas = [
        c for c in citacoes
        if c.get("citacao_literal") and 40 <= len(c["citacao_literal"]) <= 280
        and c["livros"]["autor"] not in APRESENTADORES
    ]
    destaque = max(candidatas, key=lambda c: c.get("quem_citou") not in APRESENTADORES, default=None)

    nomes = [cs[0]["livros"]["titulo"] for cs in livros[:2]]
    resto = len(livros) - len(nomes)
    # "Novos na estante" e não "esta semana no programa": enquanto o acervo
    # antigo ainda está entrando, os livros da semana vêm também de episódios
    # antigos recém-mapeados.
    assunto = (
        f"Novos na estante do Os Sócios: {', '.join(nomes)}"
        + (f" e mais {resto} {'livro' if resto == 1 else 'livros'}" if resto > 0 else "")
    )

    md = []
    if destaque:
        ep = por_ep[destaque["episode_id"]]
        quem = destaque.get("quem_citou")
        md += [
            f"> “{destaque['citacao_literal']}”",
            ">",
            f"> — {quem + ', ' if quem else ''}sobre *{destaque['livros']['titulo']}*, "
            f"no #{ep['ep_number'] or ''}",
            "",
        ]

    md += [f"## Os livros da semana ({len(livros)})", ""]
    for cs in livros[:MAX_LIVROS]:
        l = cs[0]["livros"]
        autor = f" — {l['autor']}" if l["autor"] else ""
        md.append(f"**[{l['titulo']}]({SITE}/livro/{l['slug']})**{autor}  ")
        for c in cs[:2]:
            ep = por_ep[c["episode_id"]]
            quem = c.get("quem_citou") or "citado"
            trecho = ""
            if c.get("timestamp_seg") is not None and ep.get("link_youtube"):
                trecho = f" · [▶ ouvir em {minuto(c['timestamp_seg'])}]({ep['link_youtube']}&t={c['timestamp_seg']}s)"
            md.append(f"{quem}, no #{ep['ep_number'] or ''}{trecho}  ")
        md.append(f"[Ver na Amazon]({link_amazon(l['titulo'], l['autor'])})")
        md.append("")
    if len(livros) > MAX_LIVROS:
        md += [f"…e mais {len(livros) - MAX_LIVROS} na [estante]({SITE}/podcast/os-socios).", ""]

    md += [f"## Episódios novos ({len(episodios)})", ""]
    for e in episodios[:MAX_EPISODIOS]:
        n = n_livros_ep.get(e["id"], 0)
        qtd = "nenhum livro" if n == 0 else f"{n} {'livro' if n == 1 else 'livros'}"
        md.append(f"- [#{e['ep_number'] or ''} {titulo_limpo(e['titulo'], e['ep_number'])}]({SITE}/episodio/{e['slug']}) — {qtd}")
    if len(episodios) > MAX_EPISODIOS:
        md.append(f"- …e mais {len(episodios) - MAX_EPISODIOS} na [lista de episódios]({SITE}/episodios)")
    md.append("")

    if placar:
        medalhas = ["🥇", "🥈", "🥉", "4.", "5."]
        md += ["## Quem mais cita livros", ""]
        for (nome, n), m in zip(placar, medalhas):
            md.append(f"{m} [{nome}]({SITE}/podcast/os-socios?pessoa={urllib.parse.quote(nome)}#todos-os-livros) — {n} citações  ")
        md += ["", "*Os apresentadores ficam fora da disputa.*", ""]

    md += [
        "---",
        f"Todos os livros citados no Os Sócios, com o minuto de cada citação: [{SITE.removeprefix('https://')}]({SITE}).",
    ]
    return assunto, "\n".join(md)


def criar_rascunho(assunto: str, corpo: str):
    chave = os.getenv("BUTTONDOWN_API_KEY")
    if not chave:
        sys.exit("Falta BUTTONDOWN_API_KEY no pipeline/.env (buttondown.com/requests).")
    r = requests.post(
        "https://api.buttondown.com/v1/emails",
        headers={"Authorization": f"Token {chave}"},
        # status explícito: sem ele a API pode tratar o e-mail como pronto
        # pra envio. Aqui ele SEMPRE nasce rascunho.
        json={"subject": assunto, "body": corpo, "status": "draft"},
        timeout=30,
    )
    if r.status_code >= 300:
        sys.exit(f"Buttondown recusou ({r.status_code}): {r.text[:300]}")
    dados = r.json()
    status = dados.get("status")
    print(f"Rascunho criado: {assunto}\n  status no Buttondown: {status}")
    if status != "draft":
        print("  ATENÇÃO: o Buttondown não marcou como rascunho — confira no painel antes de qualquer coisa.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--simular", action="store_true", help="só imprime o e-mail")
    p.add_argument("--dias", type=int, default=7)
    args = p.parse_args()

    episodios, citacoes, placar = carregar(args.dias)
    if not episodios:
        print(f"Nenhum episódio novo nos últimos {args.dias} dias — sem e-mail esta semana.")
        return

    assunto, corpo = montar(episodios, citacoes, placar)
    if args.simular:
        print(f"ASSUNTO: {assunto}\n\n{corpo}")
        return
    criar_rascunho(assunto, corpo)


if __name__ == "__main__":
    main()
