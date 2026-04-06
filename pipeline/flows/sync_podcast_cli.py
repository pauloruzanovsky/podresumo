"""
CLI wrapper para o flow sync_podcast.
Permite execução via linha de comando com argumentos.
"""

import argparse
from flows.sync_podcast import sync_podcast


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync podcast episodes")
    parser.add_argument("--playlist-id", required=True, help="YouTube playlist ID")
    parser.add_argument("--podcast-id", required=True, help="Supabase podcast UUID")
    parser.add_argument("--max-results", type=int, default=3, help="Max episodes to process")

    args = parser.parse_args()

    sync_podcast(
        playlist_id=args.playlist_id,
        podcast_id=args.podcast_id,
        max_results=args.max_results,
    )
