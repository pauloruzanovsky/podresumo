"""
Flow: Sync Podcast
Orquestra o pipeline completo: Extract → Transform → Load
"""

import re
import time
import unicodedata

from prefect import flow, task
from extract.youtube import fetch_episodes
from extract.transcript import fetch_transcript
from transform.claude import process_transcript
from load.supabase import save_episode


def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculo."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _find_timestamp(transcript: str, titulo_livro: str) -> int | None:
    """Busca o timestamp real de onde o livro foi mencionado na transcrição."""
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


@task(name="fetch-episodes", retries=2, retry_delay_seconds=10)
def task_fetch_episodes(playlist_id: str, max_results: int) -> list[dict]:
    """Busca lista de episódios do YouTube."""
    return fetch_episodes(playlist_id, max_results)


@task(name="fetch-transcript", retries=2, retry_delay_seconds=10)
def task_fetch_transcript(video_id: str) -> str:
    """Busca transcrição de um vídeo."""
    return fetch_transcript(video_id)


@task(name="process-with-ai", retries=1, retry_delay_seconds=30)
def task_process_with_ai(transcript: str, titulo: str) -> dict:
    """Processa transcrição com Claude."""
    return process_transcript(transcript, titulo)


@task(name="save-to-db", retries=2, retry_delay_seconds=5)
def task_save_to_db(video_id: str, podcast_id: str, metadata: dict, ai_data: dict, transcript: str = None):
    """Salva episódio no Supabase."""
    save_episode(video_id, podcast_id, metadata, ai_data, transcript)


@flow(name="sync-podcast", log_prints=True)
def sync_podcast(
    playlist_id: str,
    podcast_id: str,
    max_results: int = 3,
    skip_existing: bool = True,
):
    """
    Pipeline completo: busca episódios do YouTube, processa com IA e salva no banco.

    Args:
        playlist_id: ID da playlist do YouTube
        podcast_id: UUID do podcast no Supabase
        max_results: Quantos episódios processar
        skip_existing: Pular episódios já processados
    """
    # 1. EXTRACT — buscar lista de episódios
    episodes = task_fetch_episodes(playlist_id, max_results)
    print(f"\n{'='*60}")
    print(f"📋 {len(episodes)} episódios encontrados")
    print(f"{'='*60}\n")

    processed = 0
    skipped = 0

    for i, ep in enumerate(episodes):
        video_id = ep["video_id"]
        titulo = ep["titulo"]

        print(f"\n--- [{i+1}/{len(episodes)}] {titulo[:60]} ---")

        # Verificar se já existe no banco
        if skip_existing:
            from load.supabase import supabase
            existing = supabase.table("episodes").select("id").eq("id", video_id).execute()
            if existing.data:
                print(f"   ⏭️ Já processado, pulando...")
                skipped += 1
                continue

        # 2. EXTRACT — buscar transcrição
        transcript = task_fetch_transcript(video_id)
        if not transcript:
            print(f"   ⚠️ Sem transcrição, pulando...")
            continue

        # Rate limit: aguardar entre chamadas ao Claude
        if processed > 0:
            print(f"   ⏳ Aguardando 90s (rate limit)...")
            time.sleep(90)

        # 3. TRANSFORM — processar com Claude (com retry)
        ai_data = None
        for attempt in range(3):
            try:
                ai_data = task_process_with_ai(transcript, titulo)
                break
            except Exception as e:
                if "rate_limit" in str(e) and attempt < 2:
                    print(f"   ⏳ Rate limit, aguardando 120s (tentativa {attempt + 2}/3)...")
                    time.sleep(120)
                else:
                    print(f"   ❌ Erro: {e}")
                    break
        if not ai_data:
            print(f"   ⚠️ Erro no processamento IA, pulando...")
            continue

        # 3.5. ENRICH — buscar timestamps reais dos livros na transcrição
        for livro in ai_data.get("livros", []):
            livro["timestamp_seg"] = _find_timestamp(transcript, livro["titulo"])

        # 4. LOAD — salvar no banco
        metadata = {
            "ep_number": ep.get("ep_number"),
            "titulo": titulo,
            "data": ep["data"],
            "duracao": ep["duracao"],
            "thumbnail": ep["thumbnail"],
        }
        task_save_to_db(video_id, podcast_id, metadata, ai_data, transcript)
        processed += 1

    print(f"\n{'='*60}")
    print(f"🏁 Pipeline finalizado!")
    print(f"   ✅ Processados: {processed}")
    print(f"   ⏭️ Pulados (já existiam): {skipped}")
    print(f"   📊 Total: {len(episodes)}")
    print(f"{'='*60}")


# ─── Execução direta ───
if __name__ == "__main__":
    sync_podcast(
        playlist_id="PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf",
        podcast_id="a1b2c3d4-0000-0000-0000-000000000001",
        max_results=1,  # Começa com 1 para testar
    )
