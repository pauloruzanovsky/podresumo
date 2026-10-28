"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BookCover from "./BookCover";
import { hrefEpisodio, hrefLivro } from "@/lib/links";
import { filtrando as temFiltro, livroBate, useFiltro, type Filtro } from "@/lib/filtroEstante";
import type { LivroEstante } from "./EstanteFiltravel";

/**
 * O podcast semana a semana, como um calendário: uma linha por ano, uma
 * célula por semana, mais forte quanto mais livros citados. Cabe inteiro na
 * tela, no computador e no celular. Clicar numa semana abre embaixo os dias
 * dela: cada episódio com convidados e as capas dos livros.
 *
 * Fica fora da estante, mas obedece ao filtro dela (lib/filtroEstante): as
 * semanas que batem ficam coloridas, o resto apaga, e a semana aberta pula
 * pra mais recente que bateu.
 */
export interface EpisodioLinha {
  id: string;
  slug: string | null;
  numero: string | null;
  titulo: string;
  data: string;
  convidados: string[];
  citacoes: { livroId: string; quem: string | null }[];
}

interface Semana {
  chave: string;
  ano: number;
  indice: number; // 0–52 na linha do ano
  inicio: Date; // segunda-feira
  eps: EpisodioLinha[];
  livros: number;
}

const DIA = 86_400_000;
// semanas começando na segunda: um ano toca até 54 delas (as das pontas, parciais)
const COLUNAS = 54;
const METADE = COLUNAS / 2;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const utc = (data: string) => new Date(`${data.slice(0, 10)}T12:00:00Z`);

/** Posição da semana na linha do ano: semanas começando na segunda. */
function semanaDoAno(d: Date) {
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1, 12);
  const desloc = (new Date(jan1).getUTCDay() + 6) % 7; // seg = 0
  const dia = Math.round((d.getTime() - jan1) / DIA);
  return Math.floor((dia + desloc) / 7);
}

function segundaDe(d: Date) {
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA);
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("pt-BR", { ...o, timeZone: "UTC" });

/**
 * Episódio aceso: alguma citação dele bate com o filtro (e foi feita pela
 * pessoa escolhida). Só com o filtro de pessoa, vale também o episódio em que
 * ela foi convidada e não citou livro.
 */
function episodioBate(e: EpisodioLinha, f: Filtro, livros: Map<string, LivroEstante>) {
  return (
    e.citacoes.some((c) => {
      const l = livros.get(c.livroId);
      return l && livroBate(l, f) && (!f.pessoa || c.quem === f.pessoa);
    }) || Boolean(f.pessoa && !f.busca.trim() && !f.tema && e.convidados.includes(f.pessoa))
  );
}

/** Intensidade da célula pelos livros citados na semana. */
function tom(livros: number) {
  if (livros === 0) return "border border-chart/70";
  if (livros <= 2) return "bg-chart/35";
  if (livros <= 5) return "bg-chart/65";
  return "bg-chart";
}

export default function CalendarioEpisodios({
  episodios,
  livros,
}: {
  episodios: EpisodioLinha[];
  livros: LivroEstante[];
}) {
  const { filtro } = useFiltro();
  const livrosPorId = useMemo(() => new Map(livros.map((l) => [l.id, l])), [livros]);
  const filtrando = temFiltro(filtro);

  const { anos, semanas } = useMemo(() => {
    const semanas = new Map<string, Semana>();
    for (const e of episodios) {
      // A semana é a da segunda-feira: a que atravessa o réveillon fica
      // inteira na linha do ano em que começou, em vez de virar duas metades.
      const inicio = segundaDe(utc(e.data));
      const ano = inicio.getUTCFullYear();
      const indice = semanaDoAno(inicio);
      const chave = `${ano}-${indice}`;
      const s =
        semanas.get(chave) ??
        semanas.set(chave, { chave, ano, indice, inicio, eps: [], livros: 0 }).get(chave)!;
      s.eps.push(e);
      s.livros += new Set(e.citacoes.map((c) => c.livroId)).size;
    }
    for (const s of semanas.values()) s.eps.sort((a, b) => a.data.localeCompare(b.data));
    const lista = [...semanas.values()];
    const primeiro = Math.min(...lista.map((s) => s.ano));
    const ultimo = Math.max(...lista.map((s) => s.ano));
    const anos = Array.from({ length: ultimo - primeiro + 1 }, (_, i) => primeiro + i);
    return { anos, semanas };
  }, [episodios]);

  // semanas com algum episódio que bate com o filtro
  const acesas = useMemo(() => {
    if (!filtrando) return null;
    const r = new Set<string>();
    for (const s of semanas.values())
      if (s.eps.some((e) => episodioBate(e, filtro, livrosPorId))) r.add(s.chave);
    return r;
  }, [semanas, filtro, filtrando, livrosPorId]);

  const recentes = useMemo(
    () => [...semanas.values()].sort((a, b) => b.inicio.getTime() - a.inicio.getTime()),
    [semanas]
  );

  // A semana aberta: a mais recente, ou a mais recente que bate com o filtro.
  const [aberta, setAberta] = useState<string | null>(null);
  useEffect(() => {
    const alvo = acesas ? recentes.find((s) => acesas.has(s.chave)) : recentes[0];
    setAberta(alvo?.chave ?? null);
  }, [acesas, recentes]);

  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);

  if (semanas.size === 0) return null;

  const semana = aberta ? semanas.get(aberta) : undefined;
  const ultimaSemana = recentes[0];

  function celula(ano: number, i: number) {
    const s = semanas.get(`${ano}-${i}`);
    if (!s) {
      // semana que ainda não chegou fica sem quadrado
      const futura = ano > ultimaSemana.ano || (ano === ultimaSemana.ano && i > ultimaSemana.indice);
      return <span key={i} className={`aspect-square rounded-[2px] sm:rounded-[3px] ${futura ? "" : "bg-border/40"}`} />;
    }
    const acesa = !acesas || acesas.has(s.chave);
    const selecionada = aberta === s.chave;
    const rotulo = `Semana de ${fmt(s.inicio, { day: "numeric", month: "short", year: "numeric" })}: ${s.eps.length} ${
      s.eps.length === 1 ? "episódio" : "episódios"
    }, ${s.livros} ${s.livros === 1 ? "livro" : "livros"}`;
    return (
      <button
        key={i}
        type="button"
        onClick={() => setAberta(s.chave)}
        onMouseEnter={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          setDica({ texto: rotulo, x: r.left + r.width / 2, y: r.top });
        }}
        onMouseLeave={() => setDica(null)}
        aria-label={rotulo}
        aria-pressed={selecionada}
        className={`aspect-square rounded-[2px] sm:rounded-[3px] transition-[opacity,transform] hover:scale-125 focus-visible:outline-none focus-visible:scale-125 ${
          acesa ? tom(s.livros) : "bg-border/70"
        } ${selecionada ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
      />
    );
  }
  const totalAcesos = acesas
    ? episodios.filter((e) => episodioBate(e, filtro, livrosPorId)).length
    : null;

  return (
    <section className="mb-12 sm:mb-14" aria-label="Calendário dos episódios">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-4">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight">Semana a semana</h2>
          <p className="text-xs sm:text-sm text-muted mt-1" aria-live="polite">
            {totalAcesos !== null
              ? `${totalAcesos} de ${episodios.length} episódios com esse filtro.`
              : "Cada quadrado é uma semana. Clique pra ver os episódios e os livros dela."}
          </p>
        </div>
        {/* legenda da intensidade */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted" aria-hidden="true">
          menos livros
          {[0, 1, 4, 8].map((n) => (
            <span key={n} className={`w-2.5 h-2.5 rounded-[3px] ${tom(n)}`} />
          ))}
          mais
        </div>
      </div>

      {/* Computador: uma linha por ano, as 54 semanas lado a lado. */}
      <div
        className="hidden sm:grid items-center gap-[3px]"
        style={{ gridTemplateColumns: `auto repeat(${COLUNAS}, minmax(0, 1fr))` }}
      >
        <span />
        {Array.from({ length: COLUNAS }, (_, i) => {
          const mes = MESES.findIndex((_, m) => Math.round((m * 52) / 12) === i);
          return (
            <span key={i} className="h-3 text-[10px] text-muted leading-none whitespace-nowrap">
              {mes >= 0 ? MESES[mes] : ""}
            </span>
          );
        })}
        {anos.map((ano) => (
          <Fragment key={ano}>
            <span className="pr-3 text-xs text-muted tabular-nums">{ano}</span>
            {Array.from({ length: COLUNAS }, (_, i) => celula(ano, i))}
          </Fragment>
        ))}
      </div>

      {/* Celular: cada ano em duas linhas, um semestre em cada. Com as 54
          semanas numa linha só o quadrado ficava com 4px, sem como tocar. */}
      <div
        className="grid sm:hidden items-center gap-[2px]"
        style={{ gridTemplateColumns: `auto repeat(${METADE}, minmax(0, 1fr))` }}
      >
        <span />
        {Array.from({ length: METADE }, (_, i) => (
          <span key={i} className="h-3 text-[9px] text-muted leading-none whitespace-nowrap">
            {i === 0 ? "jan · jul" : i === 13 ? "abr · out" : ""}
          </span>
        ))}
        {anos.map((ano) =>
          [0, 1].map((metade) => (
            <Fragment key={`${ano}-${metade}`}>
              <span className={`pr-2 text-[10px] text-muted tabular-nums ${metade ? "opacity-0" : ""}`}>{ano}</span>
              {Array.from({ length: METADE }, (_, j) => celula(ano, metade * METADE + j))}
            </Fragment>
          ))
        )}
      </div>

      {dica && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-foreground text-background px-2 py-1 text-[11px] whitespace-nowrap shadow-lg"
          style={{ left: dica.x, top: dica.y - 6 }}
        >
          {dica.texto}
        </div>
      )}

      {semana && (
        <DiasDaSemana
          semana={semana}
          livros={livrosPorId}
          filtro={filtrando ? filtro : null}
          onFechar={() => setAberta(null)}
        />
      )}
    </section>
  );
}

function DiasDaSemana({
  semana,
  livros,
  filtro,
  onFechar,
}: {
  semana: Semana;
  livros: Map<string, LivroEstante>;
  filtro: Filtro | null;
  onFechar: () => void;
}) {
  const fim = new Date(semana.inicio.getTime() + 6 * DIA);
  const MAX = 8;

  return (
    <div className="mt-5 bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-serif text-lg font-semibold">
          Semana de {fmt(semana.inicio, { day: "numeric", month: "short" })} a{" "}
          {fmt(fim, { day: "numeric", month: "short", year: "numeric" })}
        </h3>
        <button type="button" onClick={onFechar} className="text-xs text-muted hover:text-foreground">
          fechar
        </button>
      </div>

      <ol className="flex flex-col divide-y divide-border">
        {semana.eps.map((e) => {
          const d = utc(e.data);
          // livros únicos do episódio: o que bate com o filtro primeiro (não
          // pode sumir no "+N"), depois os com capa real
          const citados = [...new Set(e.citacoes.map((c) => c.livroId))]
            .map((id) => livros.get(id))
            .filter((l): l is LivroEstante => Boolean(l))
            .sort(
              (a, b) =>
                (filtro ? Number(livroBate(b, filtro)) - Number(livroBate(a, filtro)) : 0) ||
                Number(Boolean(b.capa_url)) - Number(Boolean(a.capa_url))
            );
          const titulo = e.titulo.toLowerCase();
          const convidados = e.convidados.filter((c) => !titulo.includes(c.toLowerCase()));
          return (
            <li key={e.id} className="flex gap-3 sm:gap-4 py-3 first:pt-0 last:pb-0">
              <div className="w-11 shrink-0 text-center">
                <span className="block text-[10px] uppercase tracking-wider text-muted">
                  {fmt(d, { weekday: "short" }).replace(".", "")}
                </span>
                <span className="block font-serif text-2xl font-semibold leading-none mt-0.5">
                  {d.getUTCDate()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <Link href={hrefEpisodio(e)} className="group block">
                  <span className="text-[11px] text-muted tabular-nums">{e.numero ? `#${e.numero}` : ""}</span>
                  <span className="block text-sm font-semibold leading-snug group-hover:underline">{e.titulo}</span>
                </Link>
                {convidados.length > 0 && (
                  <p className="text-xs text-muted mt-0.5">com {convidados.join(", ")}</p>
                )}
                {citados.length === 0 ? (
                  <p className="text-xs text-muted mt-2">Nenhum livro citado.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2 mt-2.5">
                    {citados.slice(0, MAX).map((l) => {
                      const bate = !filtro || livroBate(l, filtro);
                      return (
                        <li key={l.id}>
                          <Link
                            href={hrefLivro(l)}
                            title={l.autor ? `${l.titulo} — ${l.autor}` : l.titulo}
                            className={`block w-10 sm:w-12 transition-opacity hover:opacity-100 ${bate ? "" : "opacity-30"}`}
                          >
                            <BookCover titulo={l.titulo} autor={l.autor} capaUrl={l.capa_url} className="w-full shadow-sm" />
                          </Link>
                        </li>
                      );
                    })}
                    {citados.length > MAX && (
                      <li className="self-center text-xs text-muted">+{citados.length - MAX}</li>
                    )}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
