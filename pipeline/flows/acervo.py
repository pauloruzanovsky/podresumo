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
    log.jsonl              eventos e medições de cota, um por linha
    painel/*.json          o que o painel mostra

Uso:
    python -m flows.acervo fila                     # quanto falta em cada podcast
    python -m flows.acervo leva --podcast ferriss --n 20
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

from extract.youtube import fetch_episodes
from flows.baixar_transcricoes import episodio_inteiro
from load.supabase import supabase, todas

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PASTA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas", "acervo"
)
LOG = os.path.join(PASTA, "log.jsonl")

# chave curta -> (trecho do nome no banco, playlist de uploads do canal)
PODCASTS = {
    "ferriss": ("Tim Ferriss", "UUznv7Vf9nBdJYvBagFdAHWw"),
    "modern": ("Modern Wisdom", "UUIaH-gZIVC432YRjNVvnyCA"),
    "huberman": ("Huberman", "UU2D2CMWXMOVWx7giW1n3LIg"),
}
MIN_MINUTOS = 45
EXCLUIR = ["Essentials"]


def agora() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def registra(**evento):
    os.makedirs(PASTA, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"at": agora(), **evento}, ensure_ascii=False) + "\n")


def eventos() -> list[dict]:
    if not os.path.exists(LOG):
        return []
    with open(LOG, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


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
    registra(tipo="leva", podcast=args.podcast, leva=n, ids=[e["video_id"] for e in falta])
    print(caminho)
    for e in falta:
        print(f"  {e['video_id']}  {e['data']}  {e['titulo'][:70]}")


def cmd_evento(args):
    registra(tipo=args.tipo, texto=args.texto, id=args.id)
    print("ok")


def cmd_cota(args):
    registra(tipo="cota", janela=args.janela, semana=args.semana)
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
    {"fila": cmd_fila, "leva": cmd_leva, "evento": cmd_evento,
     "cota": cmd_cota, "painel": cmd_painel}[args.cmd](args)


if __name__ == "__main__":
    main()
