"""
Exporta as quatro tabelas do Supabase, inteiras (com as transcrições), em
JSON Lines comprimido: backup/<tabela>.jsonl.gz. Só biblioteca padrão, pra
rodar no GitHub Actions sem instalar nada (.github/workflows/backup-banco.yml).

O banco é o Nano do plano grátis (0,5 GB) e travou por Disk IO em 08/11/2026:
as transcrições vêm em páginas pequenas e com pausa, pra não repetir.

    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python backup_banco.py [pasta]

Restaurar: criar as tabelas com supabase/schema.sql e as migrações, na
ordem; depois inserir podcasts, livros, episodes e episode_livros, nessa
ordem (chaves estrangeiras), lendo cada .jsonl.gz.
"""

import gzip
import json
import os
import sys
import time
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
CHAVE = os.environ["SUPABASE_SERVICE_KEY"]
PASTA = sys.argv[1] if len(sys.argv) > 1 else "backup"

# tabela -> (ordem estável pra paginar, linhas por página)
TABELAS = {
    "podcasts": ("id", 1000),
    "livros": ("id", 1000),
    "episodes": ("id", 25),  # ~265 KB de transcrição por linha
    "episode_livros": ("episode_id,livro_id", 1000),
}


def pagina(tabela: str, ordem: str, de: int, n: int) -> list:
    pedido = urllib.request.Request(
        f"{URL}/rest/v1/{tabela}?select=*&order={ordem}&offset={de}&limit={n}",
        headers={"apikey": CHAVE, "Authorization": f"Bearer {CHAVE}"},
    )
    for tentativa in range(1, 5):
        try:
            with urllib.request.urlopen(pedido, timeout=120) as r:
                return json.load(r)
        except Exception as erro:
            if tentativa == 4:
                raise RuntimeError(f"{tabela} a partir de {de}: {erro}") from erro
            print(f"  {tabela} a partir de {de} falhou ({erro}); tentando de novo", flush=True)
            time.sleep(15 * tentativa)


def main():
    os.makedirs(PASTA, exist_ok=True)
    resumo = {}
    for tabela, (ordem, n) in TABELAS.items():
        total = 0
        with gzip.open(os.path.join(PASTA, f"{tabela}.jsonl.gz"), "wt", encoding="utf-8") as f:
            de = 0
            while True:
                linhas = pagina(tabela, ordem, de, n)
                for linha in linhas:
                    f.write(json.dumps(linha, ensure_ascii=False) + "\n")
                total += len(linhas)
                if len(linhas) < n:
                    break
                de += n
                time.sleep(1 if n < 1000 else 0.2)
        resumo[tabela] = total
        print(f"  {tabela}: {total} linhas", flush=True)
    with open(os.path.join(PASTA, "resumo.json"), "w", encoding="utf-8") as f:
        json.dump({"gerado_em": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()), **resumo}, f)
    if not resumo["episodes"] or not resumo["livros"]:
        sys.exit("backup vazio: o banco respondeu sem linhas")


if __name__ == "__main__":
    main()
