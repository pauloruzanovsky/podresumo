"""
Load: Supabase (PostgreSQL)
Insere episódios processados no banco de dados.
"""

import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def upsert_episode(video_id: str, podcast_id: str, metadata: dict, ai_data: dict, transcript: str = None) -> str:
    """
    Insere ou atualiza um episódio no banco.

    Args:
        video_id: ID do vídeo do YouTube
        podcast_id: UUID do podcast no banco
        metadata: Dados do YouTube (titulo, data, duracao, thumbnail)
        ai_data: Dados gerados pelo Claude (resumo, main_insight, etc.)
        transcript: Transcrição bruta (raw layer)

    Returns:
        ID do episódio inserido
    """
    print(f"💾 Salvando episódio: {metadata['titulo'][:60]}...")

    episode_data = {
        "id": video_id,
        "podcast_id": podcast_id,
        "ep_number": metadata.get("ep_number"),
        "titulo": metadata["titulo"],
        "data": metadata["data"],
        "duracao": metadata["duracao"],
        "thumbnail": metadata["thumbnail"],
        "convidados": ai_data.get("convidados", []),
        "tags": ai_data.get("tags", []),
        "resumo": ai_data.get("resumo", ""),
        "main_insight": ai_data.get("main_insight", ""),
        "main_action": ai_data.get("main_action", ""),
        "topicos": ai_data.get("topicos", []),
        "link_youtube": f"https://www.youtube.com/watch?v={video_id}",
        "status": "done",
        "processed_at": datetime.now().isoformat(),
        "transcricao": transcript,
    }

    # Upsert: insere se não existe, atualiza se já existe
    supabase.table("episodes").upsert(episode_data).execute()

    print(f"   ✅ Episódio salvo: {video_id}")
    return video_id


def upsert_livros(video_id: str, livros: list[dict]) -> int:
    """
    Insere livros e cria relações com o episódio.

    Args:
        video_id: ID do episódio
        livros: Lista de dicts com {titulo, autor}

    Returns:
        Quantidade de livros processados
    """
    if not livros:
        return 0

    print(f"📚 Salvando {len(livros)} livros...")

    for livro in livros:
        # 1. Upsert do livro (ignora se já existe por UNIQUE)
        result = supabase.table("livros").upsert(
            {"titulo": livro["titulo"], "autor": livro["autor"]},
            on_conflict="titulo,autor",
        ).execute()

        # 2. Pegar o ID do livro (pode ser novo ou existente)
        livro_query = supabase.table("livros").select("id").eq(
            "titulo", livro["titulo"]
        ).eq("autor", livro["autor"]).single().execute()

        livro_id = livro_query.data["id"]

        # 3. Inserir relação episode_livros (ignora se já existe)
        supabase.table("episode_livros").upsert(
            {
                "episode_id": video_id,
                "livro_id": livro_id,
                "contexto": livro.get("contexto"),
                "timestamp_seg": livro.get("timestamp_seg"),
            },
            on_conflict="episode_id,livro_id",
        ).execute()

    print(f"   ✅ {len(livros)} livros vinculados ao episódio")
    return len(livros)


def save_episode(video_id: str, podcast_id: str, metadata: dict, ai_data: dict, transcript: str = None):
    """
    Função principal: salva episódio + livros no banco.
    Combina upsert_episode + upsert_livros.
    """
    upsert_episode(video_id, podcast_id, metadata, ai_data, transcript)
    upsert_livros(video_id, ai_data.get("livros", []))
    print(f"🎉 Episódio {video_id} salvo com sucesso no banco!")


# ─── Teste direto ───
if __name__ == "__main__":
    # Dados de teste (simulando output do Extract + Transform)
    test_metadata = {
        "titulo": "TESTE: Episódio de Teste",
        "data": "2026-03-17",
        "duracao": "1h30min",
        "thumbnail": "https://example.com/thumb.jpg",
    }

    test_ai_data = {
        "resumo": "Este é um episódio de teste para validar o pipeline de carga.",
        "main_insight": "Testar cada parte isoladamente é essencial para um pipeline robusto.",
        "main_action": "Sempre escreva testes antes de integrar componentes.",
        "topicos": ["Testes", "Pipeline", "Qualidade"],
        "convidados": ["Convidado Teste"],
        "tags": ["Tecnologia", "Testes"],
        "livros": [
            {"titulo": "Clean Code", "autor": "Robert C. Martin"},
            {"titulo": "O Poder do Hábito", "autor": "Charles Duhigg"},
        ],
    }

    PODCAST_ID = "a1b2c3d4-0000-0000-0000-000000000001"

    save_episode("test-video-123", PODCAST_ID, test_metadata, test_ai_data)
