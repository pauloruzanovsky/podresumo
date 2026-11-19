"""
Posts do LinkedIn: calendário, carrossel e a página privada pra revisar.

O Paulo posta na sexta; a rotina de segunda (podlibris-post-semanal) prepara o
post da sexta seguinte, pra dar tempo de ele ler e ajustar. Cada post vive em
posts/<pasta>/ (post.txt, carrossel.html, slide-N.png, carrossel.pdf) e o
calendário em posts/calendario.json:

    {"data": "AAAA-MM-DD", "titulo", "formato", "status": "preparado" |
     "publicado" | "cancelado", "pasta", "nota"}

Uso:
    python -m flows.posts proxima          # a sexta do próximo post e o que já há
    python -m flows.posts render <pasta>   # carrossel.html -> slide-N.png e o PDF
    python -m flows.posts pagina           # posts/pagina/index.html + lista de arquivos
    python -m flows.posts publicado <data> # marca o post da data como publicado

Sem custo de API: o texto e o carrossel são escritos pela sessão da rotina.
"""

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSTS = os.path.join(RAIZ, "posts")
CALENDARIO = os.path.join(POSTS, "calendario.json")
PAGINA = os.path.join(POSTS, "pagina")
URL_PAGINA = "https://claude.ai/artifact/9D5RAD7eHcEo1VDxENnD8c"
CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def calendario() -> list[dict]:
    with open(CALENDARIO, encoding="utf-8") as f:
        return sorted(json.load(f), key=lambda p: p["data"])


def grava(cal: list[dict]):
    with open(CALENDARIO, "w", encoding="utf-8") as f:
        json.dump(sorted(cal, key=lambda p: p["data"]), f, ensure_ascii=False, indent=1)
        f.write("\n")


def proxima_sexta(hoje: date | None = None) -> date:
    """A sexta desta semana (ou a de hoje); depois da sexta, a da seguinte."""
    hoje = hoje or date.today()
    return hoje + timedelta(days=(4 - hoje.weekday()) % 7)


def proximo_post(hoje: date | None = None) -> dict | None:
    """O post preparado pra hoje ou depois, se houver."""
    hoje = (hoje or date.today()).isoformat()
    return next((p for p in calendario() if p["data"] >= hoje and p["status"] == "preparado"), None)


def navegador() -> str:
    for c in CHROME:
        if os.path.exists(c):
            return c
    sys.exit("Nem Chrome nem Edge instalados: não dá pra renderizar o carrossel.")


def render(pasta: str):
    """Cada slide vira PNG (carrossel.html?s=N mostra só o N) e o arquivo
    inteiro vira o PDF que sobe no LinkedIn como documento."""
    base = os.path.join(POSTS, pasta)
    fonte = os.path.join(base, "carrossel.html")
    texto = open(fonte, encoding="utf-8").read()
    n = len(re.findall(r'class="slide[\s"]', texto))
    if not n:
        sys.exit("carrossel.html sem nenhum .slide")
    exe = navegador()
    url = "file:///" + fonte.replace("\\", "/")
    comum = [exe, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw"]
    for i in range(1, n + 1):
        saida = os.path.join(base, f"slide-{i}.png")
        subprocess.run(comum + ["--window-size=1080,1350", f"--screenshot={saida}", f"{url}?s={i}"],
                       check=True, capture_output=True, timeout=120)
        print(f"  slide-{i}.png")
    pdf = os.path.join(base, "carrossel.pdf")
    subprocess.run(comum + ["--no-pdf-header-footer", f"--print-to-pdf={pdf}", url],
                   check=True, capture_output=True, timeout=120)
    print(f"  carrossel.pdf ({n} páginas)")


def data_br(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{DIAS[d.weekday()]} {d:%d/%m}"


def pagina():
    """posts/pagina/index.html: o calendário e, embaixo, o post da vez (o
    próximo preparado, senão o último publicado). Imprime o mapa de arquivos
    pra publicar junto."""
    cal = calendario()
    hoje = date.today()
    alvo = proximo_post(hoje) or next((p for p in reversed(cal) if p.get("pasta")), None)
    os.makedirs(PAGINA, exist_ok=True)
    for f in os.listdir(PAGINA):
        if f.endswith(".png"):
            os.remove(os.path.join(PAGINA, f))

    # semanas: as dos posts e as sextas até a próxima, sem buraco
    sextas = sorted({date.fromisoformat(p["data"]) - timedelta(days=(date.fromisoformat(p["data"]).weekday() - 4) % 7)
                     for p in cal} | {proxima_sexta(hoje)})
    semanas, s = [], sextas[0]
    while s <= max(sextas):
        semanas.append(s)
        s += timedelta(days=7)
    por_semana = {}
    for p in cal:
        d = date.fromisoformat(p["data"])
        por_semana.setdefault(d - timedelta(days=(d.weekday() - 4) % 7), []).append(p)

    ROTULO = {"publicado": "Publicado", "preparado": "Pra revisar", "cancelado": "Cancelado"}
    linhas = []
    for sexta in reversed(semanas):
        posts = por_semana.get(sexta, [])
        if not posts:
            estado = "falta" if sexta >= hoje else "vazio"
            texto = ("A rotina de segunda prepara" if sexta >= hoje else "Sem post")
            linhas.append(f'<li class="semana {estado}"><span class="dia">{data_br(sexta.isoformat())}</span>'
                          f'<span class="t">{texto}</span><span class="pill {estado}">'
                          f'{"A preparar" if sexta >= hoje else "—"}</span></li>')
            continue
        for p in posts:
            st = p["status"]
            nota = f'<span class="nota">{html.escape(p.get("nota") or "")}</span>' if p.get("nota") else ""
            linhas.append(f'<li class="semana {st}"><span class="dia">{data_br(p["data"])}</span>'
                          f'<span class="t"><b>{html.escape(p["titulo"])}</b> · {html.escape(p["formato"])}{nota}</span>'
                          f'<span class="pill {st}">{ROTULO.get(st, st)}</span></li>')

    arquivos = {}
    detalhe = ""
    if alvo and alvo.get("pasta"):
        base = os.path.join(POSTS, alvo["pasta"])
        texto_post = ""
        if os.path.exists(os.path.join(base, "post.txt")):
            texto_post = open(os.path.join(base, "post.txt"), encoding="utf-8").read().strip()
        slides = sorted((f for f in os.listdir(base) if re.fullmatch(r"slide-\d+\.png", f)),
                        key=lambda f: int(re.findall(r"\d+", f)[0]))
        figs = []
        for f in slides:
            shutil.copy(os.path.join(base, f), os.path.join(PAGINA, f))
            arquivos[f] = os.path.join("posts", "pagina", f)
            figs.append(f'<figure><img src="{f}" alt="{f[:-4]}"><figcaption>{f[6:-4]}</figcaption></figure>')
        quando = ("Pra postar na " + data_br(alvo["data"])) if alvo["status"] == "preparado" \
            else ("Postado na " + data_br(alvo["data"]))
        pdf = f"posts\\{alvo['pasta']}\\carrossel.pdf"
        detalhe = f"""
  <section>
    <p class="rotulo">{quando}</p>
    <div class="linha"><h2>{html.escape(alvo["titulo"])}</h2>
      <button type="button" id="copiar">Copiar texto</button></div>
    <div class="post" id="texto">{html.escape(texto_post)}</div>
    {'<p class="sub">No LinkedIn, suba o PDF como documento: <code>' + pdf + '</code> na pasta do projeto. Pra mudar alguma coisa, peça pro Claude: ele ajusta o texto ou os slides e publica de novo aqui.</p><div class="slides">' + "".join(figs) + "</div>" if figs else ""}
  </section>"""

    modelo = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "painel", "posts-modelo.html"),
                  encoding="utf-8").read()
    pagina_html = (modelo.replace("<!--CALENDARIO-->", "\n".join(linhas))
                   .replace("<!--DETALHE-->", detalhe)
                   .replace("<!--ATUALIZADO-->", f"{hoje:%d/%m/%Y}"))
    with open(os.path.join(PAGINA, "index.html"), "w", encoding="utf-8") as f:
        f.write(pagina_html)
    print(os.path.join(PAGINA, "index.html"))
    print("arquivos:", json.dumps(arquivos))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("proxima")
    r = sub.add_parser("render"); r.add_argument("pasta")
    sub.add_parser("pagina")
    pb = sub.add_parser("publicado"); pb.add_argument("data")
    a = p.parse_args()

    if a.cmd == "proxima":
        sexta = proxima_sexta()
        ja = [x for x in calendario() if x["data"] == sexta.isoformat()]
        print(f"próxima sexta: {sexta.isoformat()}")
        print("já tem post:" if ja else "nenhum post ainda pra essa sexta", *(x["titulo"] for x in ja))
        print("posts anteriores (não repetir o tema):")
        for x in calendario():
            print(f"  {x['data']} [{x['status']}] {x['titulo']} · {x['formato']}")
    elif a.cmd == "render":
        render(a.pasta)
    elif a.cmd == "pagina":
        pagina()
    elif a.cmd == "publicado":
        cal = calendario()
        for x in cal:
            if x["data"] == a.data:
                x["status"] = "publicado"
        grava(cal)


if __name__ == "__main__":
    main()
