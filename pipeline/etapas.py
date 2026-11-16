"""
Log único das etapas do pipeline: uma linha JSON por acontecimento, em
`respostas/etapas.jsonl` (gitignored). O painel (flows.painel) marca os checks
a partir daqui, em vez de deduzir do banco.

Cada linha tem `at` (hora local com fuso) e `tipo`. Os tipos:

    download          uma rodada de baixar_transcricoes (podcast, salvos, bloqueio, proxy)
    transcricao       um episódio baixado (id, via: direta|proxy)
    extracao          um episódio extraído e gravado (id, extrator)
    lote_enviado      lote da API enviado (batch_id, n)
    lote_coletado     lote da API gravado (batch_id, ok, falhas, custo_brl)
    assinatura        rodada de --do-assinatura (ok, falhas)
    slugs             episódios que ganharam endereço (episodios: [ids])
    capas             rodada de backfill_capas (consultados, achados)
    deploy            pedido de deploy à Vercel (ok)
    newsletter_rascunho / newsletter_enviada   (id, assunto)
    leva, leva_fim, info, aviso, falha, cota, sem_transcricao   acervo (area: "acervo")

Gravar nunca derruba quem chamou: o log é acompanhamento, não dado.
Até 16/11/2026 o acervo tinha log próprio (respostas/acervo/log.jsonl); ele
continua sendo lido como histórico, sem escrever mais nele.
"""

import json
import os
from datetime import datetime, timezone

RESPOSTAS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "respostas")
ARQUIVO = os.path.join(RESPOSTAS, "etapas.jsonl")
ANTIGO_ACERVO = os.path.join(RESPOSTAS, "acervo", "log.jsonl")


def agora() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def registra(tipo: str, **campos):
    try:
        os.makedirs(RESPOSTAS, exist_ok=True)
        with open(ARQUIVO, "a", encoding="utf-8") as f:
            f.write(json.dumps({"at": agora(), "tipo": tipo, **campos}, ensure_ascii=False) + "\n")
    except Exception as erro:  # o log nunca para o pipeline
        print(f"  (log de etapas não gravado: {erro})")


def _le(caminho: str) -> list[dict]:
    if not os.path.exists(caminho):
        return []
    with open(caminho, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def eventos() -> list[dict]:
    """Tudo, em ordem de hora, com o log antigo do acervo marcado como acervo."""
    antigos = [{**e, "area": "acervo"} for e in _le(ANTIGO_ACERVO)]
    return sorted(antigos + _le(ARQUIVO), key=lambda e: e["at"])
