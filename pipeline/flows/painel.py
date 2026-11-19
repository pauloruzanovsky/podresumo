"""
Painel de controle do Podlibris: junta num arquivo só o estado das rotinas, da
extração (semana e acervo), da newsletter e dos serviços (Supabase, Vercel,
Resend, Webshare). Só lê: não muda o banco, não pede deploy e não gasta API
da Anthropic. Grava `respostas/painel.json` e a página pronta, `respostas/painel.html`
(o modelo `painel/modelo.html` com os dados embutidos), que a rotina
`podlibris-painel` (todo dia às 4h) publica no artefato privado do Paulo.

Serviço que não deu pra consultar sai como "nao_conferido", nunca como "ok".

A última execução das rotinas do app do Claude só o app sabe: a rotina grava
`respostas/rotinas-painel.json` antes de rodar isto, neste formato:
    [{"id": "podresumo-baixar-transcricoes", "nome": "...", "ultima": "ISO",
      "proxima": "ISO", "status": "succeeded|failed|running", "resumo": "..."}]

Uso:
    python -m flows.painel
"""

import calendar
import json
import os
import subprocess
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(RAIZ, ".env"))

import etapas
from extract.youtube import fetch_episodes
from flows import acervo
from flows.baixar_transcricoes import SEM_LEGENDA, episodio_inteiro
from flows.newsletter import semana_de, semana_passada
from load.supabase import supabase, todas

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RESPOSTAS = os.path.join(RAIZ, "respostas")
SAIDA = os.path.join(RESPOSTAS, "painel.json")
SAIDA_HTML = os.path.join(RESPOSTAS, "painel.html")
# separado do rotinas.json das Pendências, que tem outro formato
ROTINAS = os.path.join(RESPOSTAS, "rotinas-painel.json")
REPO = os.path.dirname(RAIZ)
SITE = "https://podlibris.com"

# Os quatro podcasts da rotina de download, com os filtros dela.
PODCASTS = [
    ("Os Sócios Podcast", "PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf", None, 0, []),
    ("Modern Wisdom", "UUIaH-gZIVC432YRjNVvnyCA", "2026-11-02", 45, ["Essentials"]),
    ("The Tim Ferriss Show", "UUznv7Vf9nBdJYvBagFdAHWw", "2026-11-02", 45, ["Essentials"]),
    ("Huberman Lab", "UU2D2CMWXMOVWx7giW1n3LIg", "2026-11-02", 45, ["Essentials"]),
]

# Prazo, em horas, pra uma rotina contar como atrasada.
LIMITE_HORAS = {
    "podresumo-baixar-transcricoes": 14,
    "podlibris-lote-semanal": 7 * 24 + 4,
    "podlibris-newsletter-semanal": 7 * 24 + 4,
    "podlibris-painel": 26,
    "podlibris-post-semanal": 7 * 24 + 4,
}

# Workflows do GitHub Actions: (arquivo, nome, quando roda, horas pra contar como atrasado)
WORKFLOWS = [
    ("deploy-diario.yml", "Deploy diário", "todo dia às 7h", 26),
    ("manter-banco-ativo.yml", "Manter banco ativo", "todo dia às 6h17", 26),
    ("aquecer-cache.yml", "Aquecer cache", "depois de cada deploy", None),
    ("backup-banco.yml", "Backup do banco", "domingo às 3h", 7 * 24 + 4),
]

# Vercel Pro (desde nov/2026): sem limite por recurso, US$ 20 de crédito por
# mês que cobrem qualquer consumo; passou disso, cobra à parte.
VERCEL_TEAM = "team_gEWElu3dp9k9R4Wl6EeBpjES"
VERCEL_CREDITO_USD = 20
UNIDADES = {"writes": "escritas", "reads": "leituras", "gigabyte": "GB", "minute": "min", "hour": "h",
            "invocations": "invocações", "requests": "pedidos"}
RESEND_LIMITE_MES, RESEND_LIMITE_DIA = 3000, 100
SUPABASE_LIMITE_GB = 0.5

# Antes disto não havia log de etapas: o check vem do banco, marcado "deduzido".
INICIO_LOG = "2026-11-16T06:30:00-03:00"


def agora() -> datetime:
    return datetime.now(timezone.utc).astimezone()


def iso(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00").replace(" ", "T", 1))
    if dt.tzinfo is None:
        dt = dt.astimezone()
    return dt.astimezone().isoformat(timespec="seconds")


def hora_local_gravada(valor: str | None) -> str | None:
    """`extraido_em` é gravado com a hora local sem fuso (datetime.now()) e o
    Postgres o guarda como se fosse UTC: o relógio certo é o que veio escrito."""
    if not valor:
        return None
    dt = datetime.fromisoformat(valor.replace("Z", "+00:00")).replace(tzinfo=None)
    return dt.astimezone().isoformat(timespec="seconds")


def horas_desde(quando: str | None) -> float | None:
    if not quando:
        return None
    return (agora() - datetime.fromisoformat(iso(quando))).total_seconds() / 3600


def metrica(servico, nome, valor, limite=None, unidade="", status="ok", detalhe="", link=None):
    """Uma linha de cartão de serviço. `uso` é a fração do limite (0 a 1+)."""
    uso = round(valor / limite, 4) if limite and isinstance(valor, (int, float)) else None
    return {"servico": servico, "metrica": nome, "valor": valor, "limite": limite,
            "unidade": unidade, "uso": uso, "status": status, "detalhe": detalhe, "link": link}


def numero(x, casas=None) -> str:
    """No formato brasileiro: 652.789, 3,26."""
    if casas is None:
        casas = 0 if float(x).is_integer() or abs(x) >= 1000 else 2
    return f"{x:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pelo_uso(uso: float | None) -> str:
    if uso is None:
        return "ok"
    return "erro" if uso >= 1 else "atencao" if uso >= 0.8 else "ok"


# ───────────────────────────────────────────────────── rotinas ───

def rotinas(log: list[dict]) -> list[dict]:
    saida = []
    if not os.path.exists(ROTINAS) or (horas_desde(iso(datetime.fromtimestamp(os.path.getmtime(ROTINAS)))) or 0) > 26:
        saida.append({"tipo": "app", "id": "rotinas", "nome": "Rotinas do app", "ultima": None,
                      "proxima": None, "status": "nao_conferido", "quando": "",
                      "resumo": "O painel não recebeu do app a última execução das rotinas."})
    else:
        for r in json.load(open(ROTINAS, encoding="utf-8")):
            ultima = iso(r.get("ultima"))
            horas = horas_desde(ultima)
            limite = LIMITE_HORAS.get(r["id"], 26)
            if not ultima and r.get("proxima"):
                status, resumo = "ok", "Ainda não rodou; a primeira é na próxima."
            elif not ultima:
                status, resumo = "erro", "Nunca rodou."
            elif r.get("status") == "failed":
                status, resumo = "erro", r.get("resumo") or "A última execução falhou."
            elif horas > limite:
                status, resumo = "erro", f"Atrasada: a última foi há {horas / 24:.1f} dias."
            elif r.get("status") == "running":
                status, resumo = "ok", "Rodando agora."
            else:
                status, resumo = "ok", r.get("resumo") or "Terminou."
            curto = "" if status == "ok" and ultima else resumo
            # a de download: o resultado de fato vem do log, não da sessão
            if r["id"] == "podresumo-baixar-transcricoes" and ultima and status == "ok":
                rodada = [e for e in log if e["tipo"] == "download" and e["at"] >= iso(datetime.fromisoformat(ultima) - timedelta(minutes=5))]
                if rodada:
                    salvos = sum(e["salvos"] for e in rodada)
                    bloq = [e["podcast"] for e in rodada if e.get("bloqueio")]
                    proxy = [e for e in rodada if e.get("erro_proxy")]
                    resumo = f"{salvos} transcrição(ões) baixada(s)"
                    if bloq:
                        resumo += f"; YouTube bloqueou em {', '.join(bloq)}"
                        status = "atencao"
                    if proxy:
                        resumo += "; o proxy recusou"
                        status = "atencao"
                    curto = resumo
            saida.append({"tipo": "app", "id": r["id"], "nome": r["nome"], "ultima": ultima,
                          "proxima": iso(r.get("proxima")), "status": status, "quando": r.get("quando", ""),
                          "resumo": resumo, "curto": curto})
    saida += github_actions()
    return saida


def github_actions() -> list[dict]:
    saida = []
    for arquivo, nome, quando, limite in WORKFLOWS:
        try:
            r = subprocess.run(
                ["gh", "run", "list", "--workflow", arquivo, "--limit", "5",
                 "--json", "conclusion,status,createdAt,url"],
                cwd=REPO, capture_output=True, text=True, timeout=60, encoding="utf-8",
            )
            runs = [x for x in json.loads(r.stdout or "[]") if x["conclusion"] != "skipped"]
        except Exception as erro:
            saida.append({"tipo": "github", "id": arquivo, "nome": nome, "ultima": None, "proxima": None,
                          "status": "nao_conferido", "quando": quando, "resumo": f"GitHub não respondeu ({erro})"})
            continue
        if not runs:
            saida.append({"tipo": "github", "id": arquivo, "nome": nome, "ultima": None, "proxima": None,
                          "status": "nao_conferido", "quando": quando, "resumo": "Sem execução registrada."})
            continue
        x = runs[0]
        ultima = iso(x["createdAt"])
        if x["status"] != "completed":
            status, resumo = "ok", "Rodando agora."
        elif x["conclusion"] == "success":
            status, resumo = "ok", "Deu certo."
        else:
            status, resumo = "erro", f"Terminou com {x['conclusion']}."
        if status == "ok" and limite and horas_desde(ultima) > limite:
            status, resumo = "erro", f"Atrasado: o último foi há {horas_desde(ultima) / 24:.1f} dias."
        saida.append({"tipo": "github", "id": arquivo, "nome": nome, "ultima": ultima, "proxima": None,
                      "status": status, "quando": quando, "resumo": resumo, "link": x["url"]})
    return saida


# ──────────────────────────────────────────────────── episódios ───

def deploys_vercel() -> list[dict] | None:
    token = os.getenv("VERCEL_TOKEN")
    if not token:
        return None
    r = requests.get("https://api.vercel.com/v6/deployments?limit=40&target=production",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()["deployments"]


def etapas_de(ep: dict, log_ids: dict, capas_at: list[str], deploys: list[dict] | None) -> dict:
    """As cinco etapas de um episódio: "feito", "deduzido" (antes do log),
    "falta" ou "sem_legenda", com a data quando há."""
    no_banco = ep.get("status") is not None
    st = ep.get("status")
    e = {"cat": "feito", "cat_em": iso(ep.get("created_at")) or ep.get("visto_em"),
         "cat_fonte": "banco" if no_banco else "YouTube"}

    tra = log_ids.get(("transcricao", ep["id"]))
    if tra:
        e.update(tra="feito", tra_em=tra)
    elif st in ("pending", "done"):
        e.update(tra="deduzido", tra_em=None)
    elif ep["id"] in SEM_LEGENDA:
        e.update(tra="sem_legenda", tra_em=None)
    else:
        e.update(tra="falta", tra_em=None)

    extraido = hora_local_gravada(ep.get("extraido_em")) if st == "done" else None
    e.update(ext="feito" if extraido else "falta", ext_em=extraido)

    if not extraido or not ep.get("slug"):
        e.update(cap="falta", cap_em=None)
    else:
        depois = [c for c in capas_at if c >= extraido]
        if depois:
            e.update(cap="feito", cap_em=depois[0])
        elif extraido < INICIO_LOG:
            e.update(cap="deduzido", cap_em=None)
        else:
            e.update(cap="falta", cap_em=None)

    if not extraido:
        e.update(site="falta", site_em=None)
    elif deploys is None:
        e.update(site="nao_conferido", site_em=None)
    else:
        prontos = sorted(iso(datetime.fromtimestamp(d["created"] / 1000, timezone.utc))
                         for d in deploys if d.get("state") == "READY")
        depois = [d for d in prontos if d >= extraido]
        if depois:
            e.update(site="feito", site_em=depois[0])
        elif prontos and prontos[0] > extraido:
            e.update(site="deduzido", site_em=None)  # extraído antes do deploy mais antigo da lista
        else:
            e.update(site="falta", site_em=None)
    return e


def linha_episodio(ep, grupo, log_ids, capas_at, deploys, podcast_nome):
    passos = etapas_de(ep, log_ids, capas_at, deploys)
    feitos = sum(passos[k] in ("feito", "deduzido") for k in ("cat", "tra", "ext", "cap", "site"))
    return {
        "grupo": grupo, "id": ep["id"], "podcast": podcast_nome, "titulo": ep["titulo"],
        "publicado": ep.get("data"), "feitos": feitos,
        "link": f"{SITE}/episodio/{ep['slug']}" if ep.get("slug") and passos["site"] in ("feito", "deduzido") else None,
        "youtube": f"https://www.youtube.com/watch?v={ep['id']}",
        **passos,
    }


def inicio_semana(log: list[dict]) -> date:
    """Primeiro dia da seção de episódios: a semana fechada da newsletter até
    ela ser enviada; depois do envio, só a semana corrente."""
    hoje = date.today()
    inicio, atual = semana_passada(hoje)[0], semana_de(hoje)[0]
    fechou = (inicio + timedelta(days=7)).isoformat()
    if inicio < atual and any(e["tipo"] == "newsletter_enviada" and e["at"][:10] >= fechou for e in log):
        return atual
    return inicio


def episodios(log: list[dict], deploys) -> tuple[list[dict], dict]:
    hoje = date.today()
    inicio = inicio_semana(log)
    pods = {p["id"]: p["nome"] for p in supabase.table("podcasts").select("id, nome").execute().data}
    banco = {e["id"]: e for e in supabase.table("episodes").select(
        "id, podcast_id, titulo, data, status, extraido_em, slug, created_at"
    ).gte("data", inicio.isoformat()).execute().data}
    log_ids = {}
    for e in log:
        if e["tipo"] in ("transcricao", "extracao") and e.get("id"):
            log_ids.setdefault((e["tipo"], e["id"]), e["at"])
    capas_at = sorted(e["at"] for e in log if e["tipo"] == "capas")

    # o que já saiu no YouTube e ainda nem entrou no banco
    vistos, avisos = {}, []
    for nome, playlist, desde, minimo, excluir in PODCASTS:
        try:
            for v in fetch_episodes(playlist, 15):
                if (v["data"] or "") >= inicio.isoformat() and episodio_inteiro(v, desde, minimo, excluir):
                    vistos[v["video_id"]] = {"id": v["video_id"], "titulo": v["titulo"], "data": v["data"],
                                             "podcast": nome}
        except Exception as erro:
            avisos.append(f"YouTube não respondeu pro {nome}: {erro}")

    linhas = []
    for i in set(banco) | set(vistos):
        ep = banco.get(i) or {**vistos[i], "status": None}
        nome = pods.get(ep.get("podcast_id")) or ep.get("podcast")
        data = ep.get("data") or ""
        grupo = "Esta semana" if data >= semana_de(hoje)[0].isoformat() else "Semana passada"
        linhas.append(linha_episodio(ep, grupo, log_ids, capas_at, deploys, nome))
    linhas.sort(key=lambda r: r["publicado"] or "", reverse=True)
    return linhas, {"avisos": avisos, "log_ids": log_ids, "capas_at": capas_at}


# ─────────────────────────────────────────────────────── acervo ───

def secao_acervo(log, deploys, aux) -> tuple[dict, list[dict], list[dict]]:
    alog = [e for e in log if e.get("area") == "acervo"]
    banco = acervo.no_banco()
    est = acervo.estado(alog, banco)
    ultima_cota = next((e for e in reversed(alog) if e["tipo"] == "cota"), None)
    resumo = {**est, "cota_janela": ultima_cota and ultima_cota["janela"],
              "cota_semana": ultima_cota and ultima_cota["semana"],
              "cota_em": ultima_cota and ultima_cota["at"]}

    progresso = []
    nomes = {"ferriss": "The Tim Ferriss Show", "modern": "Modern Wisdom", "huberman": "Huberman Lab"}
    for chave in acervo.PODCASTS:
        el = acervo.elegiveis(chave)
        progresso.append({"podcast": nomes[chave],
                          "elegiveis": len(el),
                          "no_site": sum(1 for e in el if banco.get(e["video_id"], {}).get("status") == "done"),
                          "na_fila": len(acervo.fila(chave, banco))})

    # a última leva, episódio por episódio
    levas = acervo.levas(alog, banco)
    linhas = []
    if levas:
        l = max(levas, key=lambda l: l["inicio"])
        resumo["ultima_leva"] = f"{l['podcast']} {l['leva']}"
        canal = {e["video_id"]: e for e in acervo.canal(l["podcast"])}
        eps = {}
        for i in range(0, len(l["ids"]), 100):
            eps.update({e["id"]: e for e in supabase.table("episodes").select(
                "id, titulo, data, status, extraido_em, slug, created_at").in_("id", l["ids"][i:i + 100]).execute().data})
        for i in l["ids"]:
            ep = eps.get(i) or {"id": i, "titulo": canal.get(i, {}).get("titulo", i),
                                "data": canal.get(i, {}).get("data"), "status": None, "visto_em": l["inicio"]}
            linhas.append(linha_episodio(ep, f"Leva {l['podcast']} {l['leva']}", aux["log_ids"],
                                         aux["capas_at"], deploys, nomes[l["podcast"]]))

    ocorrencias = [{"at": e["at"], "tipo": e["tipo"], "texto": e.get("texto") or e.get("motivo") or ""}
                   for e in alog if e["tipo"] in ("aviso", "falha", "info", "leva_fim")][-8:][::-1]
    return resumo, progresso, linhas, ocorrencias


# ─────────────────────────────────────────────────── newsletter ───

def resend_get(caminho: str, **params) -> dict:
    r = requests.get(f"https://api.resend.com/{caminho}", params=params, timeout=30,
                     headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
    r.raise_for_status()
    return r.json()


def resend_todos(caminho: str, para=None, **params) -> list[dict]:
    """Lista paginada; `para(item)` True interrompe (lista vem do mais novo)."""
    itens, depois = [], None
    while True:
        p = {**params, "limit": 100, **({"after": depois} if depois else {})}
        pagina = resend_get(caminho, **p)
        for item in pagina["data"]:
            if para and para(item):
                return itens
            itens.append(item)
        if not pagina.get("has_more") or not pagina["data"]:
            return itens
        depois = pagina["data"][-1]["id"]


def newsletter(log: list[dict], servicos: list[dict]) -> tuple[list[dict], dict]:
    hoje = date.today()
    ini, fim = semana_passada(hoje)
    # o rascunho nasce no domingo à noite (rotina de domingo) ou na segunda
    corte = iso(datetime.combine(fim, datetime.min.time()))
    resumo = {"semana": f"{ini:%d/%m} a {fim:%d/%m}", "etapa_atual": None}

    eps = supabase.table("episodes").select("id, status").gte("data", ini.isoformat()).lte("data", fim.isoformat()).execute().data
    faltam = [e for e in eps if e["status"] != "done"]
    lote_aberto = os.path.exists(os.path.join(RESPOSTAS, "ultimo_lote.txt"))
    coletado = next((e for e in reversed(log) if e["tipo"] in ("lote_coletado", "assinatura") and e["at"] >= corte), None)

    broadcasts = []
    try:
        broadcasts = resend_get("broadcasts")["data"]
        resend_ok = True
    except Exception as erro:
        resend_ok = False
        resumo["erro_resend"] = str(erro)[:120]
    da_semana = [b for b in broadcasts if iso(b["created_at"]) >= corte]
    rascunho = next((b for b in da_semana), None)
    enviado = next((b for b in da_semana if b["status"] == "sent"), None)
    aprovado = next((e for e in reversed(log) if e["tipo"] == "newsletter_enviada" and e["at"] >= corte), None)

    passos = [
        ("Episódios da semana", not faltam and hoje >= fim,
         None, f"{len(eps)} episódio(s) lançado(s); {len(faltam)} ainda sem extração" if faltam else f"{len(eps)} episódio(s) lançado(s)"),
        ("Lote coletado", not faltam and not lote_aberto, coletado and coletado["at"],
         "lote da API esperando coleta" if lote_aberto else ""),
        ("Rascunho criado", bool(rascunho), rascunho and iso(rascunho["created_at"]),
         rascunho["name"] if rascunho else ("" if resend_ok else "Resend não respondeu")),
        ("Aprovado pelo Paulo", bool(enviado or aprovado), (aprovado and aprovado["at"]) or (enviado and iso(enviado["sent_at"])), ""),
        ("Enviado", bool(enviado), enviado and iso(enviado["sent_at"]), enviado["name"] if enviado else ""),
    ]
    if not eps and hoje >= fim:
        passos = [("Episódios da semana", True, None, "nenhum episódio lançado: sem e-mail esta semana")]
    linhas = []
    for i, (nome, ok, em, detalhe) in enumerate(passos, 1):
        status = "feito" if ok else ("nao_conferido" if not resend_ok and i >= 3 else "falta")
        linhas.append({"ordem": i, "etapa": nome, "status": status, "em": em, "detalhe": detalhe})
    atual = next((l for l in linhas if l["status"] != "feito"), None)
    resumo["etapa_atual"] = atual["etapa"] if atual else "Enviado"

    # inscritos e resultado do último envio
    if resend_ok:
        try:
            seg = os.environ["RESEND_SEGMENT_ID"]
            contatos = resend_todos("contacts", segment_id=seg)
            ativos = [c for c in contatos if not c.get("unsubscribed")]
            resumo["inscritos"] = len(ativos)
            inicio_mes = iso(datetime.combine(hoje.replace(day=1), datetime.min.time()))
            emails = resend_todos("emails", para=lambda e: iso(e["created_at"]) < inicio_mes)
            hoje_ini = iso(datetime.combine(hoje, datetime.min.time()))
            servicos.append(metrica("Resend", "Inscritos confirmados", len(ativos), link="https://resend.com/audience"))
            servicos.append(metrica("Resend", "E-mails no mês", len(emails), RESEND_LIMITE_MES,
                                    status=pelo_uso(len(emails) / RESEND_LIMITE_MES),
                                    detalhe=f"{sum(iso(e['created_at']) >= hoje_ini for e in emails)} hoje (limite {RESEND_LIMITE_DIA}/dia)",
                                    link="https://resend.com/emails"))
            ultimo = next((b for b in broadcasts if b["status"] == "sent"), None)
            if ultimo:
                envio = iso(ultimo["sent_at"])
                deste = [e for e in emails if e.get("subject") == ultimo["name"]] or [
                    e for e in resend_todos("emails", para=lambda e: iso(e["created_at"]) < iso(datetime.fromisoformat(envio) - timedelta(hours=1)))
                    if e.get("subject") == ultimo["name"]]
                eventos = Counter(e.get("last_event") for e in deste)
                abertos = eventos["opened"] + eventos["clicked"]
                resumo.update(ultimo_assunto=ultimo["name"], ultimo_envio=envio, ultimo_destinatarios=len(deste),
                              ultimo_eventos=dict(eventos))
                servicos.append(metrica("Resend", "Último envio", len(deste), unidade="destinatários",
                                        detalhe=f"{ultimo['name'][:60]} · {abertos} aberto(s), "
                                                f"{eventos['bounced'] + eventos['complained']} problema(s)",
                                        status="atencao" if eventos["bounced"] or eventos["complained"] else "ok",
                                        link="https://resend.com/broadcasts"))
        except Exception as erro:
            servicos.append(metrica("Resend", "Inscritos e envios", None, status="nao_conferido",
                                    detalhe=f"Resend não respondeu ({str(erro)[:80]})", link="https://resend.com"))
    else:
        servicos.append(metrica("Resend", "Inscritos e envios", None, status="nao_conferido",
                                detalhe="Resend não respondeu", link="https://resend.com"))
    return linhas, resumo


# ──────────────────────────────────────────────────── serviços ───

def supabase_cartao(servicos: list[dict]):
    try:
        status = Counter(e["status"] for e in todas(lambda: supabase.table("episodes").select("id, status").order("id")))
        servicos.append(metrica("Supabase", "Banco responde", "sim", detalhe="leitura feita agora",
                                link="https://supabase.com/dashboard"))
        servicos.append(metrica("Supabase", "Episódios", sum(status.values()),
                                detalhe=f"{status['done']} no site, {status['pending']} aguardando extração, "
                                        f"{status['listed']} sem transcrição"))
    except Exception as erro:
        servicos.append(metrica("Supabase", "Banco responde", "não", status="erro",
                                detalhe=f"{str(erro)[:100]} — se pausou, Restore em supabase.com/dashboard",
                                link="https://supabase.com/dashboard"))
        return
    try:
        bytes_ = supabase.rpc("tamanho_banco").execute().data
        gb = bytes_ / 1024 ** 3
        servicos.append(metrica("Supabase", "Tamanho do banco", round(gb, 3), SUPABASE_LIMITE_GB, "GB",
                                status=pelo_uso(gb / SUPABASE_LIMITE_GB),
                                link="https://supabase.com/dashboard"))
    except Exception:
        servicos.append(metrica("Supabase", "Tamanho do banco", None, SUPABASE_LIMITE_GB, "GB",
                                status="nao_conferido",
                                detalhe="Falta criar a função tamanho_banco (supabase/migrations/012_tamanho_banco.sql)"))


def vercel_cartao(servicos: list[dict], deploys):
    painel = "https://vercel.com/pauloruzanovskys-projects/podresumo/usage"
    if deploys is None:
        servicos.append(metrica("Vercel", "Deploys", None, status="nao_conferido",
                                detalhe="Sem VERCEL_TOKEN ou a Vercel não respondeu", link=painel))
    else:
        d = deploys[0]
        quando = iso(datetime.fromtimestamp(d["created"] / 1000, timezone.utc))
        st = "ok" if d["state"] == "READY" else "erro" if d["state"] == "ERROR" else "atencao"
        servicos.append(metrica("Vercel", "Último deploy", d["state"], status=st,
                                detalhe=f"{quando[8:10]}/{quando[5:7]} às {quando[11:16]} · "
                                        + {"deploy-hook": "pedido pelo pipeline", "git": "push no master"}.get(d.get("source"), d.get("source") or ""),
                                link=d.get("inspectorUrl")))
        um_dia = agora() - timedelta(days=1)
        servicos.append(metrica("Vercel", "Deploys nas últimas 24 h",
                                sum(datetime.fromtimestamp(x["created"] / 1000, timezone.utc) >= um_dia for x in deploys),
                                detalhe="cada deploy zera o cache"))
    try:
        inicio = agora().astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        r = requests.get(f"https://api.vercel.com/v1/billing/charges?teamId={VERCEL_TEAM}"
                         f"&from={inicio:%Y-%m-%dT%H:%M:%SZ}"
                         f"&to={agora().astimezone(timezone.utc):%Y-%m-%dT%H:%M:%SZ}",
                         headers={"Authorization": f"Bearer {os.environ['VERCEL_TOKEN']}"}, timeout=60)
        r.raise_for_status()
        linhas = [json.loads(l) for l in r.text.splitlines() if l.strip()]
        custo, qtd, unid, ontem = Counter(), Counter(), {}, Counter()
        dia_ontem = max((l["ChargePeriodStart"] for l in linhas), default="")
        # só consumo: a mensalidade do Pro (ChargeCategory "Purchase") não sai do crédito
        linhas = [l for l in linhas if l.get("ChargeCategory") == "Usage"]
        for l in linhas:
            nome = l["ServiceName"]
            custo[nome] += float(l.get("EffectiveCost") or 0)
            qtd[nome] += float(l.get("ConsumedQuantity") or 0)
            unid[nome] = l.get("ConsumedUnit") or ""
            if l["ChargePeriodStart"] == dia_ontem:
                ontem[nome] += float(l.get("ConsumedQuantity") or 0)
        total = round(sum(custo.values()), 2)
        dias = max(1, (agora().astimezone(timezone.utc) - inicio).days)
        no_mes = calendar.monthrange(inicio.year, inicio.month)[1]
        projecao = total / dias * no_mes
        servicos.append(metrica("Vercel", "Crédito do mês (Pro)", total, VERCEL_CREDITO_USD, "US$",
                                status=pelo_uso(total / VERCEL_CREDITO_USD),
                                detalhe=f"desde 01/{inicio:%m}; no ritmo atual, US$ {numero(projecao, 2)} no mês",
                                link=painel))
        for nome in sorted(custo, key=custo.get, reverse=True)[:4]:
            if custo[nome] < 0.01:
                continue
            servicos.append(metrica("Vercel", nome, round(custo[nome], 2), None, "US$",
                                    detalhe=f"{numero(qtd[nome])} {UNIDADES.get(unid[nome].lower(), unid[nome].lower())} no mês; "
                                            f"no último dia: {numero(ontem[nome])}",
                                    link=painel))
    except Exception as erro:
        servicos.append(metrica("Vercel", "Crédito do mês (Pro)", None, status="nao_conferido",
                                detalhe=f"A API de uso não respondeu ({str(erro)[:80]})", link=painel))


def webshare_cartao(servicos: list[dict], log: list[dict]):
    painel = "https://dashboard.webshare.io/"
    chave = os.getenv("WEBSHARE_API_KEY")
    try:
        h = {"Authorization": f"Token {chave}"}
        sub = requests.get("https://proxy.webshare.io/api/v2/subscription/", headers=h, timeout=30)
        sub.raise_for_status()
        sub = sub.json()
        planos = requests.get("https://proxy.webshare.io/api/v2/subscription/plan/", headers=h, timeout=30).json()["results"]
        plano = next(p for p in planos if p["id"] == sub["plan"])
        inicio = datetime.fromisoformat(sub["start_date"].replace("Z", "+00:00"))
        fim = datetime.fromisoformat(sub["end_date"].replace("Z", "+00:00"))
        # o ciclo é mensal dentro da assinatura: começa no mesmo dia do mês de start_date
        ciclo = fim - timedelta(days=30) if (fim - inicio).days > 31 else inicio
        stats = requests.get("https://proxy.webshare.io/api/v2/stats/aggregate/", headers=h, timeout=30, params={
            "timestamp__gte": ciclo.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "timestamp__lte": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}).json()
    except Exception as erro:
        servicos.append(metrica("Webshare", "Banda do mês", None, status="nao_conferido",
                                detalhe=f"Webshare não respondeu ({str(erro)[:80]})", link=painel))
        return
    gb = stats["bandwidth_total"] / 1e9
    limite = plano["bandwidth_limit"]
    esgotada = gb >= limite * 0.99
    servicos.append(metrica("Webshare", "Banda do mês", round(gb, 2), limite, "GB",
                            status="erro" if esgotada else pelo_uso(gb / limite),
                            detalhe=("reserva esgotada: proxy parado até " if esgotada else "renova em ")
                                    + f"{iso(fim)[8:10]}/{iso(fim)[5:7]} · US$ {numero(plano['monthly_price'], 2)}/mês",
                            link=painel))
    servicos[-1]["renova"] = f"{iso(fim)[8:10]}/{iso(fim)[5:7]}"
    semana = iso(agora() - timedelta(days=7))
    usos = [e for e in log if e["tipo"] == "download" and e["at"] >= semana and e.get("por_proxy")]
    recusas = [e for e in log if e["tipo"] == "download" and e["at"] >= semana and e.get("erro_proxy")]
    ultimo = stats.get("last_request_sent_at")
    detalhe = f"último pedido em {iso(ultimo)[:16].replace('T', ' ')}" if ultimo else "nenhum pedido no ciclo"
    if recusas:
        detalhe += f"; recusou {len(recusas)} vez(es) na semana"
    servicos.append(metrica("Webshare", "Proxy usado nos últimos 7 dias",
                            sum(e["por_proxy"] for e in usos), unidade="transcrições",
                            status="atencao" if recusas else "ok", detalhe=detalhe, link=painel))


# ───────────────────────────────────────────────────────── main ───

def livros_duplicados() -> dict:
    """Duplicatas que esperam leitura: as óbvias a rotina de domingo funde
    sozinha (normalize_livros --auto); aqui só contam as duvidosas
    (homônimos, autores que divergem)."""
    from flows import normalize_livros as nl
    linhas = todas(lambda: supabase.table("livros").select(
        "id, titulo, autor, tipo, titulo_alt, episode_livros(episode_id)").order("id"))
    _, _, obvias, _, _ = nl.monta_plano(linhas, so_obvios=True)
    return {"duvidosas": len(nl.duvidosos), "obvias": len(obvias)}


def lembretes() -> list[dict]:
    """Pedidos à mão (painel/lembretes.json): {texto, prazo?, link?, ate?}.
    Some sozinho depois de `ate` (AAAA-MM-DD); apagar a linha quando feito."""
    caminho = os.path.join(RAIZ, "painel", "lembretes.json")
    if not os.path.exists(caminho):
        return []
    hoje = date.today().isoformat()
    with open(caminho, encoding="utf-8") as f:
        return [l for l in json.load(f) if not l.get("ate") or l["ate"] >= hoje]


def pagina(rotinas_, acervo_resumo, nl_etapas, servicos, log, duplicados=None) -> dict:
    """O título (o ponto, numa frase) e os pedidos do topo da página."""
    frases, pedidos = [], []
    vercel = "https://vercel.com/pauloruzanovskys-projects/podresumo/usage"
    banco = next((s for s in servicos if s["metrica"] == "Banco responde"), None)
    if banco and banco["status"] == "erro":
        frases.append("o banco não respondeu")
        pedidos.append({"texto": "Restaurar o banco no Supabase (botão Restore)", "prazo": "hoje",
                        "link": "https://supabase.com/dashboard", "nivel": "erro"})
    for r in rotinas_:
        if r["status"] == "erro":
            frases.append(f"a rotina {r['nome']} não rodou no prazo")
            pedidos.append({"texto": f"Rodar “{r['nome']}” pelo app do Claude", "prazo": "hoje",
                            "link": r.get("link"), "nivel": "erro"})
    if acervo_resumo.get("estado") == "Travado":
        frases.append("o acervo travou")
        pedidos.append({"texto": f"Retomar ou fechar a leva {acervo_resumo.get('leva')} do acervo",
                        "prazo": "quando puder", "link": None, "nivel": "erro"})
    etapa = {e["etapa"]: e["status"] for e in nl_etapas}
    if etapa.get("Rascunho criado") == "feito" and etapa.get("Enviado") != "feito":
        frases.append("a newsletter espera seu ok")
        # o botão de aprovar fica no chat onde o rascunho foi mostrado
        pedidos.append({"texto": "Aprovar o rascunho da newsletter (botão no chat onde ele foi mostrado)",
                        "prazo": "terça de manhã", "link": "https://resend.com/broadcasts", "nivel": "atencao"})
    if any(s["servico"] == "Vercel" and s["status"] == "erro" for s in servicos):
        frases.append("a Vercel passou do crédito de US$ 20 do mês")
        pedidos.append({"texto": "Ver na Vercel o que passou do crédito do Pro (o excesso é cobrado)", "prazo": "esta semana",
                        "link": vercel, "nivel": "erro"})
    banda = next((s for s in servicos if s["metrica"] == "Banda do mês"), None)
    if banda and banda["status"] == "erro":
        # Sem pedido: em 16/11/2026 o Paulo decidiu deixar renovar sozinho; o
        # acervo segue pela conexão direta enquanto isso.
        frases.append(f"o proxy de reserva está sem banda até {banda.get('renova')}")
    if duplicados and duplicados["duvidosas"]:
        pedidos.append({"texto": f"Decidir {numero(duplicados['duvidosas'])} possíveis livros duplicados que não são óbvios "
                                 "(homônimos, autor diferente): peça pro Claude a lista do normalize_livros --auto",
                        "prazo": "quando puder", "link": None, "nivel": "atencao"})
    try:
        from flows import posts
        post = posts.proximo_post()
        if post:
            pedidos.append({"texto": f"Revisar e postar no LinkedIn: “{post['titulo']}”",
                            "prazo": posts.data_br(post["data"]), "link": posts.URL_PAGINA, "nivel": "atencao"})
    except Exception as erro:
        print(f"  posts: falhou ({erro})")
    for l in lembretes():
        pedidos.append({"texto": l["texto"], "prazo": l.get("prazo"), "link": l.get("link"), "nivel": "atencao"})
    for s in servicos:
        if s["status"] == "nao_conferido":
            pedidos.append({"texto": f"Ver por que não deu pra conferir {s['metrica'].lower()} ({s['servico']})",
                            "prazo": None, "link": s.get("link"), "nivel": "nao_conferido"})
    if frases:
        titulo = " e ".join(frases[:2])
    elif any(s["status"] == "atencao" for s in servicos) or any(r["status"] == "atencao" for r in rotinas_):
        titulo = "tudo rodou, com algo pra ficar de olho"
    else:
        titulo = "tudo em dia: as rotinas rodaram e o site está atualizado"
    return {"titulo": titulo[0].upper() + titulo[1:], "pedidos": pedidos[:5],
            "desde": f"{inicio_semana(log):%d/%m}"}


def grava_html(dados: dict):
    """A página que a rotina publica: o modelo com os dados embutidos."""
    modelo = open(os.path.join(RAIZ, "painel", "modelo.html"), encoding="utf-8").read()
    json_ = json.dumps(dados, ensure_ascii=False).replace("</", "<\\/")
    with open(SAIDA_HTML, "w", encoding="utf-8") as f:
        f.write(modelo.replace("/*__DADOS__*/null", json_))


def secao(nome, fn, *args, padrao=None):
    try:
        return fn(*args)
    except Exception as erro:
        print(f"  {nome}: falhou ({erro})")
        return padrao


def main():
    log = etapas.eventos()
    servicos: list[dict] = []

    deploys = secao("vercel", deploys_vercel)
    supabase_cartao(servicos)
    banco_ok = servicos[0]["status"] != "erro"

    lista_rotinas = secao("rotinas", rotinas, log, padrao=[])
    eps, aux = secao("episódios", episodios, log, deploys, padrao=([], {"avisos": ["falhou"], "log_ids": {}, "capas_at": []})) if banco_ok else ([], {"avisos": ["banco fora"], "log_ids": {}, "capas_at": []})
    ac = secao("acervo", secao_acervo, log, deploys, aux, padrao=None) if banco_ok else None
    if ac:
        acervo_resumo, acervo_progresso, acervo_eps, acervo_ocorrencias = ac
    else:
        acervo_resumo = {"estado": "não conferido", "detalhe": "Não deu pra ler o acervo."}
        acervo_progresso, acervo_eps, acervo_ocorrencias = [], [], []
    nl = secao("newsletter", newsletter, log, servicos, padrao=None) if banco_ok else None
    nl_etapas, nl_resumo = nl or ([], {"etapa_atual": "não conferido"})
    secao("vercel", vercel_cartao, servicos, deploys)
    secao("webshare", webshare_cartao, servicos, log)
    ordem = ["Supabase", "Vercel", "Resend", "Webshare"]
    servicos.sort(key=lambda s: ordem.index(s["servico"]))

    alertas = []
    for r in lista_rotinas:
        if r["status"] in ("erro", "atencao", "nao_conferido"):
            alertas.append({"nivel": r["status"], "area": "Rotinas", "texto": f"{r['nome']}: {r['resumo']}"})
    if acervo_resumo.get("estado") == "Travado":
        alertas.append({"nivel": "erro", "area": "Acervo", "texto": acervo_resumo["detalhe"]})
    for s in servicos:
        if s["status"] in ("erro", "atencao", "nao_conferido"):
            if s["limite"] and isinstance(s["valor"], (int, float)):
                texto = (f"{s['metrica']}: {numero(s['valor'])} de {numero(s['limite'])} {s['unidade']}".rstrip()
                         + f" ({s['uso']:.0%}); {s['detalhe']}")
            else:
                texto = f"{s['metrica']}: {s['detalhe'] or s['valor']}"
            alertas.append({"nivel": s["status"], "area": s["servico"], "texto": texto})
    for a in aux["avisos"]:
        alertas.append({"nivel": "atencao", "area": "Episódios", "texto": a})
    alertas.sort(key=lambda a: ["erro", "atencao", "nao_conferido"].index(a["nivel"]))

    painel = {
        "resumo": [{
            "atualizado_em": iso(agora()),
            "erros": sum(a["nivel"] == "erro" for a in alertas),
            "atencao": sum(a["nivel"] == "atencao" for a in alertas),
            "acervo_estado": acervo_resumo.get("estado"),
            "newsletter_etapa": nl_resumo.get("etapa_atual"),
            "episodios_semana": len(eps),
        }],
        "alertas": alertas,
        "rotinas": lista_rotinas,
        "episodios": eps,
        "acervo": [acervo_resumo],
        "acervo_progresso": acervo_progresso,
        "acervo_episodios": acervo_eps,
        "acervo_ocorrencias": acervo_ocorrencias,
        "newsletter": nl_etapas,
        "newsletter_resumo": [nl_resumo],
        "servicos": servicos,
        "pagina": pagina(lista_rotinas, acervo_resumo, nl_etapas, servicos, log,
                         secao("duplicados", livros_duplicados) if banco_ok else None),
    }
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(painel, f, ensure_ascii=False, indent=1)
    grava_html(painel)

    print(f"painel: {len(alertas)} alerta(s), {len(eps)} episódio(s) na semana, "
          f"acervo {acervo_resumo.get('estado')}, newsletter em '{nl_resumo.get('etapa_atual')}' -> {SAIDA_HTML}")
    print(f"título: {painel['pagina']['titulo']}")
    for a in alertas:
        print(f"  [{a['nivel']}] {a['area']}: {a['texto'][:110]}")


if __name__ == "__main__":
    main()
