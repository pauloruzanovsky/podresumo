"""
Reprocessa episódios já salvos com o extrator atual, via Batch API.

Por que lote: a sync é assíncrona por natureza (ninguém espera a resposta), e
a Batch API custa metade. Em troca o resultado leva de minutos a algumas horas.

Por que reprocessar: os episódios no banco foram extraídos com Haiku e com a
transcrição cortada em 150 mil caracteres — 29 dos 66 perderam o final. Num
teste direto, o mesmo episódio rendeu 2 obras no extrator antigo e 12 no atual.

As transcrições estão salvas em `episodes.transcricao`, então isto não depende
do YouTube (que bloqueia IP de datacenter).

Uso:
    python -m flows.reprocessar_batch --estimar        # custo, sem enviar
    python -m flows.reprocessar_batch --enviar [--limite N]
    python -m flows.reprocessar_batch --coletar <batch_id>
"""

import argparse
import json
import os
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from anthropic import Anthropic

from extract.youtube import fetch_descricoes
from load.supabase import grava_campos_ia, supabase, upsert_livros
from transform.claude import (
    MODELO_PADRAO, VERSAO_PROMPT, extrai_json, extrator, monta_params,
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Opus 5: US$5/M entrada, US$25/M saída. Em lote, metade dos dois.
USD_IN, USD_OUT = 5 / 1_000_000, 25 / 1_000_000
DESCONTO_LOTE = 0.5
USD_BRL = 5.5

# Toda resposta paga da API é salva aqui assim que chega, antes de qualquer
# gravação no banco. Assim, uma falha na gravação, uma mudança de ideia ou a
# vontade de reler o resultado nunca obriga a pagar a chamada de novo.
CACHE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas"
)


def salva_resposta(ep_id: str, mensagem, dados: dict):
    """Salva a resposta ANTES de qualquer validação ou gravação. Se o JSON
    vier quebrado ou truncado, `dados` fica vazio mas o texto bruto fica em
    disco — a chamada foi cobrada do mesmo jeito, e dá pra ver o que saiu."""
    os.makedirs(CACHE, exist_ok=True)
    bruto = next((b.text for b in mensagem.content if b.type == "text"), "")
    with open(os.path.join(CACHE, f"{ep_id}.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "dados": dados,
                "bruto": None if dados else bruto,
                "modelo": mensagem.model,
                "extrator": extrator(),
                "stop_reason": mensagem.stop_reason,
                "salvo_em": time.strftime("%Y-%m-%d %H:%M:%S"),
                "tokens_in": mensagem.usage.input_tokens,
                "tokens_out": mensagem.usage.output_tokens,
            },
            f, ensure_ascii=False, indent=2,
        )


def respostas_salvas(limite=None):
    """Lê o cache, na ordem dos episódios mais recentes, só os que existem."""
    por_id = {e["id"]: e for e in episodios()}
    achados = []
    for ep_id, ep in por_id.items():
        caminho = os.path.join(CACHE, f"{ep_id}.json")
        if os.path.exists(caminho):
            with open(caminho, encoding="utf-8") as f:
                salvo = json.load(f)
            if salvo["dados"]:  # resposta que falhou fica no disco, mas não é gravada
                achados.append((ep, salvo))
    return achados[:limite] if limite else achados


def grava_do_cache(limite=None):
    """Grava no banco o que já foi pago e salvo. Não chama a API."""
    achados = respostas_salvas(limite)
    print(f"=== GRAVANDO DO CACHE ({len(achados)} episódios, sem custo) ===\n")
    temas_renovados = set()
    for ep, salvo in achados:
        dados = salvo["dados"]
        # Arquivo sem o campo é do piloto, anterior ao tracking: prompt v2.
        grava_campos_ia(
            ep["id"], dados,
            extrator=salvo.get("extrator") or f"{MODELO_PADRAO}/v2",
            extraido_em=salvo.get("salvo_em"),
        )
        n = upsert_livros(ep["id"], dados.get("livros", []),
                          substituir=True, temas_renovados=temas_renovados)
        print(f"  OK {ep['titulo'][:50]} — {n} obras")


def confere_schema():
    """Para antes de gastar ou gravar se o banco não tem as colunas que a
    extração preenche. Sem isto o erro só aparecia na gravação, com o lote
    já pago."""
    try:
        supabase.table("episodes").select(
            "capitulos, frases, convidados_info, extrator, extraido_em"
        ).limit(1).execute()
        supabase.table("episode_livros").select(
            "citacao_literal, quem_citou, natureza"
        ).limit(1).execute()
    except Exception as e:
        sys.exit(
            "Faltam colunas no banco. Rode no SQL Editor do Supabase as "
            "migrações 004_citacao_rica.sql, 005_extras_episodio.sql e "
            "006_tracking_extracao.sql "
            f"(supabase/migrations/).\nDetalhe: {e}"
        )


def episodios(limite=None, podcast=None, pendentes=False, novos=False):
    """Episódios com transcrição salva, do mais recente pro mais antigo.

    podcast: trecho do nome ("socios"); None = todos.
    novos: só os `pending` — transcrição baixada, nunca extraídos.
    pendentes: só os que ainda não foram extraídos com a versão atual do
        prompt — é o que evita pagar duas vezes pelo mesmo episódio quando o
        acervo cresce em levas.
    """
    # `pending` = transcrição baixada por baixar_transcricoes, ainda sem
    # extração. Vira `done` quando o resultado é gravado.
    consulta = supabase.table("episodes").select(
        "id, titulo, transcricao, extrator, podcast_id"
    ).in_("status", ["pending"] if novos else ["done", "pending"])

    if podcast:
        consulta = consulta.eq("podcast_id", acha_podcast(podcast)["id"])

    eps = [
        e for e in consulta.order("data", desc=True).execute().data
        if (e.get("transcricao") or "").strip()
    ]
    if pendentes:
        atual = f"/{VERSAO_PROMPT}"
        eps = [e for e in eps if not (e.get("extrator") or "").endswith(atual)]
    return eps[:limite] if limite else eps


def acha_podcast(trecho: str) -> dict:
    """O podcast cujo nome contém o trecho. Para se casar com mais de um ou
    com nenhum, em vez de adivinhar."""
    achados = [
        p for p in supabase.table("podcasts").select("id, nome").execute().data
        if sem_acento(trecho) in sem_acento(p["nome"])
    ]
    if len(achados) != 1:
        sys.exit(f"--podcast '{trecho}' casou com {len(achados)} podcasts: "
                 f"{[p['nome'] for p in achados]}")
    print(f"podcast: {achados[0]['nome']}")
    return achados[0]


def params(eps):
    """Parâmetros da requisição de cada episódio, na mesma ordem. Busca as
    descrições no YouTube (grátis) numa leva só: elas não ficam no banco."""
    descricoes = fetch_descricoes([e["id"] for e in eps])
    sem = [e["titulo"][:40] for e in eps if not descricoes.get(e["id"])]
    if sem:
        print(f"aviso: {len(sem)} episódio(s) sem descrição no YouTube: {sem}")
    return [
        monta_params(e["transcricao"], e["titulo"], descricao=descricoes.get(e["id"]))
        for e in eps
    ]


def sem_acento(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )


# ─────────────────────────────────────────────── estimativa ───

def estimar(eps):
    print(f"=== ESTIMATIVA ({len(eps)} episódios) ===\n")
    total_in = 0
    for p in params(eps):
        total_in += client.messages.count_tokens(
            model=p["model"],
            system=p["system"],
            messages=p["messages"],
        ).input_tokens

    # Saída medida no teste do Sonnet: ~1,7k tokens. Faixa generosa pro Opus,
    # que pensa mais antes de responder.
    print(f"tokens de entrada: {total_in:,}")
    for saida in (2_000, 5_000):
        usd = (total_in * USD_IN + len(eps) * saida * USD_OUT) * DESCONTO_LOTE
        print(f"  com {saida:,} tokens de saída/ep: "
              f"US$ {usd:.2f}  (R$ {usd * USD_BRL:.2f})")
    print("\n(já com os 50% de desconto do lote)")


# ──────────────────────────────────────────────────── envio ───

def enviar(eps):
    print(f"=== ENVIANDO LOTE ({len(eps)} episódios) ===\n")
    requests = [
        # o id do episódio é o video id do YouTube
        {"custom_id": e["id"], "params": p}
        for e, p in zip(eps, params(eps))
    ]

    lote = client.messages.batches.create(requests=requests)
    print(f"batch_id: {lote.id}")
    print(f"status:   {lote.processing_status}")
    print(f"\nGuarde o batch_id. Pra buscar o resultado depois:")
    print(f"  python -m flows.reprocessar_batch --coletar {lote.id}")
    return lote.id


# ─────────────────────────────────────────────────── coleta ───

def aguardar(batch_id, intervalo=60):
    while True:
        lote = client.messages.batches.retrieve(batch_id)
        c = lote.request_counts
        if lote.processing_status == "ended":
            print(f"\nlote concluído: {c.succeeded} ok, {c.errored} erro, "
                  f"{c.canceled} cancelado, {c.expired} expirado")
            return lote
        print(f"  {lote.processing_status}: {c.processing} processando, "
              f"{c.succeeded} prontos")
        time.sleep(intervalo)


def coletar(batch_id):
    aguardar(batch_id)

    titulos = {e["id"]: e["titulo"] for e in episodios()}
    ok = falhas = 0
    total_livros = 0
    tokens_in = tokens_out = 0
    temas_renovados = set()

    print("\n=== GRAVANDO ===")
    for resultado in client.messages.batches.results(batch_id):
        ep_id = resultado.custom_id
        titulo = titulos.get(ep_id, ep_id)[:50]

        if resultado.result.type != "succeeded":
            print(f"  X  {titulo} — {resultado.result.type}")
            falhas += 1
            continue

        mensagem = resultado.result.message
        tokens_in += mensagem.usage.input_tokens
        tokens_out += mensagem.usage.output_tokens

        dados = extrai_json(mensagem)
        salva_resposta(ep_id, mensagem, dados)
        if not dados:
            print(f"  X  {titulo} — resposta sem JSON (texto bruto salvo)")
            falhas += 1
            continue

        grava_campos_ia(ep_id, dados, extrator())
        n = upsert_livros(ep_id, dados.get("livros", []),
                          substituir=True, temas_renovados=temas_renovados)
        total_livros += n
        ok += 1
        print(f"  OK {titulo} — {n} obras")

    custo = (tokens_in * USD_IN + tokens_out * USD_OUT) * DESCONTO_LOTE
    print(f"\n=== RESULTADO ===")
    print(f"  episódios gravados: {ok}  |  falhas: {falhas}")
    print(f"  citações gravadas:  {total_livros}")
    print(f"  tokens: {tokens_in:,} entrada / {tokens_out:,} saída")
    print(f"  custo real: US$ {custo:.2f}  (R$ {custo * USD_BRL:.2f})")
    print("\nAgora rode, nesta ordem:")
    print("  python -m flows.normalize_livros          # confira o plano")
    print("  python -m flows.normalize_livros --apply")
    print("  python -m flows.backfill_capas")
    print("\nNÃO rode backfill_temas: ele sobrescreve livros.temas com as tags")
    print("dos episódios, que é justamente o que a extração veio substituir.")


# ─────────────────────────────────────────────────── síncrono ───

def sincrono(eps, gravar=False):
    """Chamada normal da API, sem desconto de lote (preço cheio), mas com
    resposta em minutos. Serve de piloto. Por padrão não grava: só mostra o
    que seria gravado, pra conferir a qualidade antes de tocar no banco."""
    print(f"=== SÍNCRONO ({len(eps)} episódios, gravar={gravar}) ===\n")
    tokens_in = tokens_out = 0
    temas_renovados = set()
    for e, p in zip(eps, params(eps)):
        titulo = e["titulo"][:60]
        msg = client.messages.create(**p)
        tokens_in += msg.usage.input_tokens
        tokens_out += msg.usage.output_tokens
        dados = extrai_json(msg)
        salva_resposta(e["id"], msg, dados)
        if not dados:
            print(f"  X  {titulo} — sem JSON (texto bruto salvo)")
            continue

        livros = dados.get("livros", [])
        print(f"\n  {titulo} — {len(livros)} obras")
        print(f"    insight: {dados.get('main_insight', '')}")
        for l in livros:
            print(f"    - [{l.get('natureza')}] {l.get('titulo')} "
                  f"({l.get('autor')}) {l.get('timestamp')} "
                  f"· {l.get('quem_citou')}")
            print(f"        \"{l.get('citacao_literal')}\"")
            print(f"        temas: {l.get('temas')}")

        if gravar:
            grava_campos_ia(e["id"], dados, extrator())
            upsert_livros(e["id"], livros, substituir=True,
                          temas_renovados=temas_renovados)

    custo = tokens_in * USD_IN + tokens_out * USD_OUT  # sem desconto de lote
    print(f"\n=== CUSTO REAL ===")
    print(f"  tokens: {tokens_in:,} entrada / {tokens_out:,} saída")
    print(f"  US$ {custo:.2f}  (R$ {custo * USD_BRL:.2f})")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--do-cache", action="store_true",
                   help="grava no banco as respostas já salvas, sem chamar a API")
    p.add_argument("--sincrono", action="store_true",
                   help="chamada normal (preço cheio); use com --limite")
    p.add_argument("--gravar", action="store_true",
                   help="com --sincrono, grava no banco (padrão: só mostra)")
    p.add_argument("--estimar", action="store_true", help="só calcula o custo")
    p.add_argument("--enviar", action="store_true", help="cria o lote")
    p.add_argument("--coletar", metavar="BATCH_ID", help="aguarda e grava o resultado")
    p.add_argument("--limite", type=int, help="processa só os N mais recentes")
    p.add_argument("--podcast", help='só este podcast (trecho do nome, ex.: "socios")')
    p.add_argument("--pendentes", action="store_true",
                   help=f"só os ainda não extraídos com o prompt {VERSAO_PROMPT}")
    p.add_argument("--novos", action="store_true",
                   help="só os que nunca foram extraídos (status pending)")
    p.add_argument("--exceto", nargs="+", default=[], metavar="ID",
                   help="ids de episódio a deixar de fora")
    args = p.parse_args()

    def alvo():
        eps = episodios(None, args.podcast, args.pendentes, args.novos)
        eps = [e for e in eps if e["id"] not in args.exceto]
        return eps[:args.limite] if args.limite else eps

    # Antes de qualquer coisa, inclusive da estimativa: a seleção dos
    # episódios já lê a coluna de tracking.
    confere_schema()

    if args.do_cache:
        grava_do_cache(args.limite)
    elif args.sincrono:
        sincrono(alvo(), gravar=args.gravar)
    elif args.coletar:
        coletar(args.coletar)
    elif args.enviar:
        enviar(alvo())
    else:
        estimar(alvo())


if __name__ == "__main__":
    main()
