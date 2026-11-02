"""
Título em português e em inglês pra cada livro, gravados em `titulo_alt`.

A busca do site lê `titulo_alt`: com os dois títulos, "12 regras" e "12 rules"
acham o mesmo livro. E o backfill de capas tenta cada título alternativo.

O site é em português: livro registrado em inglês que tem edição brasileira
passa a usar o título dela, e o inglês fica em `titulo_original`, mostrado
pequeno embaixo (decisão do Paulo em 02/11/2026; ver `em_portugues`).

Pago (API da Anthropic, Batch). Piloto de 60 livros em 02/11/2026: nenhum erro
contra os pares já conhecidos, ~95 tokens de saída por livro.

Só entra resposta de confiança "alta". O modelo deixa em branco quando não tem
certeza (pedido no prompt), e o que vem em branco não muda nada.

Uso (de dentro de pipeline/):
    python -m flows.titulos_alt --estimar            # grátis (count_tokens)
    python -m flows.titulos_alt --enviar [--novos]   # cria o lote; --novos: só livros ainda não consultados
    python -m flows.titulos_alt --coletar ultimo     # grava quando o lote termina
    python -m flows.titulos_alt --do-cache <arquivo> # regrava a partir da resposta salva
    python -m flows.titulos_alt --duplicatas         # lista pares PT/EN do mesmo autor (só lê)

As duplicatas não são fundidas aqui: a lista vira linhas de ALIASES em
normalize_livros, que roda primeiro sem --apply.
"""

import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase, todas
from transform.claude import client, confere_modelo, MODELO_PADRAO, preco
from flows.normalize_livros import chave_autor, slug_titulo

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RESPOSTAS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas")
POR_PEDIDO = 100
MAX_TOKENS = 16000

SISTEMA = """Você recebe livros citados em podcasts (título como foi registrado e autor). Para cada um, diga:
- "pt": o título da edição publicada no Brasil, exatamente como está na capa. null se não houver edição brasileira ou se você não tiver certeza.
- "en": o título em inglês (original, ou da edição americana/britânica se o original for em outra língua). null se não houver edição em inglês ou se você não tiver certeza.
- "confianca": "alta" ou "baixa".
Não invente: na dúvida, null. Responda só JSON: [{"i": <índice>, "pt": ..., "en": ..., "confianca": ...}]."""


def carrega_livros():
    rows = todas(lambda: supabase.table("livros")
                 .select("id, titulo, autor, titulo_alt, titulo_original, episode_livros(episode_id)")
                 .eq("tipo", "livro").order("id"))
    return [r for r in rows if r["episode_livros"]]


def ja_consultados() -> set[str]:
    """Ids que já passaram por algum lote coletado (piloto incluído)."""
    ids = set()
    for arq in glob.glob(os.path.join(RESPOSTAS, "titulos-*.json")):
        d = json.load(open(arq, encoding="utf-8"))
        for pedido in d.get("pedidos", {}).values():
            ids.update(l["id"] for l in pedido)
        ids.update(l["id"] for l in d.get("amostra", []))
    return ids


def texto_do_pedido(livros):
    return "\n".join(f'{i}. {l["titulo"]} — {l["autor"] or "autor desconhecido"}' for i, l in enumerate(livros))


def pedidos_de(livros):
    return {f"titulos-{k // POR_PEDIDO}": livros[k:k + POR_PEDIDO] for k in range(0, len(livros), POR_PEDIDO)}


def estimar(livros):
    entrada = sum(
        client.messages.count_tokens(model=MODELO_PADRAO, system=SISTEMA,
                                     messages=[{"role": "user", "content": texto_do_pedido(p)}]).input_tokens
        for p in pedidos_de(livros).values()
    )
    saida = len(livros) * 120  # piloto: ~95 por livro, com o raciocínio
    pe, ps = preco()
    usd = (entrada * pe + saida * ps) / 2
    print(f"{len(livros)} livros; entrada {entrada} tokens; saída pior caso {saida}; lote ≈ US$ {usd:.2f}")


def enviar(livros):
    if not livros:
        print("nenhum livro novo: nada a enviar")
        return
    confere_modelo()
    pedidos = pedidos_de(livros)
    lote = client.messages.batches.create(requests=[
        {"custom_id": cid, "params": {
            "model": MODELO_PADRAO, "max_tokens": MAX_TOKENS, "system": SISTEMA,
            "messages": [{"role": "user", "content": texto_do_pedido(p)}],
        }} for cid, p in pedidos.items()
    ])
    arq = os.path.join(RESPOSTAS, f"titulos-{lote.id}.json")
    os.makedirs(RESPOSTAS, exist_ok=True)
    json.dump({"lote": lote.id, "pedidos": {cid: [{"id": l["id"], "titulo": l["titulo"], "autor": l["autor"]} for l in p]
                                            for cid, p in pedidos.items()}},
              open(arq, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"lote {lote.id} enviado: {len(livros)} livros em {len(pedidos)} pedidos. Registro em {arq}")


def ultimo_lote() -> str:
    # o piloto (síncrono) foi convertido pro formato de lote como msgbatch_piloto
    arqs = [a for a in glob.glob(os.path.join(RESPOSTAS, "titulos-msgbatch_*.json"))
            if "-resultado" not in a and "piloto" not in a]
    return json.load(open(max(arqs, key=os.path.getmtime), encoding="utf-8"))["lote"]


def coletar(lote_id: str):
    lote = client.messages.batches.retrieve(lote_id)
    if lote.processing_status != "ended":
        print(f"lote {lote_id} ainda em {lote.processing_status}: {lote.request_counts}")
        return
    resultados = {r.custom_id: r.model_dump(mode="json") for r in client.messages.batches.results(lote_id)}
    # a resposta paga vai pro disco antes do banco
    arq = os.path.join(RESPOSTAS, f"titulos-{lote_id}-resultado.json")
    json.dump(resultados, open(arq, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"resultado salvo em {arq}")
    gravar(lote_id, arq)


def respostas_do(resultado: dict) -> list[dict]:
    if resultado["result"]["type"] != "succeeded":
        return []
    texto = next(c["text"] for c in resultado["result"]["message"]["content"] if c["type"] == "text")
    m = re.search(r"\[.*\]", texto, re.S)
    return json.loads(m.group(0)) if m else []


# Livro escrito em português: a edição em inglês é tradução, e mostrar "The
# Slum" embaixo de "O Cortiço" seria esquisito. Não ganha `titulo_original`.
AUTORES_LUSOFONOS = {
    "Machado de Assis", "Manuel Antônio de Almeida", "Clarice Lispector",
    "Lima Barreto", "Aluísio Azevedo", "Luís de Camões", "Fernando Pessoa",
    "Paulo Coelho", "Euclides da Cunha", "José Saramago", "Laurentino Gomes",
    "Cristiane Correa", "Sidarta Ribeiro",
}


def em_portugues(livro: dict, pt: str | None, en: str | None, titulos_usados: set) -> dict:
    """O site é em português: livro registrado pelo título em inglês que tem
    edição brasileira passa a usar o título dela, e o inglês vai pra
    `titulo_original` (aparece pequeno embaixo). Livro já em português só
    ganha o `titulo_original`. O slug não muda, então o link não quebra."""
    titulo = livro["titulo"]
    campos = {}
    if pt and en and titulo.lower() == en.lower() and pt.lower() != titulo.lower():
        if (pt.lower(), livro["autor"]) in titulos_usados:
            # já existe outro livro com o título em português: é duplicata,
            # vira linha de ALIASES (normalize_livros), não troca aqui
            print(f"  duplicata? {titulo!r} × {pt!r} ({livro['autor']})")
        else:
            campos["titulo"] = titulo = pt
    if (en and en.lower() != titulo.lower() and not livro.get("titulo_original")
            and livro["autor"] not in AUTORES_LUSOFONOS):
        campos["titulo_original"] = en
    return campos


def gravar(lote_id: str, arq_resultado: str):
    registro = json.load(open(os.path.join(RESPOSTAS, f"titulos-{lote_id}.json"), encoding="utf-8"))
    resultados = json.load(open(arq_resultado, encoding="utf-8"))
    atuais = {l["id"]: l for l in carrega_livros()}
    titulos_usados = {(l["titulo"].lower(), l["autor"]) for l in atuais.values()}
    pe, ps = preco()
    usd, falhas, gravados, baixas, trocados = 0.0, [], 0, 0, 0
    for cid, livros in registro["pedidos"].items():
        r = resultados.get(cid)
        if not r or r["result"]["type"] != "succeeded":
            falhas.append(cid)
            continue
        uso = r["result"]["message"]["usage"]
        usd += (uso["input_tokens"] * pe + uso["output_tokens"] * ps) / 2
        for resp in respostas_do(r):
            if resp.get("confianca") != "alta":
                baixas += 1
                continue
            livro = atuais.get(livros[resp["i"]]["id"])
            if not livro:
                continue  # fundido ou apagado depois do envio
            pt, en = ((resp.get(k) or "").strip() or None for k in ("pt", "en"))
            campos = em_portugues(livro, pt, en, titulos_usados)
            titulo = campos.get("titulo", livro["titulo"])
            alt = list(livro["titulo_alt"] or [])
            # variação de maiúscula não entra; a de subtítulo entra ("Sapiens:
            # Uma Breve História da Humanidade" também ajuda a busca). O título
            # antigo, se trocou, fica aqui pra busca continuar achando.
            conhecidos = {t.lower() for t in [titulo, *alt]}
            novos = list({t for t in (pt, en, livro["titulo"]) if t and t.lower() not in conhecidos})
            if novos:
                campos["titulo_alt"] = sorted(set(alt + novos))
                gravados += 1
            if campos:
                supabase.table("livros").update(campos).eq("id", livro["id"]).execute()
                livro.update(campos)  # o piloto e o lote cheio repetem livros
            if "titulo" in campos:
                trocados += 1
                titulos_usados.add((titulo.lower(), livro["autor"]))
    print(f"{gravados} livros ganharam título alternativo; {trocados} passaram pro título em português; "
          f"{baixas} respostas de confiança baixa ignoradas")
    if falhas:
        print(f"pedidos sem resposta: {falhas} (rode --enviar --novos depois)")
    print(f"custo real do lote: US$ {usd:.2f} ≈ R$ {usd * 6:.2f} (câmbio 6)")


def duplicatas():
    """Livros diferentes do mesmo autor que dividem algum título (o principal
    ou um alternativo). Só lista: quem funde é o normalize_livros."""
    livros = carrega_livros()
    por_chave = defaultdict(list)
    for l in livros:
        autor = chave_autor(l["autor"] or "")
        for t in {slug_titulo(x) for x in [l["titulo"], *(l["titulo_alt"] or [])]}:
            if t:
                por_chave[(t, autor)].append(l)
    vistos = set()
    for (t, autor), grupo in sorted(por_chave.items()):
        ids = frozenset(l["id"] for l in grupo)
        if len(ids) < 2 or ids in vistos:
            continue
        vistos.add(ids)
        grupo = sorted({l["id"]: l for l in grupo}.values(), key=lambda l: -len(l["episode_livros"]))
        print(f'    [{", ".join(json.dumps(l["titulo"], ensure_ascii=False) for l in grupo)}],'
              f'  # {grupo[0]["autor"]}; citações: {[len(l["episode_livros"]) for l in grupo]}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--estimar", action="store_true")
    p.add_argument("--enviar", action="store_true")
    p.add_argument("--novos", action="store_true")
    p.add_argument("--coletar")
    p.add_argument("--do-cache")
    p.add_argument("--duplicatas", action="store_true")
    a = p.parse_args()

    if a.duplicatas:
        return duplicatas()
    if a.coletar:
        return coletar(ultimo_lote() if a.coletar == "ultimo" else a.coletar)
    if a.do_cache:
        lote_id = re.search(r"(msgbatch_[^-.]+)", a.do_cache).group(1)
        return gravar(lote_id, a.do_cache)

    livros = carrega_livros()
    if a.novos:
        feitos = ja_consultados()
        livros = [l for l in livros if l["id"] not in feitos]
    if a.estimar:
        return estimar(livros)
    if a.enviar:
        return enviar(livros)
    p.print_help()


if __name__ == "__main__":
    main()
