"use client";

import { useState } from "react";
import Link from "next/link";
import PodcastFilter from "./PodcastFilter";

interface Lesson {
  id: string;
  titulo: string;
  main_insight: string | null;
  main_action: string | null;
  data: string;
  podcast_nome: string;
}

export default function LessonsList({ lessons }: { lessons: Lesson[] }) {
  const [activePodcast, setActivePodcast] = useState<string | null>(null);

  const podcastCounts = lessons.reduce((acc, ep) => {
    const name = ep.podcast_nome || "Sem podcast";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const podcasts = Object.entries(podcastCounts).sort((a, b) => b[1] - a[1]);

  const filtered = activePodcast
    ? lessons.filter((ep) => ep.podcast_nome === activePodcast)
    : lessons;

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
          {filtered.length} lesson{filtered.length !== 1 ? "s" : ""}
          {activePodcast && (
            <span className="text-accent-light ml-1">· {activePodcast}</span>
          )}
        </span>
      </div>

      {/* Feed */}
      <div className="flex flex-col gap-5">
        {filtered.map((ep) => (
          <div
            key={ep.id}
            className="bg-card border border-border rounded-2xl p-6 hover:border-accent/20 transition-all"
          >
            {/* Episode info */}
            <div className="flex items-center gap-2 text-[11px] text-muted/60 font-mono mb-3">
              {ep.podcast_nome && (
                <>
                  <span className="text-accent-light/70">{ep.podcast_nome}</span>
                  <span>·</span>
                </>
              )}
              <span>
                {new Date(ep.data + "T12:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>

            <Link
              href={`/episodio/${ep.id}`}
              className="text-[15px] font-semibold text-foreground hover:text-accent-light transition-colors"
            >
              {ep.titulo}
            </Link>

            {/* Insight + Action */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {ep.main_insight && (
                <div className="bg-accent/[0.08] border border-accent/20 rounded-xl p-4">
                  <h3 className="text-[10px] font-semibold text-accent-light uppercase tracking-widest mb-2">
                    Insight
                  </h3>
                  <p className="text-sm text-foreground leading-relaxed">
                    {ep.main_insight}
                  </p>
                </div>
              )}

              {ep.main_action && (
                <div className="bg-accent/[0.04] border border-border rounded-xl p-4">
                  <h3 className="text-[10px] font-semibold text-accent-light uppercase tracking-widest mb-2">
                    Ação recomendada
                  </h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {ep.main_action}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-20 text-muted">
            Nenhuma lesson encontrada.
          </div>
        )}
      </div>
    </div>
  );
}
