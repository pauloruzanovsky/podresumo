"""
Extract: YouTube Transcript
Busca a transcrição (legendas automáticas) de um vídeo.
"""

import os

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig


def cria_api() -> YouTubeTranscriptApi:
    """
    Usa proxy residencial se configurado no .env; senão, conexão direta
    (o YouTube bloqueia o IP depois de ~15 downloads).
    - PROXY_URL: qualquer serviço, ex. http://usuario:senha@geo.iproyal.com:12321
    - WEBSHARE_PROXY_USERNAME e WEBSHARE_PROXY_PASSWORD: Webshare
    """
    url = os.getenv("PROXY_URL")
    if url:
        return YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(http_url=url, https_url=url)
        )
    usuario = os.getenv("WEBSHARE_PROXY_USERNAME")
    senha = os.getenv("WEBSHARE_PROXY_PASSWORD")
    if usuario and senha:
        return YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(proxy_username=usuario, proxy_password=senha)
        )
    return YouTubeTranscriptApi()


def fetch_transcript(video_id: str) -> str:
    """
    Busca a transcrição de um vídeo do YouTube.

    Args:
        video_id: ID do vídeo (ex: "JJ5BXKnVvXk")
    Returns:
        Texto completo da transcrição
    """
    print(f"📝 Buscando transcrição do vídeo {video_id}...")

    ytt_api = cria_api()

    try:
        transcript = ytt_api.fetch(video_id, languages=["pt", "pt-BR"])
    except Exception:
        try:
            # Fallback: lista transcrições disponíveis e pega a primeira
            transcript_list = ytt_api.list(video_id)
            # Pega a primeira transcrição disponível
            first = next(iter(transcript_list))
            transcript = ytt_api.fetch(video_id, languages=[first.language_code])
        except Exception as e:
            print(f"❌ Transcrição não disponível: {e}")
            return ""

    # Junta trechos com timestamps no formato [HH:MM:SS]
    lines = []
    for entry in transcript:
        secs = int(entry.start)
        h, m, s = secs // 3600, (secs % 3600) // 60, secs % 60
        timestamp = f"[{h:02d}:{m:02d}:{s:02d}]"
        lines.append(f"{timestamp} {entry.text}")

    full_text = "\n".join(lines)

    print(f"✅ Transcrição extraída: {len(full_text)} caracteres")
    return full_text


# ─── Teste direto ───
if __name__ == "__main__":
    text = fetch_transcript("JJ5BXKnVvXk")

    if text:
        print(f"\n--- Primeiros 500 chars ---\n{text[:500]}")
        print(f"\n--- Últimos 200 chars ---\n{text[-200:]}")
        print(f"\n📊 Total: {len(text)} caracteres (~{len(text.split())} palavras)")
