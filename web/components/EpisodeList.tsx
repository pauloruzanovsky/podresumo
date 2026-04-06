"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import EpisodeCard from "./EpisodeCard";

interface Episode {
  id: string;
  ep_number?: string;
  titulo: string;
  data: string;
  duracao: string;
  thumbnail: string;
  resumo: string;
  main_insight: string;
  main_action: string;
  tags: string[];
  convidados: string[];
  podcast: string;
  livros: { id: string; titulo: string; autor: string }[];
}

export default function EpisodeList({ episodes }: { episodes: Episode[] }) {
  const [search, setSearch] = useState("");
  const [activePodcast, setActivePodcast] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Unique podcasts with episode count
  const podcastCounts = episodes.reduce((acc, ep) => {
    const name = ep.podcast || "Sem podcast";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const podcasts = Object.entries(podcastCounts).sort((a, b) => b[1] - a[1]);

  // Top 15 tags by frequency
  const tagCounts = episodes
    .flatMap((ep) => ep.tags ?? [])
    .reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  // Filter
  const filtered = episodes.filter((ep) => {
    const q = search.toLowerCase();
    const matchSearch =
      search === "" ||
      ep.titulo.toLowerCase().includes(q) ||
      ep.resumo.toLowerCase().includes(q) ||
      (ep.convidados ?? []).some((c) => c.toLowerCase().includes(q));

    const matchPodcast = !activePodcast || ep.podcast === activePodcast;
    const matchTag = !activeTag || (ep.tags ?? []).includes(activeTag);

    return matchSearch && matchPodcast && matchTag;
  });

  return (
    <div>
      {/* Search + View Toggle */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
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
            placeholder="Buscar por título, convidado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent/40 transition-all"
          />
        </div>

        {/* View toggle */}
        <div className="flex bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setView("cards")}
            className={`px-3 py-3 transition-colors ${
              view === "cards"
                ? "bg-accent/15 text-accent-light"
                : "text-muted hover:text-foreground"
            }`}
            title="Cards"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-3 transition-colors ${
              view === "table"
                ? "bg-accent/15 text-accent-light"
                : "text-muted hover:text-foreground"
            }`}
            title="Tabela"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Podcast filter */}
      {podcasts.length > 1 && (
        <div className="flex gap-2 mb-4">
          {podcasts.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setActivePodcast(activePodcast === name ? null : name)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activePodcast === name
                  ? "bg-accent text-white shadow-[0_0_12px_rgba(64,138,113,0.3)]"
                  : "bg-card border border-border text-muted hover:text-foreground hover:border-accent/30"
              }`}
            >
              {name}
              <span className="ml-1.5 text-[10px] opacity-50">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tags - horizontal scroll */}
      <div className="relative mb-8">
        <div
          ref={scrollRef}
          className="tags-scroll flex gap-2 overflow-x-auto pb-2"
        >
          {topTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTag === tag
                  ? "bg-accent text-white shadow-[0_0_12px_rgba(64,138,113,0.3)]"
                  : "bg-card border border-border text-muted hover:text-foreground hover:border-accent/30"
              }`}
            >
              {tag}
              <span className="ml-1.5 text-[10px] opacity-50">{tagCounts[tag]}</span>
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:text-foreground transition-colors"
            >
              Limpar filtro
            </button>
          )}
        </div>
        {/* Fade edge */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Count */}
      <div className="mb-5">
        <span className="text-xs text-muted">
          {filtered.length} episódio{filtered.length !== 1 ? "s" : ""}
          {activePodcast && (
            <span className="text-accent-light ml-1">· {activePodcast}</span>
          )}
          {activeTag && (
            <span className="text-accent-light ml-1">· {activeTag}</span>
          )}
        </span>
      </div>

      {/* Cards View */}
      {view === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((ep) => (
            <EpisodeCard key={ep.id} episode={ep} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-20 text-muted">
              Nenhum episódio encontrado.
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {view === "table" && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card text-left text-[11px] font-semibold text-muted uppercase tracking-widest">
                <th className="px-4 py-3">Podcast</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Convidados</th>
                <th className="px-4 py-3">Livros</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ep) => (
                <tr
                  key={ep.id}
                  className="border-t border-border hover:bg-accent/[0.04] transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-muted">
                    {ep.podcast || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/episodio/${ep.id}`}
                      className="font-medium text-foreground hover:text-accent-light transition-colors"
                    >
                      {ep.titulo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {(ep.convidados ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {ep.livros.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {ep.livros.map((livro) => (
                          <Link
                            key={livro.id}
                            href={`/livro/${livro.id}`}
                            className="text-xs text-muted hover:text-accent-light transition-colors"
                          >
                            {livro.titulo}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-20 text-muted">
                    Nenhum episódio encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
