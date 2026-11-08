import type { Metadata } from "next";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import CapaPodcast from "@/components/CapaPodcast";
import Compartilhar from "@/components/Compartilhar";
import Newsletter from "@/components/Newsletter";
import { Posicao } from "@/components/Rankings";
import { CAMINHO_EM_COMUM as CAMINHO, carregarEmComum, type FalaNoPodcast, type LivroEmComum } from "@/lib/emComum";
import { hrefEpisodio, hrefFala, hrefLivro, hrefPessoa } from "@/lib/links";
import { ESTANTES } from "@/lib/podcasts";
import { listaE } from "@/lib/site";
import { formatTimestamp } from "@/lib/tempo";

// Sem prazo: os dados só mudam com deploy (ver lib/dados.ts).
export const revalidate = false;

/**
 * Os livros que aparecem em mais de um podcast, com a fala de cada programa
 * lado a lado. É a pergunta que o site responde e nenhum podcast sozinho
 * responde: o que o Bruno indica que o Huberman e o Tim Ferriss também
 * indicam?
 */

const CURTO: Record<string, string> = {
  "Os Sócios Podcast": "Os Sócios",
  "The Tim Ferriss Show": "Tim Ferriss",
  "Huberman Lab": "Huberman Lab",
  "Modern Wisdom": "Modern Wisdom",
};
const curto = (nome: string) => CURTO[nome] ?? nome;

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { livros, podcasts } = await carregarEmComum();
  const emTodos = livros.filter((l) => l.falas.length === podcasts);
  const titulo = "Os livros que todo mundo cita";
  const descricao =
    `${livros.length} livros citados em mais de um podcast, ${emTodos.length} deles em todos os ${podcasts}` +
    `${emTodos.length ? `, como ${listaE(emTodos.slice(0, 2).map((l) => l.titulo))}` : ""}. ` +
    "Com a fala de cada programa e o minuto exato.";
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: CAMINHO },
    openGraph: { title: titulo, description: descricao, url: CAMINHO },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">{children}</h2>
  );
}

/** A fala de um podcast sobre o livro: quem, o quê e o minuto. */
function Fala({ f, livro }: { f: FalaNoPodcast; livro: LivroEmComum }) {
  const minuto =
    f.segundo != null && f.episodio.linkYoutube ? `${f.episodio.linkYoutube}&t=${f.segundo}s` : null;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <CapaPodcast capa={f.capaPodcast} className="w-7 h-7 rounded-md shrink-0" />
        <p className="min-w-0 text-xs leading-snug">
          <span className="font-semibold text-foreground">{curto(f.podcast)}</span>
          {f.quem && (
            <>
              <span className="text-muted"> · </span>
              <Link href={hrefPessoa(f.quem)} className="text-muted hover:text-foreground hover:underline">
                {f.quem}
              </Link>
            </>
          )}
          {f.episodios > 1 && <span className="text-muted"> · {f.episodios} episódios</span>}
        </p>
      </div>

      {f.citacao ? (
        <Link href={hrefFala(f.episodio, livro)} className="block group mt-2">
          <blockquote className="font-serif text-[15px] sm:text-base leading-snug text-foreground line-clamp-4 group-hover:underline decoration-border">
            “{f.citacao}”
          </blockquote>
        </Link>
      ) : (
        f.contexto && <p className="text-sm text-foreground/80 leading-snug mt-2 line-clamp-3">{f.contexto}</p>
      )}

      <div className="flex items-center justify-between gap-3 mt-2.5">
        <Link
          href={hrefEpisodio(f.episodio)}
          className="min-w-0 text-[11px] text-muted hover:text-foreground transition-colors leading-snug truncate"
        >
          {f.episodio.numero && <span className="font-mono mr-1">#{f.episodio.numero}</span>}
          {f.episodio.titulo}
        </Link>
        {minuto && (
          <a
            href={minuto}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-[11px] font-semibold rounded-full transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="font-mono font-normal">{formatTimestamp(f.segundo!)}</span>
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Uma linha do ranking: posição, capa, quem citou e quantas vezes. As falas
 * ficam recolhidas (details): aberta, a lista inteira virava um paredão de
 * texto e deixava de parecer ranking.
 */
function LinhaRanking({ l, i, carregar }: { l: LivroEmComum; i: number; carregar?: "eager" }) {
  return (
    <li>
      <details className="group bg-card border border-border rounded-2xl open:shadow-[0_18px_40px_-24px_rgba(43,37,33,0.45)] transition-shadow">
        <summary className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <Posicao i={i} />
          <BookCover
            titulo={l.titulo}
            autor={l.autor}
            capaUrl={l.capaUrl}
            carregar={carregar}
            className="w-11 sm:w-14 shrink-0 shadow-[0_10px_20px_-10px_rgba(43,37,33,0.6)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-base sm:text-lg font-semibold leading-snug">{l.titulo}</span>
            {l.autor && <span className="block text-xs sm:text-sm text-muted truncate">{l.autor}</span>}
            <span className="flex items-center gap-1.5 mt-1.5">
              {l.falas.map((f) => (
                <CapaPodcast
                  key={f.podcast}
                  capa={f.capaPodcast}
                  className="w-5 h-5 rounded ring-1 ring-border"
                />
              ))}
              <span className="text-xs text-muted ml-1 tabular-nums whitespace-nowrap">
                {plural(l.episodios, "episódio", "episódios")}
              </span>
            </span>
          </span>
          <svg
            className="w-4 h-4 text-muted shrink-0 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
          </svg>
        </summary>

        <div className="px-4 sm:px-5 pb-5">
          <ul className="pt-4 border-t border-border divide-y divide-border">
            {l.falas.map((f) => (
              <Fala key={f.podcast} f={f} livro={l} />
            ))}
          </ul>
          <Link
            href={hrefLivro(l)}
            className="inline-flex items-center gap-1 mt-4 text-xs font-semibold text-foreground hover:underline"
          >
            Ver todas as citações de {l.titulo} →
          </Link>
        </div>
      </details>
    </li>
  );
}

/** Os que estão em 2 podcasts: lista compacta, com os dois nomes. */
function Compactos({ livros }: { livros: LivroEmComum[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {livros.map((l) => (
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
            <span className="block text-xs text-muted truncate">
              {l.falas.map((f) => curto(f.podcast)).join(" + ")}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{l.episodios}×</span>
        </Link>
      ))}
    </div>
  );
}

export default async function LivrosEmComumPage() {
  const { livros, podcasts } = await carregarEmComum();
  const grupos = Array.from({ length: podcasts - 1 }, (_, i) => podcasts - i)
    .map((n) => ({ n, livros: livros.filter((l) => l.falas.length === n) }))
    .filter((g) => g.livros.length > 0);
  // a posição segue de um grupo pro outro: é um ranking só
  const inicio = new Map<number, number>();
  grupos.reduce((n, g) => (inicio.set(g.n, n), n + g.livros.length), 0);
  const capas = livros.slice(0, 3);

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
        {capas.length === 3 && (
          <div className="flex justify-center items-end mb-6" aria-hidden="true">
            {capas.map((l, j) => (
              <BookCover
                key={l.id}
                titulo={l.titulo}
                autor={l.autor}
                capaUrl={l.capaUrl}
                carregar="eager"
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
        <p className="text-xs uppercase tracking-widest text-muted mb-3">
          Os {podcasts} podcasts, cruzados
        </p>
        <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight leading-tight mb-4">
          Os livros que todo mundo cita
        </h1>
        <p className="text-muted text-sm sm:text-lg max-w-xl mx-auto leading-relaxed">
          <span className="font-semibold text-foreground">{livros.length}</span> livros aparecem em mais de
          um podcast. Toque num livro pra ver o que cada programa disse, com o minuto exato.
        </p>
        <div className="flex justify-center mt-5">
          <Compartilhar
            caminho={CAMINHO}
            titulo="Os livros que todo mundo cita"
            rotulo="Compartilhar esta página"
            texto="Compartilhar"
          />
        </div>
      </header>

      {grupos.map((g, gi) => (
        <section key={g.n} className="mb-14">
          <Rotulo>
            {g.n === podcasts ? `Em todos os ${podcasts} podcasts` : `Em ${g.n} podcasts`} · {g.livros.length}
          </Rotulo>
          {g.n > 2 ? (
            <ol className="flex flex-col gap-2.5">
              {g.livros.map((l, i) => (
                <LinhaRanking
                  key={l.id}
                  l={l}
                  i={inicio.get(g.n)! + i}
                  carregar={gi === 0 && i < 6 ? "eager" : undefined}
                />
              ))}
            </ol>
          ) : (
            <Compactos livros={g.livros} />
          )}
        </section>
      ))}

      <Newsletter />
    </div>
  );
}
