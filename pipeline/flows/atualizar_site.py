"""
Avisa o site que os dados mudaram. Desde 08/11/2026 o site não lê o banco:
lê um retrato tirado no build (web/scripts/retrato.mjs). Dado novo entra com
um deploy novo, e este aviso pede esse deploy pelo deploy hook da Vercel.
Roda sozinho no fim da coleta, das capas, das descrições e da fusão de livros.

    python -m flows.atualizar_site            # pede o deploy (no máx. 1 por hora)
    python -m flows.atualizar_site --agora    # pede mesmo que tenha pedido há pouco

Precisa de VERCEL_DEPLOY_HOOK no .env (Vercel > Settings > Git > Deploy Hooks).

No máximo um pedido por hora: a extração do acervo grava episódio por
episódio, e um deploy a cada gravação estouraria o limite diário da Vercel e
o próprio banco (cada build lê o banco inteiro). O que ficar de fora entra no
pedido seguinte ou no deploy diário (.github/workflows/deploy-diario.yml).
Falha aqui só avisa: o dado já está no banco.
"""

import os
import sys
import time
import urllib.request

from dotenv import load_dotenv

load_dotenv()

MARCA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "respostas", "ultimo_deploy.txt"
)
INTERVALO_S = 3600


def main(agora: bool = False):
    hook = os.getenv("VERCEL_DEPLOY_HOOK")
    if not hook:
        print("  site: sem VERCEL_DEPLOY_HOOK no .env; entra no deploy diário")
        return False
    if not agora and os.path.exists(MARCA):
        passou = time.time() - os.path.getmtime(MARCA)
        if passou < INTERVALO_S:
            print(f"  site: deploy pedido há {passou / 60:.0f} min; isto entra no próximo")
            return False
    try:
        with urllib.request.urlopen(urllib.request.Request(hook, method="POST"), timeout=30) as r:
            ok = 200 <= r.status < 300
    except Exception as erro:
        print(f"  site: pedido de deploy falhou ({erro}); entra no deploy diário")
        return False
    if ok:
        os.makedirs(os.path.dirname(MARCA), exist_ok=True)
        with open(MARCA, "w", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
        print("  site: deploy pedido; os dados novos entram em ~3 min")
    else:
        print("  site: pedido de deploy recusado")
    return ok


if __name__ == "__main__":
    main(agora="--agora" in sys.argv)
