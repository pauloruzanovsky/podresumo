"""
Reprocessa episódios existentes para extrair contexto e timestamp dos livros.
Também salva a transcrição bruta no banco (raw layer).

Uso:
    python -m flows.reprocess_livros
"""

import json
import os
import re
import sys
import time
import unicodedata
from dotenv import load_dotenv
from anthropic import Anthropic
from supabase import create_client

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract.transcript import fetch_transcript
from load.supabase import supabase, upsert_livros

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """Você é um assistente especializado em analisar transcrições de podcasts brasileiros.
Dado uma transcrição, extraia APENAS os livros mencionados com contexto.
Responda APENAS com o JSON, sem markdown, sem explicações, sem ```."""

USER_PROMPT = """Analise a transcrição abaixo e retorne um JSON com APENAS os livros mencionados:

{{
  "livros": [
    {{"titulo": "Nome do Livro", "autor": "Nome do Autor", "contexto": "1-2 frases explicando como o livro foi citado"}}
  ]
}}

REGRAS:
- Liste TODOS os livros explicitamente mencionados, incluindo contos e artigos científicos citados pelo nome.
- "contexto" deve explicar COMO o livro foi citado na conversa (ex: "O apresentador recomendou como leitura essencial para entender investimentos").
- Se nenhum livro foi citado, retorne {{"livros": []}}.

TÍTULO: {titulo}

TRANSCRIÇÃO:
{transcript}"""


def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculo."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def find_timestamp_in_transcript(transcript: str, titulo_livro: str) -> int | None:
    """
    Busca o timestamp real de onde o livro foi mencionado na transcrição.
    Usa janela de 3 linhas consecutivas para capturar títulos que foram
    quebrados em múltiplas linhas da transcrição.

    Returns:
        Timestamp em segundos, ou None se não encontrado.
    """
    stopwords = {"de", "do", "da", "dos", "das", "um", "uma", "the", "and", "of", "for",
                 "era", "como", "que", "por", "para", "com", "sobre", "nas", "nos"}
    palavras = [
        _normalize(p) for p in titulo_livro.split()
        if len(p) >= 3 and p.lower() not in stopwords
    ]

    if not palavras:
        return None

    # Threshold: pelo menos 2 palavras, ou todas se o título é curto
    threshold = max(2, len(palavras) * 2 // 3)

    linhas = transcript.split("\n")

    for i, linha in enumerate(linhas):
        # Janela de 3 linhas consecutivas (título pode estar partido)
        window = _normalize(" ".join(linhas[max(0, i):i + 3]))
        matches = sum(1 for p in palavras if p in window)

        if matches >= threshold:
            # Extrair o timestamp [HH:MM:SS] da primeira linha da janela
            ts_match = re.match(r"\[(\d{2}):(\d{2}):(\d{2})\]", linha)
            if ts_match:
                h, m, s = int(ts_match.group(1)), int(ts_match.group(2)), int(ts_match.group(3))
                return h * 3600 + m * 60 + s

    return None


def reprocess_all():
    """Reprocessa todos os episódios para extrair livros com contexto."""
    # Busca todos os episódios do banco (inclui transcrição se já salva)
    result = supabase.table("episodes").select("id, titulo, transcricao").order("data").execute()
    episodes = result.data

    print(f"\n{'='*60}")
    print(f"📚 Reprocessando {len(episodes)} episódios para livros com contexto")
    print(f"{'='*60}\n")

    for i, ep in enumerate(episodes):
        video_id = ep["id"]
        titulo = ep["titulo"]
        print(f"\n--- [{i+1}/{len(episodes)}] {titulo[:60]} ---")

        # 1. Usar transcrição do banco se já salva, senão buscar do YouTube
        transcript = ep.get("transcricao")
        if transcript:
            print(f"   📄 Transcrição já salva no banco")
        else:
            transcript = fetch_transcript(video_id)
            if not transcript:
                print(f"   ⚠️ Sem transcrição, pulando...")
                continue
            # Salvar no banco (raw layer)
            supabase.table("episodes").update(
                {"transcricao": transcript}
            ).eq("id", video_id).execute()
            print(f"   💾 Transcrição salva no banco")

        # 3. Chamar Claude com prompt focado em livros
        max_chars = 150_000
        transcript_input = transcript[:max_chars] if len(transcript) > max_chars else transcript

        # Rate limit: aguardar 90s entre chamadas (50k tokens/min)
        if i > 0:
            print(f"   ⏳ Aguardando 90s (rate limit)...")
            time.sleep(90)

        # Retry automático em caso de rate limit
        for attempt in range(3):
            try:
                message = client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1000,
                    temperature=0.2,
                    system=SYSTEM_PROMPT,
                    messages=[{
                        "role": "user",
                        "content": USER_PROMPT.format(titulo=titulo, transcript=transcript_input),
                    }],
                )
                break
            except Exception as e:
                if "rate_limit" in str(e) and attempt < 2:
                    print(f"   ⏳ Rate limit, aguardando 120s (tentativa {attempt + 2}/3)...")
                    time.sleep(120)
                else:
                    raise

        response_text = message.content[0].text
        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                data = json.loads(json_match.group())
            else:
                print(f"   ❌ Resposta inválida, pulando...")
                continue

        livros = data.get("livros", [])
        if livros:
            # Buscar timestamp real na transcrição (determinístico, não LLM)
            for livro in livros:
                ts = find_timestamp_in_transcript(transcript, livro["titulo"])
                livro["timestamp_seg"] = ts
                if ts:
                    m, s = divmod(ts, 60)
                    h, m = divmod(m, 60)
                    print(f"   ⏱️ {livro['titulo'][:40]} → {h:02d}:{m:02d}:{s:02d}")
                else:
                    print(f"   ⚠️ {livro['titulo'][:40]} → timestamp não encontrado")

            # Limpar relações antigas para reinserir com contexto
            supabase.table("episode_livros").delete().eq("episode_id", video_id).execute()
            upsert_livros(video_id, livros)
            print(f"   ✅ {len(livros)} livros atualizados com contexto")
        else:
            print(f"   📭 Nenhum livro mencionado")

    print(f"\n{'='*60}")
    print(f"🏁 Reprocessamento concluído!")
    print(f"{'='*60}")


if __name__ == "__main__":
    reprocess_all()
