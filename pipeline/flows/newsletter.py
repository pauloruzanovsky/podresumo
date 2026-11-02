"""
Monta o e-mail semanal e deixa como RASCUNHO no Resend — o Paulo revisa e envia
de lá. Nunca envia sozinho. Saiu do Buttondown porque o modelo dele reescrevia
o layout (tamanhos, cores, cabeçalho em inglês); aqui o HTML sai como está.

Conteúdo, de propósito curto (uma fala e três livros, não uma lista de links):
  1. abertura do Paulo (opcional, --abertura)
  2. a fala da semana: uma recomendação de verdade, com capa e minuto
  3. três livros, cada um com a fala de quem citou
  4. episódios da semana dos quatro podcasts, com quantos livros cada um rendeu
  5. "lá de fora": um livro do acervo em inglês, só em semana sem episódio novo em inglês
  6. fechamento com a conta da semana
  7. na primeira edição do mês, o placar de quem mais cita livros

Sem custo de API da Anthropic: só lê o banco e chama o Resend.

Configurar no pipeline/.env:
  RESEND_API_KEY=...        (resend.com/api-keys)
  RESEND_SEGMENT_ID=...     (resend.com/audience)
  AMAZON_TAG=...            (a mesma tag da Vercel; sem ela não há comissão)

Uso:
    python -m flows.newsletter --simular      # imprime o e-mail, não cria nada
    python -m flows.newsletter                # cria o rascunho no Resend
    python -m flows.newsletter --teste a@b.com  # manda só pra este endereço
    python -m flows.newsletter --dias 14      # janela diferente de 7 dias
    python -m flows.newsletter --abertura "Esta semana..."
"""

import argparse
import html
import os
import re
import sys
import unicodedata
import urllib.parse
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SITE = "https://podlibris.com"
REMETENTE = "Podlibris <livros@newsletter.podlibris.com>"
DESCADASTRO = "{{{RESEND_UNSUBSCRIBE_URL}}}"
PODCAST = "Os Sócios Podcast"
# Mesma regra do site (web/lib/podcasts.ts): quem apresenta fica fora do placar
# e o livro deles não vira destaque.
APRESENTADORES = {"Bruno Perini", "Malu Perini", "Chris Williamson", "Tim Ferriss", "Andrew Huberman"}
PODCASTS_EM_INGLES = ["Modern Wisdom", "The Tim Ferriss Show", "Huberman Lab"]
MAX_LIVROS = 3
# quatro podcasts dão uns 7 episódios por semana
MAX_EPISODIOS = 8
# `processed_at` muda a cada reprocessamento: sem este corte, episódio de 2023
# reextraído aparecia como novidade (388 livros numa semana). Com folga pro
# episódio que espera o lote de domingo.
EPISODIO_RECENTE_DIAS = 30
FALA_MIN, FALA_MAX = 40, 280

# Cores fixas da marca (brand/): e-mail não tem os tokens de tema do site.
TINTA, APAGADO, ACENTO, BORDA = "#2b2521", "#6b6155", "#1f5240", "#ddd3c1"
BRANCO = "#ffffff"
# PNG servido pelo próprio site: Gmail não mostra SVG.
TOPO = f"{SITE}/email/topo/verde"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
SERIFA = "Georgia, 'Times New Roman', serif"
SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"


def minuto(seg: int) -> str:
    h, m, s = seg // 3600, (seg % 3600) // 60, seg % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def link_amazon(titulo: str, autor: str | None) -> str:
    termo = f"{titulo} {autor}" if autor else titulo
    url = "https://www.amazon.com.br/s?" + urllib.parse.urlencode({"k": termo, "i": "stripbooks"})
    tag = os.getenv("AMAZON_TAG")
    return f"{url}&tag={urllib.parse.quote(tag)}" if tag else url


def slug_pessoa(nome: str) -> str:
    """O mesmo slug de web/lib/slug.ts: /pessoa/<slug> é a página da pessoa."""
    t = unicodedata.normalize("NFD", nome)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = re.sub(r"\bpodcast\b", "", t)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def titulo_limpo(titulo: str, numero: str | None) -> str:
    return titulo.rsplit("|", 1)[0].strip() if numero and "|" in titulo else titulo


def citacoes_de(ids: list[str]) -> list[dict]:
    citacoes = []
    for i in range(0, len(ids), 50):
        citacoes += (
            supabase.table("episode_livros")
            .select(
                "episode_id, citacao_literal, quem_citou, timestamp_seg, natureza, "
                "livros!inner(slug, titulo, autor, tipo, capa_url)"
            )
            .in_("episode_id", ids[i:i + 50])
            .eq("livros.tipo", "livro")
            .execute()
            .data
        )
    return citacoes


def carregar(dias: int):
    podcasts = supabase.table("podcasts").select("id, nome").execute().data
    podcast = next(p for p in podcasts if p["nome"] == PODCAST)
    nomes = {p["id"]: p["nome"] for p in podcasts}
    agora = datetime.now(timezone.utc)
    desde = (agora - timedelta(days=dias)).isoformat()
    recente = (agora - timedelta(days=EPISODIO_RECENTE_DIAS)).date().isoformat()

    # Os quatro podcasts: desde nov/2026 o lote semanal extrai os episódios
    # novos de todos, não só do Os Sócios.
    episodios = (
        supabase.table("episodes")
        .select("id, slug, titulo, ep_number, data, link_youtube, podcast_id")
        .eq("status", "done")
        .gte("processed_at", desde)
        .gte("data", recente)
        .order("data", desc=True)
        .execute()
        .data
    )
    for ep in episodios:
        ep["podcast"] = nomes[ep["podcast_id"]]
    citacoes = citacoes_de([e["id"] for e in episodios])

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

    # o "lá de fora" do acervo só entra em semana sem episódio novo em inglês
    em_ingles = any(ep["podcast"] in PODCASTS_EM_INGLES for ep in episodios)
    fora = None if em_ingles else rodizio(agora, [p for p in podcasts if p["nome"] in PODCASTS_EM_INGLES])
    # semana sem livro (só notícia, por exemplo): o e-mail abre com o acervo
    acervo = None if citacoes else rodizio(agora, [podcast])
    return episodios, citacoes, placar, fora, acervo


def boa_fala(c: dict) -> bool:
    """Fala que se sustenta sozinha: alguém indicando um livro que não é dele."""
    fala = c.get("citacao_literal") or ""
    autor = c["livros"]["autor"]
    return (
        FALA_MIN <= len(fala) <= FALA_MAX
        and c.get("natureza") == "recomenda"
        and bool(c.get("quem_citou"))
        and autor not in APRESENTADORES
        and autor != c.get("quem_citou")
    )


def rodizio(agora: datetime, podcasts: list[dict]) -> dict | None:
    """Uma recomendação do acervo destes podcasts, que gira por semana sem
    precisar guardar o que já saiu. Mantém as estantes em inglês no e-mail na
    semana em que elas não têm episódio novo."""
    if not podcasts:
        return None
    eps = (
        supabase.table("episodes")
        .select("id, slug, titulo, ep_number, data, link_youtube, podcast_id")
        .in_("podcast_id", [p["id"] for p in podcasts])
        .eq("status", "done")
        .execute()
        .data
    )
    por_ep = {e["id"]: e for e in eps}
    nomes = {p["id"]: p["nome"] for p in podcasts}
    boas = [c for c in citacoes_de(list(por_ep)) if boa_fala(c) and c.get("timestamp_seg") is not None]
    if not boas:
        return None
    boas.sort(key=lambda c: (c["episode_id"], c["livros"]["titulo"]))
    c = boas[agora.isocalendar().week % len(boas)]
    return {**c, "ep": por_ep[c["episode_id"]], "podcast": nomes[por_ep[c["episode_id"]]["podcast_id"]]}


def escolher(episodios, citacoes):
    """(a fala da semana, os livros seguintes). Um livro aparece uma vez só."""
    por_livro: dict[str, list] = {}
    for c in citacoes:
        por_livro.setdefault(c["livros"]["slug"] or c["livros"]["titulo"], []).append(c)
    podcast_de = {ep["id"]: ep.get("podcast") for ep in episodios}

    def nota(c):
        return (
            boa_fala(c),
            # e-mail em português: a fala em português abre, quando há uma boa
            podcast_de.get(c["episode_id"]) not in PODCASTS_EM_INGLES,
            c.get("quem_citou") not in APRESENTADORES,  # convidado antes do host
            bool(c["livros"].get("capa_url")),
            bool(c.get("citacao_literal")),
            c.get("citacao_literal") is not None and FALA_MIN <= len(c["citacao_literal"]) <= FALA_MAX,
        )

    melhores = sorted(
        (max(cs, key=nota) for cs in por_livro.values()
         if cs[0]["livros"]["autor"] not in APRESENTADORES),
        key=nota, reverse=True,
    )
    return melhores[0] if melhores else None, melhores[1:MAX_LIVROS + 1], len(por_livro)


def assunto_de(fala: dict | None, episodios, n_livros: int) -> str:
    if not fala:
        return f"Podlibris: {len(episodios)} {'episódio novo' if len(episodios) == 1 else 'episódios novos'}"
    frase = re.split(r"(?<=[.!?])\s", fala.get("citacao_literal") or "")[0]
    podcast = next((ep.get("podcast") for ep in episodios if ep["id"] == fala["episode_id"]), None)
    # fala em inglês não vira assunto de e-mail em português
    if boa_fala(fala) and len(frase) <= 70 and podcast not in PODCASTS_EM_INGLES:
        return f"“{frase}”"
    quem = fala.get("quem_citou")
    livro = fala["livros"]["titulo"]
    return f"O que {quem} disse sobre {livro}" if quem else f"{livro}, e mais {n_livros - 1} na estante"


# ─────────────────────────────────────────────────── html ───
# Tabelas e estilo inline: é o que todo cliente de e-mail respeita.

def e(texto) -> str:
    return html.escape(str(texto), quote=True)


def link(url: str, texto: str, cor: str = ACENTO) -> str:
    return f'<a href="{e(url)}" style="color:{cor};text-decoration:underline;">{e(texto)}</a>'


def rotulo(texto: str) -> str:
    return (f'<p style="margin:0 0 12px;font-family:{SANS};font-size:12px;letter-spacing:1px;'
            f'text-transform:uppercase;color:{APAGADO};">{e(texto)}</p>')


def de_quem(c: dict, ep: dict, podcast: str | None = None) -> str:
    quem = c.get("quem_citou")
    podcast = podcast or ep.get("podcast")
    # "#313" só diz algo pra quem ouve o Os Sócios; os outros vão pelo nome
    if ep.get("ep_number") and podcast in (None, PODCAST):
        onde = f"no #{ep['ep_number']}"
    else:
        onde = f"no {podcast}" if podcast else "no episódio"
    return f"{quem}, {onde}" if quem else f"Citado {onde}"


def acoes(c: dict, ep: dict) -> str:
    l = c["livros"]
    itens = []
    if c.get("timestamp_seg") is not None and ep.get("link_youtube"):
        itens.append(link(f"{ep['link_youtube']}&t={c['timestamp_seg']}s", f"Ouvir em {minuto(c['timestamp_seg'])}"))
    itens.append(link(f"{SITE}/livro/{l['slug']}", "Ver no site"))
    itens.append(link(link_amazon(l["titulo"], l["autor"]), "Comprar na Amazon"))
    return f'<span style="color:{APAGADO};"> · </span>'.join(itens)


def bloco_livro(c: dict, ep: dict, podcast: str | None = None, grande: bool = False) -> str:
    """Capa à esquerda e o texto à direita. Sem capa real, o texto ocupa tudo:
    capa gerada pelo site não existe como imagem pra e-mail."""
    l = c["livros"]
    largura = 112 if grande else 76
    capa = ""
    if l.get("capa_url"):
        classe = ' class="capa-grande"' if grande else ""
        capa = (f'<td{classe} width="{largura}" valign="top" style="padding:0 18px 0 0;">'
                f'<img src="{e(l["capa_url"])}" width="{largura}" alt="{e(l["titulo"])}" '
                f'style="display:block;width:{largura}px;height:auto;border:1px solid {BORDA};"></td>')
    fala = c.get("citacao_literal")
    corpo_fala = ""
    if fala:
        tam = 21 if grande else 16
        classe = ' class="fala-grande"' if grande else ""
        corpo_fala = (f'<p{classe} style="margin:0 0 10px;font-family:{SERIFA};font-size:{tam}px;'
                      f'line-height:1.4;color:{TINTA};">“{e(fala)}”</p>')
    autor = f'<span style="color:{APAGADO};"> — {e(l["autor"])}</span>' if l.get("autor") else ""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        f'{capa}<td valign="top" style="font-family:{SANS};font-size:14px;line-height:1.5;color:{TINTA};">'
        f'{corpo_fala}'
        f'<p style="margin:0 0 4px;"><strong>{e(l["titulo"])}</strong>{autor}</p>'
        f'<p style="margin:0 0 8px;color:{APAGADO};">{e(de_quem(c, ep, podcast))}</p>'
        f'<p style="margin:0;">{acoes(c, ep)}</p>'
        '</td></tr></table>'
    )


def divisor() -> str:
    return f'<div style="border-top:1px solid {BORDA};margin:28px 0;"></div>'


def cabecalho(hoje: date) -> str:
    """A figura da marca (web/app/email/topo) e a data da edição."""
    return (
        f'<a href="{SITE}" style="display:block;"><img src="{TOPO}" width="552" alt="Podlibris" '
        'style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:12px;"></a>'
        f'<p style="margin:14px 0 28px;font-family:{SANS};font-size:12px;letter-spacing:1px;'
        f'text-transform:uppercase;text-align:center;color:{APAGADO};">{hoje.day} de {MESES[hoje.month - 1]}</p>'
    )


def lista_episodios(episodios, citacoes) -> str:
    linhas = []
    for ep in episodios[:MAX_EPISODIOS]:
        n = len({c["livros"]["slug"] for c in citacoes if c["episode_id"] == ep["id"]})
        qtd = "sem livro citado" if n == 0 else f"{n} {'livro' if n == 1 else 'livros'}"
        if ep.get("podcast") and ep["podcast"] != PODCAST:
            qtd = f"{ep['podcast']} · {qtd}"
        numero = f"#{ep['ep_number']} " if ep.get("ep_number") and ep.get("podcast") in (None, PODCAST) else ""
        titulo = numero + titulo_limpo(ep["titulo"], ep["ep_number"])
        linhas.append(
            f'<p style="margin:0 0 8px;">{link(SITE + "/episodio/" + ep["slug"], titulo, TINTA)}'
            f'<span style="color:{APAGADO};"> · {qtd}</span></p>'
        )
    if len(episodios) > MAX_EPISODIOS:
        resto = f"Mais {len(episodios) - MAX_EPISODIOS} na lista de episódios"
        linhas.append(f'<p style="margin:0;">{link(SITE + "/episodios", resto)}</p>')
    return f'<div style="font-family:{SANS};font-size:14px;line-height:1.45;color:{TINTA};">{"".join(linhas)}</div>'


def montar(episodios, citacoes, placar, fora, acervo=None, abertura=None, hoje=None):
    hoje = hoje or date.today()
    por_ep = {ep["id"]: ep for ep in episodios}
    fala, livros, n_livros = escolher(episodios, citacoes)
    assunto = assunto_de(fala or acervo, episodios, n_livros)

    partes = [cabecalho(hoje)]
    if abertura:
        partes.append(f'<p style="margin:0 0 24px;font-family:{SERIFA};font-size:17px;'
                      f'line-height:1.5;color:{TINTA};">{e(abertura)}</p>')
    if fala:
        partes.append(rotulo("A fala da semana"))
        partes.append(bloco_livro(fala, por_ep[fala["episode_id"]], grande=True))
    elif acervo:
        partes.append(rotulo("Do acervo"))
        partes.append(bloco_livro(acervo, acervo["ep"], grande=True))
    if livros:
        partes.append(divisor())
        partes.append(rotulo("Mais três da semana" if len(livros) == 3 else "Também na semana"))
        blocos = [bloco_livro(c, por_ep[c["episode_id"]]) for c in livros]
        partes.append('<div style="height:22px;"></div>'.join(blocos))
    if episodios:
        partes.append(divisor())
        partes.append(rotulo("Episódios da semana"))
        partes.append(lista_episodios(episodios, citacoes))
    if fora:
        partes.append(divisor())
        partes.append(rotulo(f"Lá de fora: {fora['podcast']}"))
        partes.append(bloco_livro(fora, fora["ep"], fora["podcast"]))

    # o placar muda devagar: uma vez por mês basta
    if placar and hoje.day <= 7:
        partes.append(divisor())
        partes.append(rotulo("Quem mais cita livros"))
        linhas = "".join(
            f'<p style="margin:0 0 4px;">{i}. '
            + link(f"{SITE}/pessoa/{slug_pessoa(nome)}", nome)
            + f' <span style="color:{APAGADO};">{n} citações</span></p>'
            for i, (nome, n) in enumerate(placar, 1)
        )
        partes.append(f'<div style="font-family:{SANS};font-size:14px;color:{TINTA};">{linhas}</div>')

    n_ep = len(episodios)
    conta = f"{n_ep} {'episódio novo' if n_ep == 1 else 'episódios novos'}"
    if n_livros:
        conta += f" e {n_livros} {'livro citado' if n_livros == 1 else 'livros citados'}"
    conta += " esta semana. "
    partes.append(divisor())
    partes.append(
        f'<p style="margin:0;font-family:{SANS};font-size:14px;line-height:1.5;color:{APAGADO};">'
        f'{e(conta)}Todos os livros estão nas {link(SITE + "/#estantes", "estantes do Podlibris")}, '
        'com o minuto de cada citação.</p>'
    )
    partes.append(
        f'<p style="margin:18px 0 0;font-family:{SANS};font-size:12px;line-height:1.5;color:{APAGADO};">'
        f'Você recebe este e-mail porque se inscreveu em {link(SITE, "podlibris.com", APAGADO)}. '
        'Como associado da Amazon, o Podlibris ganha com compras qualificadas. '
        f'{link(DESCADASTRO, "Sair da lista", APAGADO)}.</p>'
    )
    return assunto, documento(assunto, fala or acervo, "\n".join(partes))


def documento(assunto: str, fala: dict | None, miolo: str) -> str:
    """O e-mail inteiro: fundo branco e coluna de 600px."""
    # o texto de prévia que aparece ao lado do assunto na caixa de entrada
    previa = (fala or {}).get("citacao_literal") or "Os livros citados nos podcasts da semana."
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="light only">'
        f'<title>{e(assunto)}</title>'
        '<style>@media (max-width:480px){'
        '.capa-grande,.capa-grande img{width:84px!important}'
        '.fala-grande{font-size:18px!important}'
        '.coluna{padding:24px 18px!important}}</style></head>'
        f'<body style="margin:0;padding:0;background-color:{BRANCO};">'
        f'<div style="display:none;max-height:0;overflow:hidden;">{e(previa)}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BRANCO}" '
        f'style="background-color:{BRANCO};"><tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="max-width:600px;"><tr><td class="coluna" align="left" style="padding:32px 24px;">'
        f'{miolo}</td></tr></table></td></tr></table></body></html>'
    )


def resend(caminho: str, dados: dict) -> dict:
    chave = os.getenv("RESEND_API_KEY")
    if not chave:
        sys.exit("Falta RESEND_API_KEY no pipeline/.env (resend.com/api-keys).")
    r = requests.post(
        f"https://api.resend.com/{caminho}",
        headers={"Authorization": f"Bearer {chave}"},
        json=dados,
        timeout=30,
    )
    if r.status_code >= 300:
        sys.exit(f"Resend recusou ({r.status_code}): {r.text[:300]}")
    return r.json()


def criar_rascunho(assunto: str, html_email: str):
    segmento = os.getenv("RESEND_SEGMENT_ID")
    if not segmento:
        sys.exit("Falta RESEND_SEGMENT_ID no pipeline/.env (resend.com/audience).")
    # Sem `send: true` o broadcast nasce rascunho: o Paulo revisa e envia.
    # Nunca passar `send` aqui.
    dados = resend("broadcasts", {
        "segment_id": segmento,
        "from": REMETENTE,
        "subject": assunto,
        "html": html_email,
        "name": assunto[:80],
    })
    print(f"Rascunho criado: {assunto}\n  id no Resend: {dados.get('id')}")
    print("  revise e envie em resend.com/broadcasts")


def enviar_teste(assunto: str, html_email: str, destino: str):
    """Só pra um endereço, fora da lista. Sem contato não há link de saída."""
    html_email = html_email.replace(DESCADASTRO, SITE)
    dados = resend("emails", {
        "from": REMETENTE, "to": [destino],
        "subject": f"[TESTE] {assunto}", "html": html_email,
    })
    print(f"Teste enviado pra {destino}: {dados.get('id')}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--simular", action="store_true", help="só imprime o e-mail")
    p.add_argument("--dias", type=int, default=7)
    p.add_argument("--abertura", help="texto do Paulo no topo do e-mail")
    p.add_argument("--teste", metavar="EMAIL", help="envia só pra este endereço, fora da lista")
    args = p.parse_args()

    episodios, citacoes, placar, fora, acervo = carregar(args.dias)
    if not episodios:
        print(f"Nenhum episódio novo nos últimos {args.dias} dias — sem e-mail esta semana.")
        return
    if not os.getenv("AMAZON_TAG"):
        print("ATENÇÃO: AMAZON_TAG não está no pipeline/.env: os links da Amazon saem sem comissão.", file=sys.stderr)

    assunto, corpo = montar(episodios, citacoes, placar, fora, acervo, args.abertura)
    if args.simular:
        print(f"ASSUNTO: {assunto}\n\n{corpo}")
        return
    if args.teste:
        enviar_teste(assunto, corpo, args.teste)
        return
    criar_rascunho(assunto, corpo)


if __name__ == "__main__":
    main()
