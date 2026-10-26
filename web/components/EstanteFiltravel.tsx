"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BookCover from "./BookCover";
import { hrefLivro } from "@/lib/links";

/**
 * A estante inteira do podcast, filtrável: busca, quem citou, tema e ordem em
 * cima; os livros de pé em prateleiras de madeira embaixo.
 *
 * Substituiu as prateleiras fixas (mais citados / recém-chegados) e a lista
 * em cards: um bloco só, com o filtro no topo da página, responde tanto "o
 * que mais se cita aqui?" (ordem padrão) quanto "o que esse convidado citou?".
 */
export interface LivroEstante {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capa_url: string | null;
  episodios_count: number;
  ultima_data: string | null;
  temas: string[];
  /** Quem citou (host ou convidado), quando a extração sabe. */
  pessoas: string[];
  /** Escrito por quem apresenta: vai sempre na frente, com faixa própria. */
  daCasa: boolean;
}

type Ordem = "citacoes" | "recente" | "az";

const POR_PAGINA = 36;
const MAX_TEMAS = 8;

export default function EstanteFiltravel({
  livros,
  totalCitacoes,
  initialQuery = "",
  initialPessoa = "",
}: {
  livros: LivroEstante[];
  totalCitacoes: number;
  initialQuery?: string;
  initialPessoa?: string;
}) {
  const [busca, setBusca] = useState(initialQuery);
  const [pessoa, setPessoa] = useState(initialPessoa);
  const [tema, setTema] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("citacoes");
  const [limite, setLimite] = useState(POR_PAGINA);

  // Todo mundo que citou ao menos um livro, de quem citou mais pra menos.
  const pessoas = useMemo(() => {
    const n = new Map<string, number>();
    for (const l of livros) for (const p of l.pessoas) n.set(p, (n.get(p) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [livros]);

  const temas = useMemo(() => {
    const n = new Map<string, number>();
    for (const l of livros) for (const t of l.temas) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TEMAS);
  }, [livros]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const r = livros.filter(
      (l) =>
        (!q ||
          l.titulo.toLowerCase().includes(q) ||
          (l.autor?.toLowerCase().includes(q) ?? false)) &&
        (!pessoa || l.pessoas.includes(pessoa)) &&
        (!tema || l.temas.includes(tema))
    );
    r.sort((a, b) => {
      // o livro da casa abre a estante em qualquer ordem
      if (a.daCasa !== b.daCasa) return a.daCasa ? -1 : 1;
      if (ordem === "az") return a.titulo.localeCompare(b.titulo);
      if (ordem === "recente")
        return (b.ultima_data ?? "").localeCompare(a.ultima_data ?? "") ||
          b.episodios_count - a.episodios_count;
      return b.episodios_count - a.episodios_count || a.titulo.localeCompare(b.titulo);
    });
    return r;
  }, [livros, busca, pessoa, tema, ordem]);

  const filtrando = Boolean(busca || pessoa || tema);
  const visiveis = filtrados.slice(0, limite);

  function limpar() {
    setBusca("");
    setPessoa("");
    setTema("");
    setLimite(POR_PAGINA);
  }

  // qualquer mudança de filtro volta pra primeira "página"
  function aoFiltrar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setLimite(POR_PAGINA);
    };
  }

  const controle =
    "px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground outline-none focus:border-foreground/30";

  return (
    <section id="todos-os-livros" className="scroll-mt-20 mb-14 sm:mb-16">
      <header className="mb-4">
        <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight">
          A estante
        </h2>
        <p className="text-sm text-muted mt-1">
          {livros.length} livros e {totalCitacoes} citações. Filtre por quem citou
          pra ver o que cada convidado leva pra conversa.
        </p>
      </header>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => aoFiltrar(setBusca)(e.target.value)}
            placeholder="Buscar título ou autor"
            aria-label="Buscar título ou autor"
            className={`${controle} w-full pl-10 placeholder:text-muted/50`}
          />
        </div>
        <select
          value={pessoa}
          onChange={(e) => aoFiltrar(setPessoa)(e.target.value)}
          aria-label="Citados por"
          className={`${controle} sm:max-w-[15rem] cursor-pointer`}
        >
          <option value="">Citados por qualquer pessoa</option>
          {pessoas.map(([nome, n]) => (
            <option key={nome} value={nome}>
              {nome} ({n})
            </option>
          ))}
        </select>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          aria-label="Ordem"
          className={`${controle} sm:w-auto cursor-pointer`}
        >
          <option value="citacoes">Mais citados</option>
          <option value="recente">Citados recentemente</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      {/* Temas: uma faixa que desliza no celular */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 mb-4 overflow-x-auto sm:overflow-visible tags-scroll -mx-1 px-1">
        {temas.map(([t, n]) => {
          const ativo = tema === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => aoFiltrar(setTema)(ativo ? "" : t)}
              aria-pressed={ativo}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                ativo
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted border-border hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {t}
              <span className={ativo ? "ml-1.5 opacity-60" : "ml-1.5 text-muted/60"}>{n}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted mb-3" aria-live="polite">
        {filtrados.length} {filtrados.length === 1 ? "livro" : "livros"}
        {pessoa && (
          <>
            {" "}citados por <span className="font-semibold text-foreground">{pessoa}</span>
          </>
        )}
        {filtrando && (
          <button type="button" onClick={limpar} className="ml-3 text-foreground underline underline-offset-2">
            limpar filtros
          </button>
        )}
      </p>

      {/* O móvel */}
      <div className="rounded-2xl border border-shelf/60 bg-movel shadow-[inset_0_2px_10px_rgba(43,37,33,0.10)] px-3 sm:px-6 pt-7 pb-4">
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted text-center py-16">Nenhum livro com esse filtro.</p>
        ) : (
          // Cada livro carrega o seu pedaço de tábua: sem espaço entre as
          // colunas, os pedaços se emendam numa prateleira por linha.
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-y-7">
            {visiveis.map((l) => (
              <li key={l.id} className="min-w-0">
                <Link href={hrefLivro(l)} className="group block">
                  <div className="relative px-2 sm:px-3">
                    <BookCover
                      titulo={l.titulo}
                      autor={l.autor}
                      capaUrl={l.capa_url}
                      className={`w-full rounded-b-none transition-transform duration-200 ease-out group-hover:-translate-y-2 group-focus-visible:-translate-y-2 ${
                        l.daCasa
                          ? "ring-2 ring-[#c9a227] shadow-[0_6px_16px_-4px_rgba(201,162,39,0.55)]"
                          : "shadow-[4px_0_10px_-4px_rgba(43,37,33,0.45)]"
                      }`}
                    />
                    {/* faixa do livro de quem apresenta, como etiqueta de livraria */}
                    {l.daCasa && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-[#c9a227] text-[#2b2521] text-[10px] font-semibold uppercase tracking-wider shadow-sm">
                        da casa
                      </span>
                    )}
                  </div>
                  <div className="h-3 bg-gradient-to-b from-[#d9c6a4] via-shelf to-[#a98f68] shadow-[0_7px_9px_-5px_rgba(43,37,33,0.55)]" />
                  <p className="px-2 sm:px-3 pt-2.5 text-xs font-semibold leading-snug line-clamp-2 group-hover:underline">
                    {l.titulo}
                  </p>
                  <p className="px-2 sm:px-3 text-[11px] text-muted leading-snug mt-0.5 line-clamp-2">
                    {l.daCasa
                      ? `O livro do ${l.autor} · ${l.episodios_count} citações`
                      : `${l.autor ? `${l.autor} · ` : ""}${l.episodios_count} ${
                          l.episodios_count === 1 ? "citação" : "citações"
                        }`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {filtrados.length > limite && (
          <div className="text-center mt-8 mb-2">
            <button
              type="button"
              onClick={() => setLimite((n) => n + POR_PAGINA)}
              className="px-5 py-2.5 bg-card border border-border rounded-full text-sm font-medium hover:bg-card-hover transition-colors"
            >
              Mostrar mais livros ({filtrados.length - limite} restantes)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
