"use client";

/**
 * Botão claro/escuro do cabeçalho. Quem decide o tema na primeira visita é o
 * script do layout (SCRIPT_TEMA), antes da página pintar; aqui só se troca e
 * se guarda a escolha. Os dois ícones vão no HTML e o CSS mostra o certo, pra
 * não piscar o ícone errado enquanto o React carrega.
 */

const CHAVE = "tema";

/** Roda no <head>: escolha salva, senão a preferência do sistema. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CHAVE}");if(t!=="claro"&&t!=="escuro")t=matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro";document.documentElement.dataset.theme=t==="escuro"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function TrocaTema() {
  function trocar() {
    const raiz = document.documentElement;
    const escuro = raiz.dataset.theme !== "dark";
    raiz.dataset.theme = escuro ? "dark" : "light";
    try {
      localStorage.setItem(CHAVE, escuro ? "escuro" : "claro");
    } catch {
      // navegação anônima sem armazenamento: troca vale só nesta página
    }
  }

  return (
    <button
      type="button"
      onClick={trocar}
      className="ml-1 grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
    >
      <span className="sr-only dark:hidden">Mudar para o tema escuro</span>
      <span className="sr-only hidden dark:inline">Mudar para o tema claro</span>
      {/* lua: aparece no claro */}
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] dark:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
      {/* sol: aparece no escuro */}
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] hidden dark:block" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
    </button>
  );
}
