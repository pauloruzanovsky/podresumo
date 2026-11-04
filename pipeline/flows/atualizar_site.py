"""
Avisa o site que os dados mudaram. As páginas ficam 1 dia em cache na
Vercel; sem este aviso, livro novo levaria até um dia pra aparecer na home e
nas estantes. Roda sozinho no fim da coleta, das capas e da fusão de livros.

    python -m flows.atualizar_site

Precisa de ATUALIZAR_SEGREDO no .env (o mesmo valor que está na Vercel).
Falha aqui só avisa: o dado já está no banco e aparece no máximo em um dia.
"""

import os
import urllib.request

from dotenv import load_dotenv

load_dotenv()

SITE = os.getenv("SITE_URL", "https://podlibris.com")


def main():
    segredo = os.getenv("ATUALIZAR_SEGREDO")
    if not segredo:
        print("  site: sem ATUALIZAR_SEGREDO no .env, não avisei (atualiza em até 1 dia)")
        return False
    pedido = urllib.request.Request(
        f"{SITE}/api/atualizar",
        method="POST",
        headers={"Authorization": f"Bearer {segredo}"},
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30) as resposta:
            ok = resposta.status == 200
    except Exception as erro:
        print(f"  site: aviso falhou ({erro}); atualiza em até 1 dia")
        return False
    print("  site: páginas marcadas pra atualizar" if ok else "  site: aviso recusado")
    return ok


if __name__ == "__main__":
    main()
