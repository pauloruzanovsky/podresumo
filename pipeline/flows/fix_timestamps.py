"""
Corrige timestamps dos livros usando busca determinística na transcrição.
Também busca transcrições faltantes do YouTube e salva no banco.

SEM CUSTO DE API — não chama o Claude, só faz busca de texto.

Uso:
    python -m flows.fix_timestamps
"""

import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from extract.transcript import fetch_transcript
from load.supabase import supabase


def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculo."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def find_timestamp(transcript: str, titulo_livro: str) -> int | None:
    """Busca o timestamp real na transcrição por palavras-chave do título."""
    stopwords = {"de", "do", "da", "dos", "das", "um", "uma", "the", "and", "of", "for",
                 "era", "como", "que", "por", "para", "com", "sobre", "nas", "nos"}
    palavras = [
        _normalize(p) for p in titulo_livro.split()
        if len(p) >= 3 and p.lower() not in stopwords
    ]
    if not palavras:
        return None

    threshold = max(2, len(palavras) * 2 // 3)
    linhas = transcript.split("\n")

    for i, linha in enumerate(linhas):
        window = _normalize(" ".join(linhas[max(0, i):i + 3]))
        matches = sum(1 for p in palavras if p in window)
        if matches >= threshold:
            ts_match = re.match(r"\[(\d{2}):(\d{2}):(\d{2})\]", linha)
            if ts_match:
                h, m, s = int(ts_match.group(1)), int(ts_match.group(2)), int(ts_match.group(3))
                return h * 3600 + m * 60 + s
    return None


def main():
    # 1. Buscar transcrições faltantes do YouTube
    missing = supabase.table("episodes").select("id, titulo").is_("transcricao", "null").execute()
    if missing.data:
        print(f"\n--- Buscando {len(missing.data)} transcrições faltantes ---\n")
        for ep in missing.data:
            print(f"  {ep['titulo'][:60]}...")
            transcript = fetch_transcript(ep["id"])
            if transcript:
                supabase.table("episodes").update(
                    {"transcricao": transcript}
                ).eq("id", ep["id"]).execute()
                print(f"    Salva ({len(transcript)} chars)")
            else:
                print(f"    Sem transcrição disponível")
    else:
        print("Todas as transcrições já estão no banco.")

    # 2. Recalcular TODOS os timestamps
    print(f"\n--- Recalculando timestamps ---\n")

    # Buscar todas as relações episode_livros com dados do livro e transcrição
    rels = supabase.table("episode_livros").select(
        "episode_id, livro_id, livros(titulo), episodes(titulo, transcricao)"
    ).execute()

    updated = 0
    not_found = 0

    for rel in rels.data:
        livro_titulo = rel["livros"]["titulo"]
        transcript = rel["episodes"].get("transcricao")

        if not transcript:
            continue

        ts = find_timestamp(transcript, livro_titulo)

        if ts:
            supabase.table("episode_livros").update(
                {"timestamp_seg": ts}
            ).eq("episode_id", rel["episode_id"]).eq("livro_id", rel["livro_id"]).execute()

            m, s = divmod(ts, 60)
            h, m = divmod(m, 60)
            print(f"  {livro_titulo[:45]:45s} -> {h:02d}:{m:02d}:{s:02d}")
            updated += 1
        else:
            print(f"  {livro_titulo[:45]:45s} -> NAO ENCONTRADO")
            not_found += 1

    print(f"\n--- Resultado ---")
    print(f"  Atualizados: {updated}")
    print(f"  Nao encontrados: {not_found}")


if __name__ == "__main__":
    main()
