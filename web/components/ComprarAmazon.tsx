"use client";

import { useEffect, useState } from "react";

interface Props {
  br: string;
  /** Null quando o livro não tem link nos EUA (lib/links). */
  eua: string | null;
  estilo: "botao" | "link";
}

const CLASSES = {
  botao:
    "inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold rounded-full transition-colors",
  link: "text-sm font-semibold text-accent-light underline underline-offset-2 hover:text-accent",
};

/**
 * As páginas são ISR, então o servidor não sabe de onde vem o visitante: o
 * idioma do navegador decide no cliente. Quem não lê português vê a amazon.com
 * como principal; o HTML sai sempre com a do Brasil, o público do site.
 */
export default function ComprarAmazon({ br, eua, estilo }: Props) {
  const [estrangeiro, setEstrangeiro] = useState(false);
  useEffect(() => {
    if (eua && !navigator.language.toLowerCase().startsWith("pt")) setEstrangeiro(true);
  }, [eua]);

  const principal = estrangeiro && eua ? eua : br;
  return (
    <>
      <a href={principal} target="_blank" rel="noopener noreferrer sponsored" className={CLASSES[estilo]}>
        {estrangeiro ? "Buy on Amazon" : "Comprar na Amazon"}
        {estilo === "botao" && (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M9 7h8v8" />
          </svg>
        )}
      </a>
      {eua && (
        <a
          href={estrangeiro ? br : eua}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          {estrangeiro ? "Amazon Brasil" : "Amazon EUA"}
        </a>
      )}
    </>
  );
}
