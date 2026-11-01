"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compartilhar um endereço do site. No celular abre a folha do sistema, onde
 * está o WhatsApp; no computador copia o link, porque a folha do Windows é
 * pior que colar na conversa. A prévia quem monta é a própria página, pelo
 * Open Graph: aqui só viaja o título e o endereço.
 *
 * Com `texto` vira botão com nome; sem ele, só o ícone (e `rotulo` é o nome
 * que o leitor de tela anuncia).
 */
export default function Compartilhar({
  caminho,
  titulo,
  rotulo,
  texto,
}: {
  caminho: string;
  titulo: string;
  rotulo: string;
  texto?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    []
  );

  async function compartilhar() {
    const url = new URL(caminho, window.location.origin).href;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: titulo, url });
      } catch {
        // desistir da folha do sistema não é erro
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={compartilhar}
      aria-label={copiado ? "Link copiado" : rotulo}
      title={rotulo}
      className={`inline-flex items-center justify-center gap-2 shrink-0 border border-border bg-background/60 hover:bg-card-hover text-sm font-medium rounded-full transition-colors ${
        texto || copiado ? "px-4 py-2.5" : "w-10 h-10"
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {copiado ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
          />
        )}
      </svg>
      {copiado ? "Link copiado" : texto}
    </button>
  );
}
