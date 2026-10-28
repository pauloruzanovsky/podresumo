"""
Transform: minuto da citação

O modelo copia o minuto da linha da transcrição, e às vezes erra na cópia —
quase sempre somando uma hora ("[01:09:09]" em vez de "[00:27:09]", com o
próprio contexto dizendo a linha certa). Em 2026-10-28 eram 71 de ~1.500
citações. A fala literal, por outro lado, vem certa.

Então a fala manda: se ela aparece num único ponto da transcrição, esse é o
minuto. Se aparece em mais de um (vinheta de abertura que repete o trecho,
bordão repetido) ou não aparece, fica o minuto que o modelo deu.
"""

import re
import unicodedata
from difflib import SequenceMatcher

PALAVRAS = 8  # o começo da fala que é procurado
SEMELHANCA = 0.9  # tolera o modelo ter limpado um "né", uma vírgula
SEPARA = 30  # segundos: achados mais próximos que isso são o mesmo trecho


def _palavras(texto: str) -> list[str]:
    t = unicodedata.normalize("NFD", (texto or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", t).split()


def _por_palavra(transcricao: str) -> list[tuple[int, str]]:
    """Cada palavra da transcrição com o segundo da linha em que está."""
    out = []
    for linha in (transcricao or "").splitlines():
        m = re.match(r"\[(\d+):(\d+):(\d+)\]\s?(.*)", linha)
        if m:
            h, mi, s, texto = m.groups()
            seg = int(h) * 3600 + int(mi) * 60 + int(s)
            out.extend((seg, p) for p in _palavras(texto))
    return out


def ocorrencias(fala: str, transcricao: str) -> list[int]:
    """Segundos em que o começo da fala aparece na transcrição."""
    alvo = _palavras(fala)[:PALAVRAS]
    if len(alvo) < 4:  # curta demais pra ser única
        return []
    texto_alvo = " ".join(alvo)
    pal = _por_palavra(transcricao)
    so = [p for _, p in pal]
    n = len(alvo)
    achados: list[int] = []
    for i in range(len(so) - n + 1):
        # só compara onde alguma das 3 primeiras palavras bate (senão é lento)
        if not any(so[i + k] == alvo[k] for k in range(3)):
            continue
        if SequenceMatcher(None, texto_alvo, " ".join(so[i:i + n])).ratio() >= SEMELHANCA:
            if not achados or pal[i][0] - achados[-1] > SEPARA:
                achados.append(pal[i][0])
    return achados


def confere_minuto(fala: str | None, segundos: int | None, transcricao: str | None) -> int | None:
    """O minuto a gravar: o da fala, quando ela é única na transcrição e o
    informado está a mais de um minuto dela; senão, o informado."""
    if not fala or not transcricao:
        return segundos
    achados = ocorrencias(fala, transcricao)
    if len(achados) != 1:
        return segundos
    if segundos is None or abs(segundos - achados[0]) > 60:
        return achados[0]
    return segundos
