"""
Extract: YouTube Data API v3
Busca episódios de uma playlist do YouTube.
"""

import os
import re
from dotenv import load_dotenv
from googleapiclient.discovery import build

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")


def get_youtube_client():
    """Cria o cliente da YouTube API."""
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)


def parse_duration(duration_str: str) -> str:
    """
    Converte duração ISO 8601 (PT2H15M30S) para formato legível (2h15min).
    """
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str)
    if not match:
        return duration_str

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)

    if hours > 0:
        return f"{hours}h{minutes:02d}min"
    return f"{minutes}min"


def extract_episode_number(title: str) -> str | None:
    """
    Extrai o número do episódio do título.
    Ex: "... | Os Sócios 288" → "288"
        "... | Os Sócios Podcast 288" → "288"
        "... | Modern Wisdom 753" → "753"
        "#753 - ..." → "753"
    """
    # Padrão "Os Sócios [Podcast] NNN"
    match = re.search(r"(?:Os Sócios|Sócios)\s*(?:Podcast\s*)?(\d+)", title, re.IGNORECASE)
    if match:
        return match.group(1)
    # Padrão "#NNN" no início
    match = re.search(r"#(\d+)", title)
    if match:
        return match.group(1)
    # Padrão "Modern Wisdom NNN"
    match = re.search(r"Modern Wisdom\s*(\d+)", title, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def fetch_episodes(playlist_id: str, max_results: int = 10) -> list[dict]:
    """
    Busca os últimos N episódios de uma playlist do YouTube.

    Args:
        playlist_id: ID da playlist (ex: "PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf")
        max_results: Quantidade máxima de episódios

    Returns:
        Lista de dicts com: video_id, titulo, data, duracao, thumbnail, descricao
    """
    youtube = get_youtube_client()

    # 1. Listar os vídeos da playlist
    print(f"📋 Buscando últimos {max_results} vídeos da playlist...")
    playlist_response = youtube.playlistItems().list(
        part="snippet",
        playlistId=playlist_id,
        maxResults=min(max_results, 50),
    ).execute()

    video_ids = []
    for item in playlist_response["items"]:
        video_ids.append(item["snippet"]["resourceId"]["videoId"])

    # 2. Buscar detalhes de cada vídeo (duração)
    print(f"📊 Buscando detalhes de {len(video_ids)} vídeos...")
    videos_response = youtube.videos().list(
        part="snippet,contentDetails",
        id=",".join(video_ids),
    ).execute()

    # 3. Montar a lista final
    episodes = []
    for video in videos_response["items"]:
        titulo = video["snippet"]["title"]
        ep_number = extract_episode_number(titulo)
        episodes.append({
            "video_id": video["id"],
            "ep_number": ep_number,
            "titulo": titulo,
            "data": video["snippet"]["publishedAt"][:10],
            "duracao": parse_duration(video["contentDetails"]["duration"]),
            "thumbnail": video["snippet"]["thumbnails"]["high"]["url"],
            "descricao": video["snippet"]["description"][:500],
        })

    print(f"✅ {len(episodes)} episódios extraídos")
    return episodes


# ─── Teste direto ───
if __name__ == "__main__":
    import json

    PLAYLIST_OS_SOCIOS = "PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf"
    episodes = fetch_episodes(PLAYLIST_OS_SOCIOS, max_results=3)
    print("\n" + json.dumps(episodes, indent=2, ensure_ascii=False))
