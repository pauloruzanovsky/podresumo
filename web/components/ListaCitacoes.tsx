"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { hrefEpisodio } from "@/lib/links";

/**
 * Lista enxuta das citações de um livro: uma linha por episódio, com quem
 * citou e o minuto, e a fala recolhida. Usada quando o livro tem citações
 * demais pra caber em cards. O filtro por pessoa responde "o que fulano disse
 * sobre este livro?".
 */
export interface CitacaoLinha {
  episode_id: string;
  episode_slug: string | null;
  ep_number: string | null;
  titulo: string;
  data: string;
  link_youtube: string;
  timestamp_seg: number | null;
  citacao_literal: string | null;
  contexto: string | null;
  quem_citou: string | null;
}

const COLUNAS = "md:grid-cols-[minmax(0,1fr)_10rem_4.5rem]";

function formatTimestamp(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece ao lado. */
function tituloLimpo(titulo: string, epNumber: string | null) {
  return epNumber ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

export default function ListaCitacoes({ citacoes }: { citacoes: CitacaoLinha[] }) {
  const [pessoa, setPessoa] = useState<string | null>(null);

  // Quem citou e quantas vezes, do que mais citou pro que menos.
  const pessoas = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of citacoes) if (c.quem_citou) n.set(c.quem_citou, (n.get(c.quem_citou) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [citacoes]);

  const visiveis = pessoa ? citacoes.filter((c) => c.quem_citou === pessoa) : citacoes;

  return (
    <section className="mt-8">
      <h3 className="font-serif text-lg font-semibold mb-3">
        Todas as {citacoes.length} citações
      </h3>

      {/* Só vale filtrar quando mais de uma pessoa citou o livro. */}
      {pessoas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-muted mr-1">Citado por</span>
          {[["Todos", citacoes.length] as const, ...pessoas].map(([nome, n]) => {
            const ativo = nome === "Todos" ? pessoa === null : pessoa === nome;
            return (
              <button
                key={nome}
                type="button"
                onClick={() => setPessoa(nome === "Todos" || ativo ? null : nome)}
                aria-pressed={ativo}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  ativo
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted border-border hover:text-foreground hover:border-foreground/20"
                }`}
              >
                {nome}
                <span className={ativo ? "ml-1.5 opacity-60" : "ml-1.5 text-muted/60"}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl px-4 sm:px-5">
        <div
          aria-hidden="true"
          className={`hidden md:grid ${COLUNAS} gap-x-4 py-2.5 border-b border-border text-[11px] uppercase tracking-widest text-muted`}
        >
          <span>Episódio</span>
          <span>Quem citou</span>
          <span className="text-right">Ouvir</span>
        </div>
        <ol className="divide-y divide-border">
          {visiveis.map((c) => (
            <Linha key={c.episode_id} c={c} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Linha({ c }: { c: CitacaoLinha }) {
  const minuto =
    c.timestamp_seg != null ? `${c.link_youtube}&t=${c.timestamp_seg}s` : null;
  const fala = c.citacao_literal ?? c.contexto;

  return (
    <li className="py-3">
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] ${COLUNAS} gap-x-4 gap-y-1 items-center`}>
        <Link href={hrefEpisodio({ id: c.episode_id, slug: c.episode_slug })} className="min-w-0 text-sm leading-snug hover:underline">
          {c.ep_number && <span className="font-mono text-xs text-muted mr-2">#{c.ep_number}</span>}
          {tituloLimpo(c.titulo, c.ep_number)}
        </Link>
        <span className="hidden md:block text-sm text-muted truncate">{c.quem_citou ?? "—"}</span>
        <span className="text-right">
          {minuto ? (
            <a
              href={minuto}
              data-trecho={`${c.quem_citou ? `${c.quem_citou} · ` : ""}${tituloLimpo(c.titulo, c.ep_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-accent-light hover:text-accent"
              aria-label={`Ouvir o trecho em ${formatTimestamp(c.timestamp_seg!)}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              {formatTimestamp(c.timestamp_seg!)}
            </a>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
      </div>

      {/* no celular quem citou vai embaixo do título */}
      {c.quem_citou && <p className="md:hidden mt-1 text-xs text-muted">{c.quem_citou}</p>}

      {fala && (
        <details className="group mt-1.5">
          <summary className="text-xs text-muted cursor-pointer select-none hover:text-foreground list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">ver o que foi dito ↓</span>
            <span className="hidden group-open:inline">recolher ↑</span>
          </summary>
          <blockquote className="font-serif text-base leading-snug mt-2 pl-3 border-l-2 border-border">
            {c.citacao_literal ? `“${c.citacao_literal}”` : c.contexto}
          </blockquote>
          {c.citacao_literal && c.contexto && (
            <p className="text-xs text-muted leading-relaxed mt-2 pl-3">{c.contexto}</p>
          )}
        </details>
      )}
    </li>
  );
}
