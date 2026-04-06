"use client";

import { useState } from "react";
import Link from "next/link";
import PodcastFilter from "./PodcastFilter";

interface Livro {
  id: string;
  titulo: string;
  autor: string;
  episodios_count: number;
  podcasts: string[];
}

export default function BibliotecaList({ livros }: { livros: Livro[] }) {
  const [activePodcast, setActivePodcast] = useState<string | null>(null);

  // Count books per podcast
  const podcastCounts = livros.reduce((acc, livro) => {
    for (const name of livro.podcasts) {
      acc[name] = (acc[name] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const podcasts = Object.entries(podcastCounts).sort((a, b) => b[1] - a[1]);

  const filtered = activePodcast
    ? livros.filter((livro) => livro.podcasts.includes(activePodcast))
    : livros;

  return (
    <div>
      <PodcastFilter
        podcasts={podcasts}
        activePodcast={activePodcast}
        onToggle={(name) => setActivePodcast(activePodcast === name ? null : name)}
      />

      {/* Count */}
      <div className="mb-5">
        <span className="text-xs text-muted">
          {filtered.length} livro{filtered.length !== 1 ? "s" : ""}
          {activePodcast && (
            <span className="text-accent-light ml-1">· {activePodcast}</span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-[11px] font-semibold text-muted uppercase tracking-widest">
              <th className="px-5 py-3">Título</th>
              <th className="px-5 py-3">Autor</th>
              <th className="px-5 py-3 text-center">Citações</th>
              <th className="px-5 py-3 text-right">Comprar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((livro) => (
              <tr
                key={livro.id}
                className="border-t border-border hover:bg-accent/[0.04] transition-colors"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/livro/${livro.id}`}
                    className="font-medium text-foreground hover:text-accent-light transition-colors"
                  >
                    {livro.titulo}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted">{livro.autor}</td>
                <td className="px-5 py-3 text-center">
                  <span className="font-mono text-xs text-accent-light">
                    {livro.episodios_count}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <a
                    href={`https://www.amazon.com.br/s?k=${encodeURIComponent(livro.titulo)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-accent/60 hover:text-accent-light font-semibold transition-colors"
                  >
                    AMAZON
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-20 text-muted">
                  Nenhum livro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
