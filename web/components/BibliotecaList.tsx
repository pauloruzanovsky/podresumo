"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import BookCover from "./BookCover";
import PodcastFilter from "./PodcastFilter";

interface Livro {
  id: string;
  titulo: string;
  autor: string | null;
  episodios_count: number;
  podcasts: string[];
  ultima_data: string | null;
  temas: string[];
  contexto: string | null;
  capa_url: string | null;
}

type SortMode = "citacoes" | "recente" | "az";

// 148 temas distintos em 157 livros: a lista inteira seria tão inútil quanto o
// antigo select de 123 autores. A cabeça da distribuição cobre a maioria — e
// com 12 os chips empurravam o primeiro livro pra fora da tela no celular.
const MAX_TEMAS = 8;

export default function BibliotecaList({
  livros,
  initialQuery = "",
}: {
  livros: Livro[];
  initialQuery?: string;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [activePodcast, setActivePodcast] = useState<string | null>(null);
  const [activeTema, setActiveTema] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("citacoes");

  const podcasts = useMemo(() => {
    const counts = livros.reduce((acc, livro) => {
      for (const nome of livro.podcasts) acc[nome] = (acc[nome] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [livros]);

  const temas = useMemo(() => {
    const counts = livros.reduce((acc, livro) => {
      for (const tema of livro.temas) acc[tema] = (acc[tema] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TEMAS);
  }, [livros]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = livros.filter((livro) => {
      const matchSearch =
        q === "" ||
        livro.titulo.toLowerCase().includes(q) ||
        (livro.autor?.toLowerCase().includes(q) ?? false);
      const matchPodcast =
        !activePodcast || livro.podcasts.includes(activePodcast);
      const matchTema = !activeTema || livro.temas.includes(activeTema);
      return matchSearch && matchPodcast && matchTema;
    });

    return result.sort((a, b) => {
      if (sortMode === "az") return a.titulo.localeCompare(b.titulo);
      if (sortMode === "recente") {
        const da = a.ultima_data ?? "";
        const db = b.ultima_data ?? "";
        if (db === da) return b.episodios_count - a.episodios_count;
        return db > da ? 1 : -1;
      }
      if (b.episodios_count === a.episodios_count) {
        return a.titulo.localeCompare(b.titulo);
      }
      return b.episodios_count - a.episodios_count;
    });
  }, [livros, search, activePodcast, activeTema, sortMode]);

  const hasFilters = !!search || !!activePodcast || !!activeTema;

  function clearAll() {
    setSearch("");
    setActivePodcast(null);
    setActiveTema(null);
  }

  return (
    <div>
      {/* Busca */}
      <div className="relative mb-5">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Buscar por título ou autor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-foreground/30 transition-all"
        />
      </div>

      {/* Temas — no celular viram uma faixa de rolagem horizontal. Em 375px os
          12 chips quebravam em 7 linhas e empurravam a estante inteira pra
          fora da tela; em uma linha que desliza, ocupam 1. */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 mb-3 overflow-x-auto sm:overflow-visible tags-scroll -mx-1 px-1">
        {temas.map(([tema, n]) => {
          const ativo = activeTema === tema;
          return (
            <button
              key={tema}
              onClick={() => setActiveTema(ativo ? null : tema)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                ativo
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {tema}
              <span className={ativo ? "text-white/60 ml-1.5" : "text-muted/50 ml-1.5"}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <PodcastFilter
        podcasts={podcasts}
        activePodcast={activePodcast}
        onToggle={(nome) => setActivePodcast(activePodcast === nome ? null : nome)}
      />

      {/* Ordenação + contagem */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <span className="text-xs text-muted">
          {filtered.length} livro{filtered.length !== 1 ? "s" : ""}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-3 text-foreground underline"
            >
              limpar filtros
            </button>
          )}
        </span>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground outline-none focus:border-foreground/30 cursor-pointer"
        >
          <option value="citacoes">Mais citados</option>
          <option value="recente">Citados recentemente</option>
          <option value="az">A-Z</option>
        </select>
      </div>

      {/* Grade */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted">Nenhum livro encontrado.</p>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="mt-3 text-sm text-foreground underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((livro) => (
            <Link
              key={livro.id}
              href={`/livro/${livro.id}`}
              className="group flex gap-4 p-4 bg-card border border-border rounded-2xl hover:border-foreground/20 hover:bg-card-hover transition-all"
            >
              <BookCover
                titulo={livro.titulo}
                autor={livro.autor}
                capaUrl={livro.capa_url}
                className="w-24 shrink-0 shadow-sm"
              />

              <div className="min-w-0 flex flex-col">
                <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:underline transition-colors line-clamp-2">
                  {livro.titulo}
                </h3>
                <p className="text-xs text-muted mt-0.5 line-clamp-1">
                  {livro.autor ?? (
                    <span className="italic text-muted/60">autor não citado</span>
                  )}
                </p>

                {livro.contexto && (
                  <p className="text-xs text-muted/90 leading-relaxed mt-2 line-clamp-3">
                    {livro.contexto}
                  </p>
                )}

                <div className="mt-auto pt-2 text-[11px] font-mono text-muted">
                  {livro.episodios_count} citaç
                  {livro.episodios_count === 1 ? "ão" : "ões"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
