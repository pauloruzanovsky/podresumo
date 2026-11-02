"""
Relatório semanal do que precisa de decisão humana. Só lê: não muda o banco e
não gasta API da Anthropic. Grava `respostas/pendencias.json`, que a rotina de
segunda publica na página privada do Paulo.

`--rotinas <arquivo>` recebe a última execução de cada rotina, que só o app do
Claude sabe: [{"nome": "...", "ultima": "ISO", "limite_horas": 36}]. Sem ele, a
seção avisa que não foi conferida, em vez de dizer que está tudo bem.

Uso:
    python -m flows.pendencias [--rotinas respostas/rotinas.json]
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract.youtube import fetch_episodes
from flows.normalize_pessoas import CANONICO, PESSOAS_DIFERENTES
from load.supabase import supabase, todas
from transform.claude import preco

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESPOSTAS = os.path.join(RAIZ, "respostas")
SAIDA = os.path.join(RESPOSTAS, "pendencias.json")
PLAYLIST_SOCIOS = "PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf"
USD_BRL = 5.5
DESCONTO_LOTE = 0.5
CAPAS_NA_LISTA = 5
SUSPEITAS_NA_LISTA = 15
# Só a extração da semana e só o `contexto`, com artigo antes da palavra ("o
# artigo", "um ensaio"): solta na fala, "filme" pegava "o livro que virou
# filme", e a lista vinha com 67 itens, quase todos livros de verdade.
DIAS_SUSPEITAS = 8
NAO_E_LIVRO = re.compile(
    r"\b(?:o|a|um|uma|esse|essa|este|esta|do|da|no|na|ao|à|pelo|pela)\s+"
    r"(artigo|ensaio|cr[oô]nica|filme|s[eé]rie|document[aá]rio|discurso|reportagem|minuss[eé]rie)\b",
    re.I,
)


E_LIVRO = re.compile(r"\b(livros?|obras?|biografia|romance|autobiografia)\b", re.I)


def linha(secao, gravidade, titulo, detalhe, acao=""):
    """gravidade: "agir", "decidir", "ok" ou "info"."""
    return {"secao": secao, "gravidade": gravidade, "titulo": titulo, "detalhe": detalhe, "acao": acao}


def chave_nome(nome):
    t = unicodedata.normalize("NFD", nome.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"\b(dr|dra|prof|profa|professor|professora)\b\.?", " ", t)
    return re.sub(r"[^a-z0-9 ]+", "", t.replace("-", " ")).split()


def parecidos(a, b):
    ca, cb = chave_nome(a), chave_nome(b)
    if not ca or not cb:
        return False
    if "".join(ca) == "".join(cb):
        return True
    if ca[0] != cb[0]:
        return False
    return (
        SequenceMatcher(None, " ".join(ca), " ".join(cb)).ratio() >= 0.86
        or (len(ca) != len(cb) and ca[-1] == cb[-1])
    )


def rotinas(caminho):
    secao = "Rotinas"
    if not caminho or not os.path.exists(caminho):
        return [linha(secao, "decidir", "Rotinas não conferidas", "O relatório não recebeu a última execução de cada rotina.")]
    agora = datetime.now(timezone.utc)
    saida = []
    for r in json.load(open(caminho, encoding="utf-8")):
        if not r.get("ultima"):
            saida.append(linha(secao, "agir", r["nome"], "Nunca rodou.", "Abra o app do Claude no horário da rotina, ou rode à mão."))
            continue
        ultima = datetime.fromisoformat(r["ultima"].replace("Z", "+00:00"))
        horas = (agora - ultima).total_seconds() / 3600
        quando = f"Última execução há {horas / 24:.1f} dias" if horas >= 48 else f"Última execução há {horas:.0f} horas"
        atrasada = horas > r["limite_horas"]
        saida.append(linha(secao, "agir" if atrasada else "ok", r["nome"], quando,
                           "Abra o app do Claude no horário da rotina, ou rode à mão." if atrasada else ""))
    return saida


def episodios():
    secao = "Episódios"
    saida = []
    no_banco = {
        e["id"]: e["status"]
        for e in todas(lambda: supabase.table("episodes").select("id, status").order("id"))
    }
    faltam = [e for e in fetch_episodes(PLAYLIST_SOCIOS, 10) if no_banco.get(e["video_id"]) != "done"]
    for e in faltam:
        status = no_banco.get(e["video_id"], "fora do banco")
        saida.append(linha(secao, "agir", f"#{e['ep_number']} {e['titulo'][:80]}", f"{e['data']} · {status}", "Rodar o lote da semana."))
    if os.path.exists(os.path.join(RESPOSTAS, "ultimo_lote.txt")):
        saida.append(linha(secao, "agir", "Lote enviado e não coletado", "Existe `ultimo_lote.txt`.", "Rodar a coleta."))
    if not saida:
        saida.append(linha(secao, "ok", "Os Sócios em dia", "Os 10 episódios mais recentes da playlist estão no site."))
    return saida


def nomes():
    secao = "Nomes"
    cont = Counter()
    for r in todas(lambda: supabase.table("episode_livros").select("episode_id, livro_id, quem_citou").order("episode_id").order("livro_id")):
        if (r.get("quem_citou") or "").strip():
            cont[r["quem_citou"].strip()] += 1
    for e in todas(lambda: supabase.table("episodes").select("id, convidados").eq("status", "done").order("id")):
        for c in e.get("convidados") or []:
            if c.strip():
                cont[c.strip()] += 1
    for l in todas(lambda: supabase.table("livros").select("id, autor").eq("tipo", "livro").order("id")):
        if l.get("autor"):
            cont[l["autor"].strip()] += 1

    lista = sorted(n for n in cont if n not in CANONICO)
    saida = []
    for i, a in enumerate(lista):
        for b in lista[i + 1:]:
            if {a, b} not in PESSOAS_DIFERENTES and parecidos(a, b):
                saida.append(linha(secao, "decidir", f"{a} / {b}", f"{cont[a]} e {cont[b]} menções",
                                   "Se for a mesma pessoa, diga a grafia certa."))
    return saida or [linha(secao, "ok", "Nenhum nome parecido novo", "Nada a unificar.")]


def capas():
    secao = "Capas"
    livros = [
        l for l in todas(lambda: supabase.table("livros").select("titulo, autor, capa_url, episode_livros(episode_id)").eq("tipo", "livro").order("id"))
        if l.get("episode_livros")
    ]
    sem = sorted((l for l in livros if not l.get("capa_url")), key=lambda l: -len(l["episode_livros"]))
    saida = [linha(secao, "info", f"{len(sem)} de {len(livros)} livros sem capa real", f"{100 * (len(livros) - len(sem)) // max(len(livros), 1)}% têm capa.")]
    for l in sem[:CAPAS_NA_LISTA]:
        saida.append(linha(secao, "info", l["titulo"], f"{l.get('autor') or 'sem autor'} · {len(l['episode_livros'])} citações",
                           "Mais citado sem capa: vale a capa manual."))
    return saida


def suspeitas():
    secao = "Obras suspeitas"
    desde = (datetime.now() - timedelta(days=DIAS_SUSPEITAS)).isoformat()
    rels = todas(lambda: (
        supabase.table("episode_livros")
        .select("episode_id, livro_id, citacao_literal, contexto, livros!inner(titulo, tipo), episodes!inner(titulo, extraido_em)")
        .eq("livros.tipo", "livro")
        .gte("episodes.extraido_em", desde)
        .order("episode_id")
        .order("livro_id")
    ))
    achadas = []
    for r in rels:
        contexto = r.get("contexto") or ""
        # "o filme superou o livro" fala de um livro: só resta o que não se diz livro
        if NAO_E_LIVRO.search(contexto) and not E_LIVRO.search(contexto):
            achadas.append(linha(secao, "decidir", r["livros"]["titulo"], contexto[:150],
                                 "Ler a fala; se não for livro, marcar como outro."))
    extra = len(achadas) - SUSPEITAS_NA_LISTA
    saida = achadas[:SUSPEITAS_NA_LISTA]
    if extra > 0:
        saida.append(linha(secao, "info", f"Mais {extra} não listadas", "Mostrando as primeiras."))
    return saida or [linha(secao, "ok", "Nenhuma obra suspeita", f"Extrações dos últimos {DIAS_SUSPEITAS} dias.")]


def custo():
    secao = "Custo"
    desde = datetime.now() - timedelta(days=7)
    usd_in, usd_out = preco()
    total, n = 0.0, 0
    for nome in os.listdir(RESPOSTAS):
        if not nome.endswith(".json") or nome == "pendencias.json":
            continue
        try:
            r = json.load(open(os.path.join(RESPOSTAS, nome), encoding="utf-8"))
            quando = datetime.strptime(r["salvo_em"], "%Y-%m-%d %H:%M:%S")
        except (KeyError, ValueError, TypeError, AttributeError):
            continue  # arquivos sem o registro da extração
        if quando >= desde:
            total += (r["tokens_in"] * usd_in + r["tokens_out"] * usd_out) * DESCONTO_LOTE * USD_BRL
            n += 1
    return [linha(secao, "info", f"R$ {total:.2f} em extrações nos últimos 7 dias", f"{n} episódios. Estimativa pelo preço de lote; dólar a R$ {USD_BRL:.2f}.")]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--rotinas", help="JSON com a última execução de cada rotina")
    args = p.parse_args()

    linhas = [*rotinas(args.rotinas), *episodios(), *nomes(), *capas(), *suspeitas(), *custo()]
    for i, l in enumerate(linhas):
        l["id"] = i + 1
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"rows": linhas}, f, ensure_ascii=False, indent=1)

    cont = Counter(l["gravidade"] for l in linhas)
    print(f"{len(linhas)} linhas: {cont['agir']} pra agir, {cont['decidir']} pra decidir")
    for l in linhas:
        print(f"  [{l['gravidade']}] {l['secao']}: {l['titulo']} | {l['detalhe'][:100]}")


if __name__ == "__main__":
    main()
