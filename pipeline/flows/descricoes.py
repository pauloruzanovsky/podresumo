"""
Descrição curta de cada livro (2 ou 3 frases, em português), gravada em
livros.descricao e mostrada na página do livro.

O texto é próprio, escrito pelo Claude da assinatura, sem custo de API. A
sinopse da editora (Google Books, com o Open Library de reserva) serve só de
base: no piloto de 07/11 ela veio em inglês pra metade dos livros e trocou
edição em uns 5 de 20 (Harry Potter virou só o último volume, Bíblia virou
uma tradução específica). Copiá-la também não diferencia o site.

Três passos, cada um retomável:

    python -m flows.descricoes --buscar [--limite N]
        Busca a sinopse dos livros sem descrição e guarda em
        respostas/descricoes/fontes.json. Grátis, mas o Google Books tem cota
        de 1.000 consultas por dia: o acervo inteiro leva alguns dias. Para
        sozinho quando a cota acaba e continua de onde parou.

    python -m flows.descricoes --exportar [--por-lote 40]
        Grava respostas/descricoes/lote_NNN.md com as instruções e os livros.
        O Claude da assinatura lê cada um e escreve lote_NNN.json ao lado:
        {"<id do livro>": "texto" ou null}.

    python -m flows.descricoes --gravar [--refazer]
        Valida todos os .json da pasta e grava no banco os livros ainda sem
        descrição (com --refazer, sobrescreve). Avisa o site no fim.

Requer a migração supabase/migrations/010_livros_descricao.sql.
"""

import argparse
import glob
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase, todas
from flows.backfill_capas import (
    BUSCA, GOOGLE, GOOGLE_KEY, PAUSA, PAUSA_GOOGLE, UA, combina, sem_subtitulo,
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PASTA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas", "descricoes"
)
FONTES = os.path.join(PASTA, "fontes.json")
MIN_SINOPSE = 120     # menos que isso é ficha catalográfica, não sinopse
MAX_SINOPSE = 1500    # o resto não muda o que se escreve e só pesa no prompt
MIN_TEXTO, MAX_TEXTO = 120, 700


class CotaEsgotada(Exception):
    pass


# ───────────────────────────────────────────────────────────── busca ───

def limpa(texto: str) -> str:
    """O Google devolve HTML (<p>, <b>, <br>); aqui vira texto corrido."""
    t = re.sub(r"<br\s*/?>|</p>", "\n", texto, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "", t)).replace("�", "")
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r"[ \t]+", " ", t)).strip()


def _get_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as err:
            if err.code in (403, 429):
                raise CotaEsgotada(err.code)
            if err.code == 503 and tentativa < 2:
                time.sleep(2 * (tentativa + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return None
    return None


def google(titulo: str, autor: str | None) -> dict | None:
    """Sinopse do volume que é o livro certo: em português se houver, e entre
    as do mesmo idioma a mais longa (a primeira edição listada às vezes tem
    uma linha só). Uma consulta por tentativa, pra render a cota."""
    curto = sem_subtitulo(titulo)
    for q in ([f"{curto} {autor}"] if autor else []) + [curto]:
        url = f"{GOOGLE}?" + urllib.parse.urlencode({
            **({"key": GOOGLE_KEY} if GOOGLE_KEY else {}),
            "q": q,
            "maxResults": "20",
            "printType": "books",
            "fields": "items(volumeInfo(title,authors,description,language))",
        })
        dados = _get_json(url) or {}
        time.sleep(PAUSA_GOOGLE)
        candidatos = []
        for item in dados.get("items") or []:
            info = item.get("volumeInfo") or {}
            doc = {"title": info.get("title"), "author_name": info.get("authors")}
            desc = limpa(info.get("description") or "")
            if len(desc) >= MIN_SINOPSE and combina(doc, titulo, autor):
                candidatos.append({"texto": desc, "idioma": info.get("language"),
                                   "fonte": "google", "titulo_fonte": info.get("title")})
        if candidatos:
            return max(candidatos, key=lambda c: (
                (c["idioma"] or "").startswith("pt"), len(c["texto"])))
    return None


def open_library(titulo: str, autor: str | None) -> dict | None:
    params = {"title": titulo, "limit": "5", "fields": "key,title,author_name"}
    if autor:
        params["author"] = autor
    try:
        dados = _get_json(f"{BUSCA}?" + urllib.parse.urlencode(params)) or {}
    except CotaEsgotada:
        return None
    time.sleep(PAUSA)
    for doc in dados.get("docs") or []:
        if not combina(doc, titulo, autor):
            continue
        try:
            obra = _get_json(f"https://openlibrary.org{doc['key']}.json") or {}
        except CotaEsgotada:
            return None
        time.sleep(PAUSA)
        desc = obra.get("description")
        if isinstance(desc, dict):
            desc = desc.get("value")
        desc = limpa(desc or "")
        if len(desc) >= MIN_SINOPSE:
            return {"texto": desc, "idioma": "en", "fonte": "openlibrary",
                    "titulo_fonte": doc.get("title")}
    return None


def titulos_de(livro: dict) -> list[str]:
    vistos = []
    for t in [livro["titulo"], livro.get("titulo_original"), *(livro.get("titulo_alt") or [])]:
        if t and t not in vistos:
            vistos.append(t)
    return vistos


def procura(livro: dict) -> dict | None:
    autor = livro.get("autor")
    for titulo in titulos_de(livro):
        achado = google(titulo, autor)
        if achado:
            return achado
    for titulo in titulos_de(livro):
        achado = open_library(titulo, autor)
        if achado:
            return achado
    return None


# ──────────────────────────────────────────────────────────── acervo ───

def carrega_fontes() -> dict:
    if not os.path.exists(FONTES):
        return {}
    with open(FONTES, encoding="utf-8") as f:
        return json.load(f)


def salva_fontes(fontes: dict):
    os.makedirs(PASTA, exist_ok=True)
    tmp = FONTES + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(fontes, f, ensure_ascii=False, indent=1)
    os.replace(tmp, FONTES)


def livros_do_site() -> list[dict]:
    try:
        livros = todas(lambda: supabase.table("livros").select(
            "id, titulo, autor, titulo_original, titulo_alt, descricao, episode_livros(episode_id)"
        ).eq("tipo", "livro").order("id"))
    except Exception as err:
        if "descricao" in str(err):
            sys.exit("A coluna `descricao` não existe. Rode "
                     "supabase/migrations/010_livros_descricao.sql antes.")
        raise
    # mais citados primeiro: são as páginas que mais recebem visita
    livros = [l for l in livros if l.get("episode_livros")]
    livros.sort(key=lambda l: -len(l["episode_livros"]))
    return livros


def respostas() -> dict:
    """Todas as descrições já escritas, de todos os lotes (o último vence)."""
    todas_ = {}
    for caminho in sorted(glob.glob(os.path.join(PASTA, "*.json"))):
        if os.path.basename(caminho) == "fontes.json":
            continue
        try:
            with open(caminho, encoding="utf-8") as f:
                todas_.update(json.load(f))
        except (json.JSONDecodeError, OSError) as err:
            print(f"  ignorado {os.path.basename(caminho)}: {err}")
    return todas_


# ──────────────────────────────────────────────────────────── passos ───

def buscar(limite: int | None):
    fontes = carrega_fontes()
    alvos = [l for l in livros_do_site() if not l.get("descricao") and l["id"] not in fontes]
    if limite:
        alvos = alvos[:limite]
    print(f"=== SINOPSES: {len(alvos)} livros a consultar ===\n")
    achou = 0
    try:
        for i, livro in enumerate(alvos, 1):
            achado = procura(livro)
            fontes[livro["id"]] = achado
            achou += bool(achado)
            marca = f"{achado['fonte'][:6]:6} {achado['idioma'] or '?':5}" if achado else "--          "
            print(f"  [{i:>4}/{len(alvos)}] {marca} {livro['titulo'][:55]}")
            if i % 25 == 0:
                salva_fontes(fontes)
    except CotaEsgotada:
        print("\nGoogle Books recusou (cota do dia acabou). Rodar de novo amanhã continua daqui.")
    salva_fontes(fontes)
    print(f"\n=== {achou} sinopses novas; {len(fontes)} livros já consultados ===")


INSTRUCOES = """\
# Descrições de livros do Podlibris

O Podlibris (podlibris.com) lista os livros citados em podcasts. Cada livro
abaixo precisa de uma descrição curta pra página dele.

Escreva em português do Brasil, 2 ou 3 frases, entre 200 e 450 caracteres:
do que o livro trata e quem escreveu (com uma palavra sobre quem é, se
ajudar). Tom de quem explica a um amigo: informativo, frases corridas,
sem frase de efeito, sem adjetivo de propaganda ("imperdível", "best-seller
mais comentado"), sem "neste livro", sem spoiler de ficção além da premissa.

A sinopse da editora, quando existe, é só base: não traduza nem copie,
reescreva com suas palavras. Ela às vezes é de OUTRA edição ou de outro livro
(o último volume de uma série, uma versão resumida, um guia de estudo):
confira com o título e o autor e ignore o que não bater. Quando o título é
uma série ou uma obra clássica (Harry Potter, Bíblia), descreva o conjunto.

Sem sinopse, escreva só se você conhece bem o livro. Na dúvida, ou se o
título parece não ser um livro de verdade, responda null. Descrição errada
é pior que nenhuma. Não invente dado (ano, prêmio, número de vendas) que
você não tenha certeza.

Responda gravando {arquivo} nesta mesma pasta, só com um objeto JSON
{{"<id>": "texto" ou null}}, uma chave para cada livro abaixo.

"""


def exportar(por_lote: int):
    fontes = carrega_fontes()
    feitas = respostas()
    # só quem já passou pela busca: livro ainda não consultado iria como
    # "sem sinopse" e acabaria null sem ter tido a chance
    alvos = [l for l in livros_do_site()
             if not l.get("descricao") and l["id"] not in feitas and l["id"] in fontes]
    # lote já exportado e ainda sem resposta não sai de novo
    pendentes = set()
    for md in glob.glob(os.path.join(PASTA, "lote_*.md")):
        if not os.path.exists(md[:-3] + ".json"):
            with open(md, encoding="utf-8") as f:
                pendentes.update(re.findall(r"^## (\S+)$", f.read(), flags=re.M))
    alvos = [l for l in alvos if l["id"] not in pendentes]
    if not alvos:
        print("Nada a exportar: todo livro já tem descrição ou resposta.")
        return
    os.makedirs(PASTA, exist_ok=True)
    existentes = glob.glob(os.path.join(PASTA, "lote_*.md"))
    numero = 1 + max((int(re.findall(r"\d+", os.path.basename(p))[0]) for p in existentes), default=0)
    criados = 0
    for inicio in range(0, len(alvos), por_lote):
        nome = f"lote_{numero:03d}"
        partes = [INSTRUCOES.format(arquivo=f"{nome}.json")]
        for l in alvos[inicio:inicio + por_lote]:
            fonte = fontes.get(l["id"])
            partes.append(f"## {l['id']}\n")
            partes.append(f"Título: {l['titulo']}")
            if l.get("titulo_original"):
                partes.append(f"Título original: {l['titulo_original']}")
            partes.append(f"Autor: {l.get('autor') or '(não citado no episódio)'}")
            if fonte:
                partes.append(f"Sinopse da editora ({fonte.get('titulo_fonte')}):\n"
                              f"{fonte['texto'][:MAX_SINOPSE]}")
            else:
                partes.append("Sinopse da editora: (não encontrada)")
            partes.append("")
        with open(os.path.join(PASTA, f"{nome}.md"), "w", encoding="utf-8") as f:
            f.write("\n".join(partes))
        numero += 1
        criados += 1
    sem_fonte = sum(1 for l in alvos if not fontes.get(l["id"]))
    print(f"{criados} lotes em {PASTA} ({len(alvos)} livros, {sem_fonte} sem sinopse de base)")


def valida(texto) -> str | None:
    if texto is None:
        return None
    if not isinstance(texto, str):
        raise ValueError("não é texto")
    t = " ".join(texto.split())
    if not MIN_TEXTO <= len(t) <= MAX_TEXTO:
        raise ValueError(f"{len(t)} caracteres")
    if "<" in t or "neste livro" in t.lower():
        raise ValueError("HTML ou fórmula proibida")
    return t


def gravar(refazer: bool):
    livros = {l["id"]: l for l in livros_do_site()}
    gravados = invalidos = 0
    for id_, texto in respostas().items():
        livro = livros.get(id_)
        if not livro or (livro.get("descricao") and not refazer):
            continue
        try:
            t = valida(texto)
        except ValueError as err:
            print(f"  inválida ({err}): {livro['titulo'][:50]}")
            invalidos += 1
            continue
        if t is None:
            continue
        # O plano grátis do Supabase engasga com centenas de updates seguidos
        # (522 do Cloudflare em 08/11): pausa curta e nova tentativa.
        for tentativa in range(4):
            try:
                supabase.table("livros").update({"descricao": t}).eq("id", id_).execute()
                break
            except Exception as err:
                if tentativa == 3:
                    print(f"\nBanco não respondeu ({str(err)[:80]}). Rodar de novo continua daqui.")
                    return
                time.sleep(10 * (tentativa + 1))
        time.sleep(0.15)
        gravados += 1
        livro["descricao"] = t
    com = sum(1 for l in livros.values() if l.get("descricao"))
    print(f"\n=== {gravados} gravadas, {invalidos} inválidas; "
          f"acervo com descrição: {com}/{len(livros)} ===")
    if gravados:
        from flows.atualizar_site import main as atualizar_site
        atualizar_site()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--buscar", action="store_true", help="busca as sinopses de base")
    g.add_argument("--exportar", action="store_true", help="grava os lotes pra assinatura")
    g.add_argument("--gravar", action="store_true", help="valida e grava as descrições")
    p.add_argument("--limite", type=int, help="--buscar: só os N primeiros")
    p.add_argument("--por-lote", type=int, default=40)
    p.add_argument("--refazer", action="store_true", help="--gravar: sobrescreve")
    args = p.parse_args()

    if args.buscar:
        buscar(args.limite)
    elif args.exportar:
        exportar(args.por_lote)
    else:
        gravar(args.refazer)


if __name__ == "__main__":
    main()
