"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ItemIndice } from "@/lib/indice";

/**
 * Índice lateral do podcast: todos os episódios, com os já mapeados
 * clicáveis e os demais apagados como "em breve".
 *
 * No computador fica fixo ao lado do conteúdo. No celular não há lateral,
 * então vira uma barra que abre a lista.
 */
export default function EpisodeIndex({
  itens,
  atualId,
  podcastNome,
}: {
  itens: ItemIndice[];
  /** Episódio aberto na página, pra destacar e rolar até ele. */
  atualId?: string;
  podcastNome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [soMapeados, setSoMapeados] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const atual = useRef<HTMLLIElement>(null);

  const mapeados = itens.filter((i) => i.mapeado).length;
  const visiveis = soMapeados ? itens.filter((i) => i.mapeado) : itens;

  // Rola só a lista (não a página) até o episódio aberto.
  useEffect(() => {
    if (lista.current && atual.current) {
      // offsetTop é relativo à própria lista (ela é `relative`).
      lista.current.scrollTop =
        atual.current.offsetTop -
        lista.current.clientHeight / 2 +
        atual.current.clientHeight / 2;
    }
  }, [atualId, aberto, soMapeados]);

  return (
    <aside
      aria-label={`Episódios de ${podcastNome}`}
      className="mb-8 lg:mb-0 lg:sticky lg:top-20 flex flex-col bg-card border border-border rounded-2xl lg:max-h-[calc(100vh-6.5rem)]"
    >
      <div className="p-4 pb-3">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="w-full flex items-center justify-between gap-3 text-left lg:pointer-events-none"
        >
          <span className="font-serif text-lg font-semibold">Episódios</span>
          <svg
            className={`w-4 h-4 text-muted lg:hidden transition-transform ${aberto ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <p className="text-xs text-muted mt-1">
          <span className="font-semibold text-foreground">{mapeados}</span> de{" "}
          {itens.length} com os livros mapeados
        </p>
        <div
          className="h-1.5 mt-2 rounded-full bg-border overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={itens.length}
          aria-valuenow={mapeados}
          aria-label="Episódios mapeados"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${(mapeados / Math.max(itens.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      <div className={`${aberto ? "flex" : "hidden"} lg:flex flex-col min-h-0`}>
        <label className="flex items-center gap-2 px-4 pb-3 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soMapeados}
            onChange={(e) => setSoMapeados(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Só os mapeados
        </label>

        <ol
          ref={lista}
          className="relative overflow-y-auto max-h-96 lg:max-h-none border-t border-border divide-y divide-border"
        >
          {visiveis.map((item) => {
            const ehAtual = item.id === atualId;
            const numero = (
              <span className="font-mono text-[11px] w-9 shrink-0 pt-px">
                {item.numero ? `#${item.numero}` : "—"}
              </span>
            );

            if (!item.mapeado) {
              return (
                <li
                  key={item.id}
                  className="flex gap-2 px-4 py-2.5 text-muted/60"
                >
                  {numero}
                  <span className="min-w-0">
                    <span className="block text-xs leading-snug line-clamp-2">
                      {item.titulo}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider mt-0.5">
                      em breve
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.id} ref={ehAtual ? atual : undefined}>
                <Link
                  href={`/episodio/${item.id}`}
                  aria-current={ehAtual ? "page" : undefined}
                  className={`group flex gap-2 px-4 py-2.5 transition-colors ${
                    ehAtual
                      ? "bg-card-hover shadow-[inset_3px_0_0_var(--color-accent)]"
                      : "hover:bg-card-hover"
                  }`}
                >
                  <span className="text-accent-light font-semibold flex">
                    {numero}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-snug line-clamp-2 group-hover:underline">
                      {item.titulo}
                    </span>
                    <span className="block text-[11px] text-muted mt-0.5">
                      {item.livros === 0
                        ? "nenhum livro citado"
                        : `${item.livros} ${item.livros === 1 ? "livro" : "livros"}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
