import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookCover from "@/components/BookCover";
import ComprarAmazon from "@/components/ComprarAmazon";
import Compartilhar from "@/components/Compartilhar";
import Newsletter from "@/components/Newsletter";
import { Posicao } from "@/components/Rankings";
import { ESTANTES } from "@/lib/podcasts";
import { hrefEpisodio, hrefFala, hrefLivro, hrefPessoa, linkAmazon } from "@/lib/links";
import {
  carregarPessoa,
  type LivroDaPessoa,
  type LivroProprio,
  type Participacao,
  type Pessoa,
} from "@/lib/pessoas";
import { formatTimestamp } from "@/lib/tempo";

export const revalidate = 60;
// Cada pessoa entra no cache na primeira visita, como o livro.
export async function generateStaticParams() {
  return [];
}

/**
 * A página de uma pessoa: de quais episódios participou e quais livros citou.
 *
 * Convidado: participações primeiro (é a lista curta, e é o que se procura ao
 * buscar alguém), depois os livros. Quem apresenta está em todo episódio, então
 * o ranking de livros sobe e os episódios ficam recolhidos no fim. Nos dois, o
 * livro escrito pela pessoa vem antes do ranking, mas fora dele: é divulgação,
 * não indicação.
 */

const NO_PODIO = 10;

function vezes(n: number) {
  return n === 1 ? "1 vez" : `${n} vezes`;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

function formatDate(data: string | null) {
  if (!data) return null;
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** A linha pequena acima do nome. */
function rotulo(p: Pessoa) {
  if (p.apresenta) return `Apresenta ${p.apresenta}`;
  if (p.participacoes.length)
    return `${plural(p.participacoes.length, "participação", "participações")} · ${p.podcasts.join(" e ")}`;
  return p.podcasts.join(" e ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await carregarPessoa(slug);
  if (!p) return { title: "Pessoa não encontrada" };

  const [primeiro] = p.livros;
  const titulo = p.apresenta
    ? `Os livros que ${p.nome} mais cita`
    : `${p.nome}: participações e livros citados`;
  const descricao = p.apresenta
    ? `${p.livros.length} livros citados em ${p.episodiosComCitacao} episódios de ${p.apresenta}.${primeiro ? ` O mais citado: ${primeiro.titulo}, ${vezes(primeiro.vezes)}.` : ""} Com a fala e o minuto de cada citação.`
    : `${rotulo(p)}. ${plural(p.livros.length, "livro citado", "livros citados")}, com a fala e o minuto de cada citação.`;
  const endereco = hrefPessoa(p.nome);

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: endereco },
    robots: p.indexavel ? undefined : { index: false },
    openGraph: { type: "profile", title: titulo, description: descricao, url: endereco },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">{children}</h2>
  );
}

function linkMinuto(l: LivroDaPessoa) {
  const { segundo, episodio } = l.destaque;
  return segundo != null && episodio.linkYoutube ? `${episodio.linkYoutube}&t=${segundo}s` : null;
}

/** Um livro citado: capa, quantas vezes e a fala de destaque. Com `i`, a posição no ranking. */
function CardLivro({ l, i, nome }: { l: LivroDaPessoa; i?: number; nome: string }) {
  const minuto = linkMinuto(l);
  const { citacao, episodio } = l.destaque;
  return (
    <li className="p-5 sm:p-6 bg-card border border-border rounded-2xl">
      <div className="flex items-start gap-4">
        {i !== undefined && <Posicao i={i} />}
        <Link href={hrefLivro(l)} className="shrink-0">
          <BookCover
            titulo={l.titulo}
            autor={l.autor}
            capaUrl={l.capaUrl}
            carregar={i !== undefined && i < 3 ? "eager" : undefined}
            className="w-16 sm:w-20 shadow-[0_12px_24px_-12px_rgba(43,37,33,0.6)]"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={hrefLivro(l)} className="group">
            <h3 className="font-serif text-lg sm:text-xl font-semibold leading-snug group-hover:underline">
              {l.titulo}
            </h3>
          </Link>
          {l.autor && <p className="text-sm text-muted mt-0.5">{l.autor}</p>}
          {l.vezes > 1 && (
            <p className="text-sm font-semibold text-foreground mt-2">Citado {vezes(l.vezes)}</p>
          )}
        </div>
      </div>

      {citacao && (
        <blockquote className="font-serif text-base sm:text-lg leading-snug text-foreground mt-4">
          “{citacao}”
        </blockquote>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-border">
        <Link
          href={hrefEpisodio(episodio)}
          className="min-w-0 text-xs text-muted hover:text-foreground transition-colors leading-snug"
        >
          {episodio.numero && <span className="font-mono mr-1.5">#{episodio.numero}</span>}
          {episodio.titulo}
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {minuto && (
            <a
              href={minuto}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold rounded-full transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Ouvir
              <span className="font-mono font-normal opacity-90">
                {formatTimestamp(l.destaque.segundo!)}
              </span>
            </a>
          )}
          {citacao && (
            <Compartilhar
              caminho={hrefFala(episodio, l)}
              titulo={`${nome} sobre ${l.titulo}`}
              rotulo="Compartilhar esta fala"
            />
          )}
        </div>
      </div>
    </li>
  );
}

/** O livro da própria pessoa, em destaque antes do ranking. */
function Proprios({ livros, nome }: { livros: LivroProprio[]; nome: string }) {
  if (livros.length === 0) return null;
  return (
    <section className="mb-12">
      <Rotulo>{livros.length === 1 ? "Escrito por" : "Escritos por"} {nome}</Rotulo>
      <div className="flex flex-col gap-4">
        {livros.map((l) => (
          <article
            key={l.id}
            className="flex items-center gap-5 p-5 sm:p-6 bg-card border border-border rounded-2xl"
          >
            <Link href={hrefLivro(l)} className="shrink-0">
              <BookCover
                titulo={l.titulo}
                autor={l.autor}
                capaUrl={l.capaUrl}
                carregar="eager"
                className="w-20 sm:w-24 -rotate-1 shadow-[0_18px_36px_-14px_rgba(43,37,33,0.7)]"
              />
            </Link>
            <div className="min-w-0">
              <Link href={hrefLivro(l)} className="group">
                <h3 className="font-serif text-xl sm:text-2xl font-semibold leading-snug group-hover:underline">
                  {l.titulo}
                </h3>
              </Link>
              <p className="text-sm text-muted mt-1">
                Citado {vezes(l.vezes)} nos podcasts
              </p>
              <div className="mt-4">
                <ComprarAmazon br={linkAmazon(l)} eua={null} estilo="botao" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LinhaParticipacao({ e }: { e: Participacao }) {
  return (
    <li>
      <Link
        href={hrefEpisodio(e)}
        className="group flex items-baseline gap-3 p-3.5 bg-card border border-border rounded-xl hover:bg-card-hover transition-colors"
      >
        {e.numero && <span className="font-mono text-xs text-muted shrink-0">#{e.numero}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug group-hover:underline">{e.titulo}</span>
          <span className="block text-xs text-muted mt-1">
            {[formatDate(e.data), e.podcast, e.livros ? plural(e.livros, "livro citado", "livros citados") : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Participacoes({ p }: { p: Pessoa }) {
  if (p.participacoes.length === 0) return null;
  const lista = (
    <ol className="flex flex-col gap-2">
      {p.participacoes.map((e) => (
        <LinhaParticipacao key={e.id} e={e} />
      ))}
    </ol>
  );
  // quem apresenta está em centenas de episódios: recolhido
  if (p.apresenta)
    return (
      <details className="mt-14 group">
        <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted uppercase tracking-widest mb-4 hover:text-foreground">
          Participações · {p.participacoes.length} episódios{" "}
          <span className="normal-case tracking-normal font-normal group-open:hidden">(mostrar)</span>
        </summary>
        {lista}
      </details>
    );
  return (
    <section className="mb-12">
      <Rotulo>Participações · {p.participacoes.length}</Rotulo>
      {lista}
    </section>
  );
}

function LivrosCitados({ p }: { p: Pessoa }) {
  if (p.livros.length === 0) return null;
  // ranking com medalha só quando há o que ranquear
  const ranking = p.livros.some((l) => l.vezes > 1);
  const podio = p.livros.slice(0, NO_PODIO);
  const resto = p.livros.slice(NO_PODIO);
  return (
    <section>
      <Rotulo>
        {ranking ? "Os livros mais citados" : "Livros citados"} · {p.livros.length}
      </Rotulo>
      <ol className="flex flex-col gap-4">
        {podio.map((l, i) => (
          <CardLivro key={l.id} l={l} i={ranking ? i : undefined} nome={p.nome} />
        ))}
      </ol>

      {resto.length > 0 && (
        <div className="mt-10">
          <Rotulo>Os outros {plural(resto.length, "livro", "livros")}</Rotulo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {resto.map((l) => (
              <Link
                key={l.id}
                href={hrefLivro(l)}
                className="group flex items-center gap-3 p-2.5 bg-card border border-border rounded-xl hover:border-accent/30 hover:bg-card-hover transition-all"
              >
                <BookCover titulo={l.titulo} autor={l.autor} capaUrl={l.capaUrl} className="w-9 shrink-0 shadow-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug truncate group-hover:underline">
                    {l.titulo}
                  </span>
                  <span className="block text-xs text-muted truncate">{l.autor ?? "—"}</span>
                </span>
                {l.vezes > 1 && <span className="shrink-0 text-xs text-muted tabular-nums">{l.vezes}×</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default async function PessoaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await carregarPessoa(slug);
  if (!p) return notFound();

  const capas = [...p.proprios, ...p.livros].slice(0, 3);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={ESTANTES}
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Estantes
      </Link>

      <header className="text-center mb-10 sm:mb-14">
        {/* três capas em leque: dá pra saber do que é a página antes de ler */}
        {capas.length === 3 && (
          <div className="flex justify-center items-end mb-6" aria-hidden="true">
            {capas.map((l, j) => (
              <BookCover
                key={l.id}
                titulo={l.titulo}
                autor={l.autor}
                capaUrl={l.capaUrl}
                carregar="eager"
                // o 1º no meio e maior, o 2º à esquerda e o 3º à direita
                className={`shadow-[0_18px_36px_-14px_rgba(43,37,33,0.7)] ring-2 ring-background ${
                  j === 0
                    ? "relative z-10 -mx-3 w-24 sm:w-28"
                    : j === 1
                      ? "order-first w-20 sm:w-24 -rotate-6"
                      : "w-20 sm:w-24 rotate-6"
                }`}
              />
            ))}
          </div>
        )}
        <p className="text-xs uppercase tracking-widest text-muted mb-3">{rotulo(p)}</p>
        <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight leading-tight mb-4">
          {p.nome}
        </h1>
        {p.descricao && (
          <p className="text-foreground/80 max-w-xl mx-auto leading-relaxed mb-3">{p.descricao}</p>
        )}
        {p.livros.length > 0 && (
          <p className="text-muted text-sm sm:text-lg max-w-xl mx-auto leading-relaxed">
            <span className="font-semibold text-foreground">{p.livros.length}</span>{" "}
            {p.livros.length === 1 ? "livro citado" : "livros citados"}
            {p.apresenta && (
              <>
                {" "}em <span className="font-semibold text-foreground">{p.episodiosComCitacao}</span>{" "}
                episódios
              </>
            )}
            , com a fala e o minuto de cada citação.
          </p>
        )}
        <div className="flex justify-center mt-5">
          <Compartilhar
            caminho={hrefPessoa(p.nome)}
            titulo={p.apresenta ? `Os livros que ${p.nome} mais cita` : `${p.nome} nos podcasts`}
            rotulo="Compartilhar esta página"
            texto="Compartilhar"
          />
        </div>
      </header>

      {p.apresenta ? (
        <>
          <Proprios livros={p.proprios} nome={p.nome} />
          <LivrosCitados p={p} />
          <Participacoes p={p} />
        </>
      ) : (
        <>
          <Participacoes p={p} />
          <Proprios livros={p.proprios} nome={p.nome} />
          <LivrosCitados p={p} />
        </>
      )}

      <Newsletter />
    </div>
  );
}
