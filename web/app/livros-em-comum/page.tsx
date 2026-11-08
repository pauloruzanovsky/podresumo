import type { Metadata } from "next";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import Compartilhar from "@/components/Compartilhar";
import Newsletter from "@/components/Newsletter";
import { curto, LinhaRanking, plural } from "@/components/RankingEmComum";
import { CAMINHO_EM_COMUM as CAMINHO, carregarEmComum, type LivroEmComum } from "@/lib/emComum";
import { hrefLivro } from "@/lib/links";
import { ESTANTES } from "@/lib/podcasts";
import { listaE } from "@/lib/site";

// Sem prazo: os dados só mudam com deploy (ver lib/dados.ts).
export const revalidate = false;

/**
 * Os livros que aparecem em mais de um podcast, com a fala de cada programa
 * lado a lado. É a pergunta que o site responde e nenhum podcast sozinho
 * responde: o que o Bruno indica que o Huberman e o Tim Ferriss também
 * indicam?
 */

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
