"""
Extração do acervo antigo (episódios publicados antes das rotinas) na
assinatura, em levas, com um painel de acompanhamento.

A fila de cada podcast é o canal inteiro, do mais novo pro mais antigo, só
episódio inteiro (45 min ou mais, sem "Essentials") que ainda não está no
banco. Nada aqui chama a API da Anthropic: a extração é feita pelos
subagentes da sessão, com `reprocessar_batch --exportar/--do-assinatura`.

Arquivos em respostas/acervo/ (gitignored):
    <podcast>/canal.json   lista do canal, guardada pra não reconsultar
    <podcast>/leva-N.txt   ids de cada leva
    painel/*.json          o painel antigo (aposentado em 16/11/2026)

Eventos vão pro log único (etapas.py, respostas/etapas.jsonl) com
area "acervo"; o log.jsonl antigo daqui segue lido como histórico.

Estado do acervo, que o painel (flows.painel) mostra:
    Rodando   há leva aberta e evento dela nas últimas HORAS_TRAVADO horas
    Travado   há leva aberta e nada acontece há mais que isso
    On hold   nenhuma leva aberta (mostra o motivo e a data da última)
Uma leva fecha com `fim`, ou sozinha quando todos os ids dela estão no site
ou marcados sem transcrição.

Uso:
    python -m flows.acervo fila                     # quanto falta em cada podcast
    python -m flows.acervo leva --podcast ferriss --n 20
    python -m flows.acervo fim --podcast ferriss --leva 3 --motivo "texto"
    python -m flows.acervo estado                   # Rodando, On hold ou Travado
    python -m flows.acervo evento "texto" [--tipo aviso|falha|info]
    python -m flows.acervo cota --janela 34 --semana 19
    python -m flows.acervo painel                   # gera painel/*.json
"""

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import etapas
import etapas
from extract.youtube import fetch_episodes
from flows.baixar_transcricoes import episodio_inteiro
from load.supabase import supabase, todas

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PASTA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas", "acervo"
)
# leva aberta sem nenhum evento há mais que isto = Travado
HORAS_TRAVADO = 6

# chave curta -> (trecho do nome no banco, playlist de uploads do canal)
PODCASTS = {
    "ferriss": ("Tim Ferriss", "UUznv7Vf9nBdJYvBagFdAHWw"),
    "modern": ("Modern Wisdom", "UUIaH-gZIVC432YRjNVvnyCA"),
    "huberman": ("Huberman", "UU2D2CMWXMOVWx7giW1n3LIg"),
}
MIN_MINUTOS = 45
EXCLUIR = ["Essentials"]


def registra(tipo, **evento):
    etapas.registra(tipo, area="acervo", **evento)


def eventos() -> list[dict]:
    return [e for e in etapas.eventos() if e.get("area") == "acervo"]


def canal(chave: str) -> list[dict]:
    """O canal inteiro, guardado em disco: a YouTube Data API tem cota diária."""
    caminho = os.path.join(PASTA, chave, "canal.json")
    if os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    eps = fetch_episodes(PODCASTS[chave][1], 5000)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(eps, f, ensure_ascii=False)
    return eps


def elegiveis(chave: str) -> list[dict]:
    eps = [e for e in canal(chave) if episodio_inteiro(e, None, MIN_MINUTOS, EXCLUIR)]
    return sorted(eps, key=lambda e: e["data"] or "", reverse=True)


def no_banco() -> dict[str, dict]:
    return {
        e["id"]: e
        for e in todas(lambda: supabase.table("episodes").select("id, status").order("id"))
    }


def ja_tentados() -> set[str]:
    """Ids que já foram numa leva e ficaram sem transcrição: não voltam pra fila."""
    return {e["id"] for e in eventos() if e.get("tipo") == "sem_transcricao"}


def fila(chave: str, banco: dict | None = None) -> list[dict]:
    banco = banco if banco is not None else no_banco()
    pulados = ja_tentados()
    return [e for e in elegiveis(chave) if e["video_id"] not in banco and e["video_id"] not in pulados]


def cmd_fila(_args):
    banco = no_banco()
    for chave in PODCASTS:
        el = elegiveis(chave)
        falta = fila(chave, banco)
        feitos = sum(1 for e in el if banco.get(e["video_id"], {}).get("status") == "done")
        print(f"{chave:9} canal: {len(canal(chave)):5}  elegíveis: {len(el):4}  "
              f"no site: {feitos:4}  na fila: {len(falta):4}")


def cmd_leva(args):
    falta = fila(args.podcast)[:args.n]
    if not falta:
        print("fila vazia")
        return
    pasta = os.path.join(PASTA, args.podcast)
    n = 1 + sum(1 for f in os.listdir(pasta) if f.startswith("leva-"))
    caminho = os.path.join(pasta, f"leva-{n}.txt")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("\n".join(e["video_id"] for e in falta) + "\n")
    registra("leva", podcast=args.podcast, leva=n, ids=[e["video_id"] for e in falta])
    print(caminho)
    for e in falta:
        print(f"  {e['video_id']}  {e['data']}  {e['titulo'][:70]}")


def levas(log: list[dict], banco: dict[str, dict]) -> list[dict]:
    """Cada leva com início, fim (ou None, se aberta) e o último evento dela."""
    fins = {(e["podcast"], e["leva"]): e for e in log if e["tipo"] == "leva_fim"}
    pulados = {e["id"] for e in log if e["tipo"] == "sem_transcricao"}
    extraidos = {e["id"]: e["at"] for e in etapas.eventos() if e["tipo"] in ("extracao", "transcricao")}
    saida = []
    for e in log:
        if e["tipo"] != "leva":
            continue
        chave = (e["podcast"], e["leva"])
        resolvidos = [i for i in e["ids"] if banco.get(i, {}).get("status") == "done" or i in pulados]
        fim = fins.get(chave)
        ultimo = max([e["at"], *(extraidos[i] for i in e["ids"] if i in extraidos)])
        if fim:
            ultimo = max(ultimo, fim["at"])
        completa = len(resolvidos) == len(e["ids"])
        saida.append({
            "podcast": e["podcast"], "leva": e["leva"], "inicio": e["at"], "ids": e["ids"],
            "feitos": len(resolvidos),
            "fim": fim["at"] if fim else (ultimo if completa else None),
            "motivo": fim.get("motivo") if fim else ("completa" if completa else None),
            "ultimo_evento": ultimo,
        })
    # O que sobra de uma leva (download que falhou) entra na seguinte do mesmo
    # podcast: abrir a seguinte fecha a anterior.
    for l in saida:
        seguinte = next((s for s in saida if s["podcast"] == l["podcast"]
                         and s["inicio"] > l["inicio"]), None)
        if not l["fim"] and seguinte:
            l["fim"] = seguinte["inicio"]
            l["motivo"] = f"{l['feitos']} de {len(l['ids'])} feitos; o resto foi pra leva {seguinte['leva']}"
    return saida


def estado(log: list[dict] | None = None, banco: dict | None = None) -> dict:
    """{"estado": Rodando|On hold|Travado, "detalhe", "desde", "leva"}."""
    log = log if log is not None else eventos()
    banco = banco if banco is not None else no_banco()
    todas_levas = levas(log, banco)
    abertas = [l for l in todas_levas if not l["fim"]]
    # o que a sessão do acervo anota (info, aviso, falha) também é sinal de vida
    ultimo_geral = max((e["at"] for e in log), default=None)
    if abertas:
        l = max(abertas, key=lambda l: l["inicio"])
        ultimo = max(l["ultimo_evento"], ultimo_geral or "")
        horas = (datetime.now(timezone.utc) - datetime.fromisoformat(ultimo)).total_seconds() / 3600
        nome = f"{l['podcast']} {l['leva']}"
        if horas > HORAS_TRAVADO:
            return {"estado": "Travado", "leva": nome, "desde": ultimo,
                    "detalhe": f"Leva {nome} aberta, {l['feitos']} de {len(l['ids'])} feitos, "
                               f"sem nenhum evento há {horas:.0f} h."}
        return {"estado": "Rodando", "leva": nome, "desde": l["inicio"],
                "detalhe": f"Leva {nome}: {l['feitos']} de {len(l['ids'])} feitos."}
    ultima = max(todas_levas, key=lambda l: l["fim"], default=None)
    if not ultima:
        return {"estado": "On hold", "leva": None, "desde": None, "detalhe": "Nenhuma leva ainda."}
    return {"estado": "On hold", "leva": f"{ultima['podcast']} {ultima['leva']}", "desde": ultima["inicio"],
            "detalhe": f"Leva {ultima['podcast']} {ultima['leva']}: {ultima['motivo']}."}


def cmd_fim(args):
    registra("leva_fim", podcast=args.podcast, leva=args.leva, motivo=args.motivo)
    print("ok")


def cmd_estado(_args):
    e = estado()
    print(f"{e['estado']}: {e['detalhe']}")


def cmd_evento(args):
    registra(args.tipo, texto=args.texto, id=args.id)
    print("ok")


def cmd_cota(args):
    registra("cota", janela=args.janela, semana=args.semana)
    print("ok")


def cmd_painel(_args):
    """Gera os quatro arquivos do painel a partir do banco e do log."""
    log = eventos()
    levas = [e for e in log if e["tipo"] == "leva"]
    leva_de = {i: (e["podcast"], e["leva"]) for e in levas for i in e["ids"]}
    # os 50 do piloto de 05–06/11 entram como "piloto", pra o painel contar tudo
    piloto = os.path.join(os.path.dirname(PASTA), "acervo-ferriss", "piloto50.txt")
    if os.path.exists(piloto):
        with open(piloto, encoding="utf-8") as f:
            for i in f.read().split():
                leva_de.setdefault(i, ("ferriss", 0))

    pods = {p["id"]: p["nome"] for p in supabase.table("podcasts").select("id, nome").execute().data}
    ids = list(leva_de)
    eps = []
    for i in range(0, len(ids), 100):
        eps += supabase.table("episodes").select(
            "id, podcast_id, titulo, data, duracao, status, processed_at, slug"
        ).in_("id", ids[i:i + 100]).execute().data
    cits = []
    for i in range(0, len(ids), 100):
        cits += todas(lambda lote=ids[i:i + 100]: supabase.table("episode_livros").select(
            "episode_id, livro_id, livros(tipo)").in_("episode_id", lote).order("episode_id").order("livro_id"))
    livros = Counter(c["episode_id"] for c in cits if (c.get("livros") or {}).get("tipo") == "livro")
    outros = Counter(c["episode_id"] for c in cits if (c.get("livros") or {}).get("tipo") != "livro")
    avisos = Counter(e.get("id") for e in log if e["tipo"] == "aviso" and e.get("id"))

    episodios = []
    for e in eps:
        if e["status"] != "done":
            continue
        chave, leva = leva_de[e["id"]]
        feito = e["processed_at"]
        if feito:
            # processed_at é gravado na hora local sem fuso, e o Postgres o
            # guarda como se fosse UTC: o relógio certo é o que veio escrito
            feito = (datetime.fromisoformat(feito.replace("Z", "+00:00"))
                     .replace(tzinfo=None).astimezone().isoformat(timespec="seconds"))
        episodios.append({
            "id": e["id"], "podcast": pods.get(e["podcast_id"], chave),
            "titulo": e["titulo"], "publicado": e["data"], "duracao": e["duracao"],
            "leva": "piloto" if leva == 0 else f"{chave} {leva}",
            "extraido_em": feito, "livros": livros[e["id"]], "outros": outros[e["id"]],
            "avisos": avisos[e["id"]],
            "link": f"https://podlibris.com/episodio/{e['slug']}" if e.get("slug") else None,
        })
    episodios.sort(key=lambda r: r["extraido_em"] or "", reverse=True)

    banco = no_banco()
    progresso = []
    for chave, (nome, _) in PODCASTS.items():
        el = elegiveis(chave)
        feitos = sum(1 for e in el if banco.get(e["video_id"], {}).get("status") == "done")
        progresso.append({"podcast": nome if chave != "huberman" else "Huberman Lab",
                          "elegiveis": len(el), "no_site": feitos,
                          "na_fila": len(fila(chave, banco))})
    for p in progresso:
        p["podcast"] = next((n for n in pods.values() if p["podcast"].lower() in n.lower()), p["podcast"])

    ocorrencias = [
        {"at": e["at"], "tipo": e["tipo"], "texto": e.get("texto") or "", "id": e.get("id")}
        for e in log if e["tipo"] in ("aviso", "falha", "info", "sem_transcricao")
    ]
    ocorrencias.sort(key=lambda r: r["at"], reverse=True)
    cota = [{"at": e["at"], "janela": e["janela"], "semana": e["semana"]}
            for e in log if e["tipo"] == "cota"]

    saida = os.path.join(PASTA, "painel")
    os.makedirs(saida, exist_ok=True)
    for nome, dados in [("episodios", episodios), ("progresso", progresso),
                        ("ocorrencias", ocorrencias), ("cota", cota)]:
        with open(os.path.join(saida, f"{nome}.json"), "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=1)
    print(f"painel: {len(episodios)} episódios, {len(ocorrencias)} ocorrências, "
          f"{len(cota)} medições de cota -> {saida}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fila")
    s = sub.add_parser("leva")
    s.add_argument("--podcast", required=True, choices=list(PODCASTS))
    s.add_argument("--n", type=int, default=20)
    s = sub.add_parser("fim")
    s.add_argument("--podcast", required=True, choices=list(PODCASTS))
    s.add_argument("--leva", type=int, required=True)
    s.add_argument("--motivo", required=True)
    sub.add_parser("estado")
    s = sub.add_parser("evento")
    s.add_argument("texto")
    s.add_argument("--tipo", default="info",
                   choices=["info", "aviso", "falha", "sem_transcricao"])
    s.add_argument("--id")
    s = sub.add_parser("cota")
    s.add_argument("--janela", type=int, required=True)
    s.add_argument("--semana", type=int, required=True)
    sub.add_parser("painel")
    args = p.parse_args()
    {"fila": cmd_fila, "leva": cmd_leva, "evento": cmd_evento, "fim": cmd_fim,
     "estado": cmd_estado, "cota": cmd_cota, "painel": cmd_painel}[args.cmd](args)


if __name__ == "__main__":
    main()
