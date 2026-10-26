"""
Gera os SVGs do ícone do Podlibris a partir das medidas abaixo, tiradas da
referência (referencia-identidade.webp). Mexeu numa medida? Rode de novo:

    python brand/gera_marca.py brand
"""

import os, sys, textwrap

DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
VERDE, CREME, OURO = "#0F2E24", "#F7F2E7", "#C9A06B"

LIVRO = ("M0 20 L10.7 22.9 V49.3 Q32 52 50 72.9 Q68 52 89.3 49.3 V22.9 L100 20 "
         "V61.8 Q72 63 50 75.7 Q28 63 0 61.8 Z")
# (centro, topo, base) de cada onda
ONDAS = [(21.4, 17.9, 45), (35.7, 10.7, 47.5), (50, 0, 59.3), (64.3, 10.7, 47.5), (78.6, 17.9, 45)]


def desenho(cor_ondas, largura=6.4):
    r = largura / 2
    ondas = "\n".join(
        f'    <rect x="{c - r:.2f}" y="{t}" width="{largura}" height="{b - t:.1f}" rx="{r}"/>'
        for c, t, b in ONDAS
    )
    return (f'  <g fill="{cor_ondas}">\n{ondas}\n  </g>\n'
            f'  <path fill="{OURO}" d="{LIVRO}"/>\n')


def icone(cor_ondas):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 76" role="img" aria-label="Podlibris">\n'
            + desenho(cor_ondas) + '</svg>\n')


def app(fundo, cor_ondas, escala, largura=6.4):
    # centraliza o desenho (100 x 75.7) no quadrado de 100
    lado = 100 * escala
    tx, ty = (100 - lado) / 2, (100 - 75.7 * escala) / 2
    corpo = textwrap.indent(desenho(cor_ondas, largura), "  ")
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Podlibris">\n'
            f'  <rect width="100" height="100" rx="22" fill="{fundo}"/>\n'
            f'  <g transform="translate({tx:.2f} {ty:.2f}) scale({escala})">\n'
            + corpo + '  </g>\n</svg>\n')


arquivos = {
    "podlibris-icone-claro.svg": icone(VERDE),
    "podlibris-icone-escuro.svg": icone(CREME),
    "podlibris-app-escuro.svg": app(VERDE, CREME, 0.66),
    "podlibris-app-claro.svg": app(CREME, VERDE, 0.66),
    # a 16px as ondas finas somem: desenho maior e ondas mais grossas
    "podlibris-favicon.svg": app(VERDE, CREME, 0.84, largura=9),
}
for nome, svg in arquivos.items():
    with open(os.path.join(DEST, nome), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    print(nome)
