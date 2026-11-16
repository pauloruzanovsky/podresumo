"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hrefEpisodio } from "@/lib/links";
import type { ItemIndice } from "@/lib/indice";

/**
 * Índice lateral do podcast: os episódios com página, cada um com quantos
 * livros cita.
 *
 * No computador fica fixo ao lado do conteúdo. No celular não há lateral,
 * então vira uma barra que abre a lista.
 *
 * Na página de episódio vem só um pedaço (lib/indice: vizinhos) e `todos`
 * leva pra lista inteira, na estante do podcast.
 */
export default function EpisodeIndex({
  itens,
  atualId,
  podcastNome,
  todos,
}: {
  itens: ItemIndice[];
  /** Episódio aberto na página, pra destacar e rolar até ele. */
  atualId?: string;
  podcastNome: string;
  /** Quando `itens` é só um pedaço: quantos são e onde está a lista inteira. */
  todos?: { total: number; href: string };
}) {
  const [aberto, setAberto] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const atual = useRef<HTMLLIElement>(null);

  // Quem chega pelo "Ver os N episódios" (#episodios) quer a lista: no
  // celular ela começa fechada.
  const caixa = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#episodios") return;
    setAberto(true);
    // a lista aberta muda a altura; rola de novo depois de pintar
    requestAnimationFrame(() => caixa.current?.scrollIntoView());
  }, []);

  // Rola só a lista (não a página) até o episódio aberto.
  useEffect(() => {
    if (lista.current && atual.current) {
      // offsetTop é relativo à própria lista (ela é `relative`).
      lista.current.scrollTop =
        atual.current.offsetTop -
        lista.current.clientHeight / 2 +
        atual.current.clientHeight / 2;
    }
  }, [atualId, aberto]);

  return (
    <aside
      ref={caixa}
      id="episodios"
      aria-label={`Episódios de ${podcastNome}`}
      className="scroll-mt-20 mb-8 lg:mb-0 lg:sticky lg:top-20 flex flex-col bg-card border border-border rounded-2xl lg:max-h-[calc(100vh-6.5rem)]"
    >
      <div className="p-4">
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
      </div>

      <div className={`${aberto ? "flex" : "hidden"} lg:flex flex-col min-h-0`}>
        <ol
          ref={lista}
          className="relative overflow-y-auto max-h-96 lg:max-h-none border-t border-border divide-y divide-border"
        >
          {itens.map((item) => {
            const ehAtual = item.id === atualId;
            const numero = (
              <span className="font-mono text-[11px] w-9 shrink-0 pt-px">
                {item.numero ? `#${item.numero}` : "—"}
              </span>
            );

            return (
              <li key={item.id} ref={ehAtual ? atual : undefined}>
                <Link
                  href={hrefEpisodio(item)}
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
        {todos && todos.total > itens.length && (
          <Link
            href={todos.href}
            className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border text-xs font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors rounded-b-2xl"
          >
            Ver os {todos.total} episódios
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </aside>
  );
}
