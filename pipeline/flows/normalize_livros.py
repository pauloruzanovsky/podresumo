"""
Normalização do acervo de livros. SEM custo de API — só operações no Supabase.

Diferente de `cleanup_livros.py` (que tem uma lista fixa de IDs pra mesclar),
aqui as decisões saem de regras aplicadas sobre os dados atuais, então o script
continua valendo depois de cada sync.

O que faz:
  1. Marca o que não é livro (filme, documentário, série) com tipo = 'outro'
  2. Zera autores-lixo ("Não especificado", "Não mencionado") pra NULL
  3. Unifica variações do mesmo autor ("Nassim Taleb" → "Nassim Nicholas Taleb")
  4. Aplica correções pontuais de título/autor (lista revisada à mão)
  5. Mescla duplicatas: mesmo título ignorando subtítulo/acento, e pares
     PT/EN declarados em ALIASES

Quando duas entradas com o mesmo título trazem autores diferentes, o merge
acontece do mesmo jeito e o autor vira "Autor 1 / Autor 2" — a incerteza fica
visível pra quem lê, em vez de o script escolher um e errar em silêncio.

O que NÃO faz sozinho: separar títulos que juntaram dois livros numa entrada
só. Esses saem listados em REVISAR_MANUAL.

Uso:
    python -m flows.normalize_livros            # dry-run: só imprime o plano
    python -m flows.normalize_livros --apply    # executa

Requer a migração supabase/migrations/001_normalize_livros.sql.
"""

import argparse
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from load.supabase import supabase

# Títulos e nomes têm acento; o console do Windows não é utf-8 por padrão.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- regras ----

# Autor que na verdade é ausência de autor.
AUTOR_VAZIO = re.compile(r"^n[ãa]o\s+(especificado|mencionado|informado|consta)", re.I)

# Sinais de que a entrada não é um livro. O extrator captura filme e série
# citados na conversa junto com os livros.
NAO_LIVRO = re.compile(
    r"\(\s*(filme|document[áa]rio|s[ée]rie[^)]*|refer[êe]ncia ao filme[^)]*)\s*\)"
    r"|^\s*roteiro de\b",
    re.I,
)

# Ruído no fim do nome do autor: "(coautor)", "(Professor HOC)", "(mencionado
# como trabalho de X)". Não vale pros parênteses que marcam não-livro — esses
# são testados antes.
PARENTESE_FINAL = re.compile(r"\s*\([^)]*\)\s*$")

# Filme, documentário e série que o extrator capturou como livro. Ficam aqui
# por título porque a pista original (o campo autor dizia "(filme)") some
# depois que o autor-lixo vira NULL.
NAO_LIVRO_TITULOS = {
    "A Felicidade Não Se Compra",
    "Children of Men",
    "Love on the Spectrum",
    "Margin Call",
    "One Child Nation",
}

# Correções revisadas à mão. Chave = título atual no banco.
TITLE_FIXES = {
    "Tractus Logico-Philosophicus": "Tractatus Logico-Philosophicus",
    "Almanaque de Navios": "Almanaque de Naval Ravikant",
}

AUTHOR_FIXES = {
    "The War of Art": "Steven Pressfield",
    "The Comfort Crisis": "Michael Easter",
    "Almanaque de Navios": "Eric Jorgenson",
    "Uma Breve História da Inteligência": "Max Bennett",
    # Os três registros do mesmo livro (ver ALIASES) precisam do mesmo autor,
    # senão o merge acha que a autoria é incerta e junta os dois nomes.
    "A Máquina que Pensa": "Stephen Witt",
    "A criação da Nvidia e a máquina de pensar": "Stephen Witt",
    "A História da Nvidia": "Stephen Witt",
    # Extrações que discordaram do autor (nome ouvido errado na transcrição ou
    # só o sobrenome). Sem isto o merge exibia "Michael Conforto / Michel
    # Alcoforado" no site.
    "Coisa de Rico": "Michel Alcoforado",
    "Inteligência do Carisma": "Heni Ozi Cukier",
    "Crepúsculo dos Ídolos": "Friedrich Nietzsche",
    "Homens ou Fogo": "S. L. A. Marshall",
}

# Uma entrada que na verdade são duas obras. O extrator às vezes junta dois
# títulos citados na mesma frase; separar exige saber quais são, então fica
# aqui e não numa regra. Cada obra nova herda o contexto e o timestamp da
# citação original.
SPLITS = {
    "Jamaica e Rebecca": [
        ("Jamaica Inn", "Daphne du Maurier"),
        ("Rebecca", "Daphne du Maurier"),
    ],
}

# Mesma obra com títulos que nenhuma regra genérica aproxima (edição em outro
# idioma, título consagrado diferente). O primeiro da lista vira o canônico.
ALIASES = [
    ["Psicologia Financeira", "The Psychology of Money"],
    ["Arriscando a Própria Pele", "Skin in the Game"],
    ["Cartas a um Estoico", "Cartas"],
    # Mesmo livro do Stephen Witt registrado três vezes: uma pelo título, duas
    # pela descrição que o host deu no ar.
    ["A Máquina que Pensa", "A criação da Nvidia e a máquina de pensar",
     "A História da Nvidia"],
]

# Títulos genéricos que são de fato obras diferentes de autores diferentes.
# A regra geral (mesmo título = mesmo livro com metadado ruim) erra aqui:
# Pedro Calmon e Rocha Pombo escreveram cada um a sua "História do Brasil".
# Com um destes títulos, só se mescla o que tem o mesmo autor.
TITULOS_HOMONIMOS = {
    "História do Brasil",
}

# Entradas que precisam de decisão humana e que o script não tenta consertar.
REVISAR_MANUAL = {}


def sem_acento(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def slug_titulo(titulo: str) -> str:
    """Chave de comparação: sem subtítulo, sem acento, sem pontuação."""
    t = titulo.split(":")[0]
    t = re.split(r"\s+[-–—]\s+", t)[0]
    t = sem_acento(t).lower()
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def chave_autor(autor: str) -> str:
    """Primeiro + último token — junta 'Nassim Taleb' e 'Nassim Nicholas Taleb'.

    Nomes com mais de um autor ficam de fora dessa aproximação: colapsar
    'Neil Howe e William Strauss' em (neil, strauss) o fundiria com
    'Neil Strauss', que é outra pessoa.
    """
    normal = re.sub(r"[^\w\s]", " ", sem_acento(autor).lower())
    tokens = normal.split()
    if not tokens:
        return ""
    if re.search(r"\b(e|and|com)\b|,|&", sem_acento(autor).lower()):
        return " ".join(tokens)
    return f"{tokens[0]} {tokens[-1]}" if len(tokens) > 1 else tokens[0]


def limpa_autor(autor):
    """Autor exibível, ou None quando o episódio não disse quem escreveu."""
    if not autor:
        return None
    a = autor.strip()
    if AUTOR_VAZIO.match(a):
        return None
    a = PARENTESE_FINAL.sub("", a).strip()
    return a or None


def escolhe_forma(counter: Counter) -> str:
    """Forma mais frequente do nome. Empate → a mais completa; depois alfabética."""
    return min(counter.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))[0]


# ----------------------------------------------------------------- plano ----

def monta_plano(livros):
    """Decide tudo em memória, a partir do snapshot. Não escreve nada."""
    nao_livro_slugs = {slug_titulo(t) for t in NAO_LIVRO_TITULOS}

    estado = {}
    for l in livros:
        titulo = (l["titulo"] or "").strip()
        titulo = TITLE_FIXES.get(titulo, titulo)

        # A evidência de "não é livro" mora no campo autor ("Não especificado
        # (filme)") — que este mesmo script zera. Então `tipo` já gravado no
        # banco tem a palavra final: uma vez 'outro', continua 'outro'. Sem
        # isso a segunda execução promoveria os filmes de volta a livro.
        eh_outro = (
            (l.get("tipo") or "livro") == "outro"
            or slug_titulo(titulo) in nao_livro_slugs
            or bool(NAO_LIVRO.search(l.get("autor") or ""))
            or bool(NAO_LIVRO.search(l["titulo"] or ""))
        )
        autor = None if eh_outro else limpa_autor(l.get("autor"))
        if titulo in AUTHOR_FIXES:
            autor = AUTHOR_FIXES[titulo]

        estado[l["id"]] = {
            "id": l["id"],
            "titulo_orig": l["titulo"],
            "autor_orig": l.get("autor"),
            "titulo": titulo,
            "autor": autor,
            "tipo": "outro" if eh_outro else "livro",
            "tipo_orig": l.get("tipo") or "livro",
            "titulo_alt": list(l.get("titulo_alt") or []),
            "titulo_alt_orig": sorted(set(l.get("titulo_alt") or [])),
            "citacoes": len(l.get("episode_livros") or []),
        }

    # --- canonização de autor: a forma mais usada vence entre as variantes ---
    formas = defaultdict(Counter)
    for e in estado.values():
        if e["autor"]:
            formas[chave_autor(e["autor"])][e["autor"]] += e["citacoes"] or 1
    canonico_autor = {k: escolhe_forma(c) for k, c in formas.items()}
    for e in estado.values():
        if e["autor"]:
            e["autor"] = canonico_autor[chave_autor(e["autor"])]

    # --- agrupamento pra merge ---
    alias_de = {}
    for grupo in ALIASES:
        chave = f"alias:{slug_titulo(grupo[0])}"
        for titulo in grupo:
            alias_de[slug_titulo(titulo)] = chave
    ordem_alias = {slug_titulo(t): i for g in ALIASES for i, t in enumerate(g)}

    # Entradas que viram duas obras ficam fora de merge e update — elas deixam
    # de existir e são substituídas pelas obras separadas.
    splits = [
        (e, SPLITS[e["titulo_orig"]])
        for e in estado.values()
        if e["titulo_orig"] in SPLITS
    ]
    ids_split = {e["id"] for e, _ in splits}

    homonimos = {slug_titulo(t) for t in TITULOS_HOMONIMOS}

    grupos = defaultdict(list)
    for e in estado.values():
        if e["id"] in ids_split:
            continue
        slug = slug_titulo(e["titulo"])
        chave = alias_de.get(slug, slug)
        if slug in homonimos:
            chave = f"{chave}|{chave_autor(e['autor']) if e['autor'] else ''}"
        grupos[chave].append(e)

    merges, incertos = [], []
    for chave, membros in grupos.items():
        if len(membros) < 2:
            continue

        # Mesmo título com autores diferentes é quase sempre metadado ruim, não
        # dois livros distintos. Mescla assim mesmo e mostra os dois nomes
        # separados por " / " — a incerteza fica visível na UI em vez de o
        # script fingir que sabe qual está certo.
        autores = sorted({m["autor"] for m in membros if m["autor"]})

        if chave.startswith("alias:"):
            membros.sort(key=lambda m: ordem_alias.get(slug_titulo(m["titulo"]), 99))
        else:
            # mesmo título: fica o mais curto (sem subtítulo), com mais citações
            membros.sort(key=lambda m: (len(m["titulo"]), -m["citacoes"]))

        canonico, duplicatas = membros[0], membros[1:]
        canonico["autor"] = " / ".join(autores) if autores else None
        if len(autores) > 1:
            incertos.append(canonico)
        for d in duplicatas:
            if d["titulo"] != canonico["titulo"]:
                canonico["titulo_alt"].append(d["titulo"])
        # Só continua sendo 'outro' se nenhum membro do grupo era livro: "A
        # Grande Aposta" existe como livro do Michael Lewis e como filme, e a
        # entrada do filme não pode contaminar a do livro.
        canonico["tipo"] = "outro" if all(m["tipo"] == "outro" for m in membros) else "livro"
        merges.append((canonico, duplicatas))

    ids_removidos = {d["id"] for _, dups in merges for d in dups}

    updates = []
    for e in estado.values():
        if e["id"] in ids_removidos or e["id"] in ids_split:
            continue
        campos = {}
        if e["titulo"] != e["titulo_orig"]:
            campos["titulo"] = e["titulo"]
        if e["autor"] != e["autor_orig"]:
            campos["autor"] = e["autor"]
        if e["tipo"] != e["tipo_orig"]:
            campos["tipo"] = e["tipo"]
        alt = sorted(set(e["titulo_alt"]))
        if alt and alt != e["titulo_alt_orig"]:
            campos["titulo_alt"] = alt
        if campos:
            updates.append((e, campos))

    return estado, splits, merges, incertos, updates


# --------------------------------------------------------------- relatório ---

def imprime_plano(estado, splits, merges, incertos, updates):
    outros = [e for e in estado.values() if e["tipo"] == "outro"]
    print(f"\n=== NÃO SÃO LIVROS ({len(outros)}) ===")
    for e in sorted(outros, key=lambda e: e["titulo"]):
        print(f"  · {e['titulo']}  ←  autor original: {e['autor_orig']}")

    zerados = [
        e for e in estado.values()
        if e["autor"] is None and e["autor_orig"] and e["tipo"] == "livro"
    ]
    print(f"\n=== AUTOR VIRA NULL ({len(zerados)}) ===")
    for e in sorted(zerados, key=lambda e: e["titulo"]):
        print(f"  · {e['titulo']}  ←  \"{e['autor_orig']}\"")

    renomeados = [
        e for e in estado.values()
        if e["autor"] and e["autor_orig"] and e["autor"] != e["autor_orig"]
    ]
    print(f"\n=== AUTOR CANONIZADO ({len(renomeados)}) ===")
    for e in sorted(renomeados, key=lambda e: e["titulo"]):
        print(f"  · {e['titulo']}: \"{e['autor_orig']}\" → \"{e['autor']}\"")

    retitulados = [e for e in estado.values() if e["titulo"] != e["titulo_orig"]]
    print(f"\n=== TÍTULO CORRIGIDO ({len(retitulados)}) ===")
    for e in retitulados:
        print(f"  · \"{e['titulo_orig']}\" → \"{e['titulo']}\"")

    print(f"\n=== MERGES ({len(merges)}) ===")
    for canonico, duplicatas in merges:
        total = canonico["citacoes"] + sum(d["citacoes"] for d in duplicatas)
        plural = "citação" if total == 1 else "citações"
        print(f"  ✔ {canonico['titulo']} — {canonico['autor'] or 'sem autor'} "
              f"({total} {plural} após merge)")
        for d in duplicatas:
            print(f"      absorve: \"{d['titulo']}\" / {d['autor_orig']} "
                  f"({d['citacoes']} cit.)")

    print(f"\n=== SPLITS ({len(splits)}) ===")
    for e, alvos in splits:
        print(f"  ✂ \"{e['titulo_orig']}\" ({e['citacoes']} cit.) vira:")
        for titulo, autor in alvos:
            print(f"      {titulo} — {autor}")

    print(f"\n=== AUTORIA INCERTA — MERGE COM OS DOIS NOMES ({len(incertos)}) ===")
    for e in incertos:
        print(f"  ? {e['titulo']} → autor: \"{e['autor']}\"")

    pendentes = [e for e in estado.values() if e["titulo_orig"] in REVISAR_MANUAL]
    print(f"\n=== REVISAR À MÃO ({len(pendentes)}) ===")
    for e in pendentes:
        print(f"  ? {e['titulo_orig']}: {REVISAR_MANUAL[e['titulo_orig']]}")

    absorvidos = {d["id"] for _, ds in merges for d in ds}
    citacoes_extra = Counter()
    for canonico, duplicatas in merges:
        citacoes_extra[canonico["id"]] = sum(d["citacoes"] for d in duplicatas)

    ids_split = {e["id"] for e, _ in splits}
    # Cada split troca uma entrada por N obras — todas visíveis se a original era.
    novos_por_split = sum(
        len(alvos) for e, alvos in splits if e["citacoes"] > 0
    )

    sobrevivem = [
        e for e in estado.values()
        if e["id"] not in absorvidos and e["id"] not in ids_split
    ]
    livros_depois = [e for e in sobrevivem if e["tipo"] == "livro"]
    # O site só mostra livro com pelo menos uma citação — é esse número que
    # dá pra comparar com o que está no ar hoje.
    visiveis = [
        e for e in livros_depois if e["citacoes"] + citacoes_extra[e["id"]] > 0
    ]
    visiveis_hoje = len([
        e for e in estado.values()
        if e["citacoes"] > 0 and e["tipo_orig"] == "livro"
    ])

    print("\n=== RESUMO ===")
    print(f"  entradas hoje:          {len(estado)}")
    print(f"  removidas por merge:    {len(absorvidos)}")
    print(f"  marcadas como 'outro':  {len(outros)}")
    print(f"  updates de campo:       {len(updates)}")
    print(f"  splits:                 {len(splits)} (+{novos_por_split} obras)")
    print(f"  no site: {visiveis_hoje} → {len(visiveis) + novos_por_split} livros")


# ---------------------------------------------------------------- execução ---

def busca_ou_cria(titulo: str, autor):
    """ID do livro com esse título/autor, criando se não existir.

    Não dá pra usar upsert: `UNIQUE(titulo, autor)` não pega duas linhas com
    autor NULL, porque no Postgres NULL nunca colide com NULL.
    """
    q = supabase.table("livros").select("id").eq("titulo", titulo)
    q = q.is_("autor", "null") if autor is None else q.eq("autor", autor)
    achado = q.execute()
    if achado.data:
        return achado.data[0]["id"]
    criado = supabase.table("livros").insert(
        {"titulo": titulo, "autor": autor, "tipo": "livro"}
    ).execute()
    return criado.data[0]["id"]


def aplica_splits(splits):
    print("\n=== APLICANDO SPLITS ===")
    for e, alvos in splits:
        rels = supabase.table("episode_livros").select("*").eq(
            "livro_id", e["id"]
        ).execute()

        for titulo, autor in alvos:
            novo_id = busca_ou_cria(titulo, autor)
            for rel in rels.data:
                # Cada obra herda o contexto e o timestamp da citação original:
                # foi uma menção só, cobrindo as duas.
                supabase.table("episode_livros").upsert(
                    {
                        "episode_id": rel["episode_id"],
                        "livro_id": novo_id,
                        "contexto": rel.get("contexto"),
                        "timestamp_seg": rel.get("timestamp_seg"),
                    },
                    on_conflict="episode_id,livro_id",
                ).execute()
            print(f"  {e['titulo_orig']} → {titulo}")

        supabase.table("episode_livros").delete().eq("livro_id", e["id"]).execute()
        supabase.table("livros").delete().eq("id", e["id"]).execute()


def aplica_merges(merges):
    print("\n=== APLICANDO MERGES ===")
    for canonico, duplicatas in merges:
        for d in duplicatas:
            rels = supabase.table("episode_livros").select("*").eq(
                "livro_id", d["id"]
            ).execute()

            for rel in rels.data:
                existente = supabase.table("episode_livros").select("*").eq(
                    "episode_id", rel["episode_id"]
                ).eq("livro_id", canonico["id"]).execute()

                if existente.data:
                    # Já há citação nesse episódio: fica a que tem contexto.
                    atual = existente.data[0]
                    if not atual.get("contexto") and rel.get("contexto"):
                        supabase.table("episode_livros").update({
                            "contexto": rel["contexto"],
                            "timestamp_seg": rel.get("timestamp_seg"),
                        }).eq("episode_id", rel["episode_id"]).eq(
                            "livro_id", canonico["id"]
                        ).execute()
                    supabase.table("episode_livros").delete().eq(
                        "episode_id", rel["episode_id"]
                    ).eq("livro_id", d["id"]).execute()
                else:
                    supabase.table("episode_livros").update(
                        {"livro_id": canonico["id"]}
                    ).eq("episode_id", rel["episode_id"]).eq(
                        "livro_id", d["id"]
                    ).execute()

            supabase.table("livros").delete().eq("id", d["id"]).execute()
            print(f"  {canonico['titulo']} ← {d['titulo']}")


def aplica_updates(updates):
    print("\n=== APLICANDO UPDATES ===")
    for e, campos in updates:
        try:
            supabase.table("livros").update(campos).eq("id", e["id"]).execute()
            print(f"  {e['titulo']}: {campos}")
        except Exception as err:
            print(f"  FALHOU {e['titulo']}: {err}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="executa as mudanças (sem esta flag é só dry-run)")
    args = parser.parse_args()

    try:
        resp = supabase.table("livros").select(
            "id, titulo, autor, tipo, titulo_alt, episode_livros(episode_id)"
        ).execute()
        migrado = True
    except Exception:
        # Sem a migração ainda: dá pra ver o plano, não dá pra aplicar.
        resp = supabase.table("livros").select(
            "id, titulo, autor, episode_livros(episode_id)"
        ).execute()
        migrado = False

    estado, splits, merges, incertos, updates = monta_plano(resp.data)
    imprime_plano(estado, splits, merges, incertos, updates)

    if not migrado:
        print("\nAs colunas `tipo` e `titulo_alt` ainda não existem no banco.")
        print("Rode supabase/migrations/001_normalize_livros.sql antes de aplicar.")

    if not args.apply:
        print("\nDRY-RUN — nada foi gravado. Rode com --apply pra executar.")
        return

    if not migrado:
        print("\nAbortando: migração pendente.")
        return

    aplica_splits(splits)
    aplica_merges(merges)
    aplica_updates(updates)

    final = supabase.table("livros").select("id", count="exact").execute()
    livros = supabase.table("livros").select(
        "id", count="exact"
    ).eq("tipo", "livro").execute()
    print(f"\n=== FINAL: {final.count} entradas, {livros.count} livros ===")
    # NÃO rodar backfill_temas depois do reprocessamento: ele sobrescreve
    # livros.temas (temas do livro, vindos da extração) com as tags dos
    # episódios.
    print("Próximo passo: `python -m flows.backfill_capas`.")


if __name__ == "__main__":
    main()
