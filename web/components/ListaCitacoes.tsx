"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Compartilhar from "./Compartilhar";
import { hrefEpisodio, hrefFala, hrefPessoa } from "@/lib/links";
import { formatTimestamp } from "@/lib/tempo";
import { slugify } from "@/lib/slug";

/**
 * Lista enxuta das citações de um livro: uma linha por episódio, com quem
 * citou e o minuto, e a fala recolhida. Usada quando o livro tem citações
 * demais pra caber em cards. O filtro por pessoa responde "o que fulano disse
 * sobre este livro?", e o de podcast, "o que cada programa disse?".
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
  podcast: string | null;
}

const COLUNAS = "md:grid-cols-[minmax(0,1fr)_9rem_9rem_4.5rem]";


/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece ao lado. */
function tituloLimpo(titulo: string, epNumber: string | null) {
  return epNumber ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

interface LivroDaLista {
  id: string;
  slug: string | null;
  titulo: string;
}

export default function ListaCitacoes({
  citacoes,
  livro,
}: {
  citacoes: CitacaoLinha[];
  livro: LivroDaLista;
}) {
  const [podcast, setPodcast] = useState<string | null>(null);
  const [pessoa, setPessoa] = useState<string | null>(null);

  // Cada filtro conta dentro do outro: com um podcast escolhido, a lista de
  // quem citou só traz quem falou do livro ali, e vice-versa.
  const podcasts = useMemo(
    () => contagem(citacoes.filter((c) => !pessoa || c.quem_citou === pessoa), (c) => c.podcast),
    [citacoes, pessoa]
  );
  const pessoas = useMemo(
    () => contagem(citacoes.filter((c) => !podcast || c.podcast === podcast), (c) => c.quem_citou),
    [citacoes, podcast]
  );
  const totalPodcasts = useMemo(() => new Set(citacoes.map((c) => c.podcast).filter(Boolean)).size, [citacoes]);
  const totalPessoas = useMemo(() => new Set(citacoes.map((c) => c.quem_citou).filter(Boolean)).size, [citacoes]);

  const visiveis = citacoes.filter(
    (c) => (!podcast || c.podcast === podcast) && (!pessoa || c.quem_citou === pessoa)
  );
  const filtrando = podcast !== null || pessoa !== null;

  return (
    <section className="mt-8">
      <h3 className="font-serif text-lg font-semibold mb-3">
        Todas as {citacoes.length} citações
      </h3>

      {/* Só vale filtrar quando há mais de um podcast ou mais de uma pessoa.
          Select nativo: com dezenas de nomes, os botões viravam uma parede
          antes da lista, e no celular o sistema abre a roleta própria. */}
      {(totalPodcasts > 1 || totalPessoas > 1) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {totalPodcasts > 1 && (
            <Filtro
              rotulo="Podcast"
              todos="Todos os podcasts"
              valor={podcast}
              opcoes={podcasts}
              aoMudar={(v) => {
                setPodcast(v);
                // quem citou só noutro podcast sairia com a lista vazia
                if (v && pessoa && !citacoes.some((c) => c.podcast === v && c.quem_citou === pessoa)) {
                  setPessoa(null);
                }
              }}
            />
          )}
          {totalPessoas > 1 && (
            <Filtro
              rotulo="Quem citou"
              todos="Todos que citaram"
              valor={pessoa}
              opcoes={pessoas}
              aoMudar={setPessoa}
            />
          )}
          {filtrando && (
            <span className="text-xs text-muted">
              {visiveis.length} de {citacoes.length}
              <button
                type="button"
                onClick={() => {
                  setPodcast(null);
                  setPessoa(null);
                }}
                className="ml-2 underline hover:text-foreground"
              >
                limpar
              </button>
            </span>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl px-4 sm:px-5">
        <div
          aria-hidden="true"
          className={`hidden md:grid ${COLUNAS} gap-x-4 py-2.5 border-b border-border text-[11px] uppercase tracking-widest text-muted`}
        >
          <span>Episódio</span>
          <span>Podcast</span>
          <span>Quem citou</span>
          <span className="text-right">Ouvir</span>
        </div>
        <ol className="divide-y divide-border">
          {visiveis.map((c) => (
            <Linha key={c.episode_id} c={c} livro={livro} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** [nome, quantas citações], de quem mais aparece pro que menos. */
function contagem(citacoes: CitacaoLinha[], chave: (c: CitacaoLinha) => string | null) {
  const n = new Map<string, number>();
  for (const c of citacoes) {
    const k = chave(c);
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function Filtro({
  rotulo,
  todos,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string;
  todos: string;
  valor: string | null;
  opcoes: [string, number][];
  aoMudar: (v: string | null) => void;
}) {
  const ativo = valor !== null;
  return (
    <label className={`relative inline-flex min-w-0 max-w-full ${ativo ? "text-background" : "text-muted"}`}>
      <span className="sr-only">{rotulo}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => aoMudar(e.target.value || null)}
        className={`appearance-none max-w-full truncate pl-3.5 pr-8 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors outline-none ${
          ativo
            ? "bg-foreground text-background border-foreground"
            : "bg-card text-muted border-border hover:text-foreground hover:border-foreground/20"
        }`}
      >
        <option value="">{todos}</option>
        {opcoes.map(([nome, n]) => (
          <option key={nome} value={nome}>
            {nome} ({n})
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}

function Linha({ c, livro }: { c: CitacaoLinha; livro: LivroDaLista }) {
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
        {c.podcast ? (
          <Link href={`/podcast/${slugify(c.podcast)}`} className="hidden md:block text-sm text-muted truncate hover:text-foreground hover:underline">
            {c.podcast}
          </Link>
        ) : (
          <span className="hidden md:block text-sm text-muted">—</span>
        )}
        {c.quem_citou ? (
          <Link href={hrefPessoa(c.quem_citou)} className="hidden md:block text-sm text-muted truncate hover:text-foreground hover:underline">
            {c.quem_citou}
          </Link>
        ) : (
          <span className="hidden md:block text-sm text-muted">—</span>
        )}
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

      {/* no celular podcast e quem citou vão embaixo do título */}
      {(c.podcast || c.quem_citou) && (
        <p className="md:hidden mt-1 text-xs text-muted">
          {c.podcast}
          {c.podcast && c.quem_citou && " · "}
          {c.quem_citou && (
            <Link href={hrefPessoa(c.quem_citou)} className="hover:underline">
              {c.quem_citou}
            </Link>
          )}
        </p>
      )}

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
          {c.citacao_literal && (
            <div className="mt-2 pl-3">
              <Compartilhar
                caminho={hrefFala({ id: c.episode_id, slug: c.episode_slug }, livro)}
                titulo={`${c.quem_citou ? `${c.quem_citou} sobre` : "Sobre"} ${livro.titulo}`}
                rotulo="Compartilhar esta fala"
                texto="Compartilhar"
              />
            </div>
          )}
        </details>
      )}
    </li>
  );
}
