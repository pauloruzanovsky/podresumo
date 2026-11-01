import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import BookCover from "@/components/BookCover";
import Compartilhar from "@/components/Compartilhar";
import Newsletter from "@/components/Newsletter";
import { carregarFala } from "@/lib/falas";
import { hrefEpisodio, hrefFala, hrefLivro, linkAmazon } from "@/lib/links";
import { formatTimestamp } from "@/lib/tempo";

export const revalidate = 60;
// Mesmo arranjo das páginas de livro e episódio: cache na primeira visita.
export async function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ episodio: string; livro: string }>;
}

/**
 * É esta página que viaja quando alguém compartilha uma fala. Pro Google ela
 * repete a do livro, então o canonical aponta pra lá; a imagem vem de
 * opengraph-image.tsx.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { episodio, livro } = await params;
  const f = await carregarFala(episodio, livro);
  if (!f) return { title: "Fala não encontrada" };

  const titulo = `${f.quem ? `${f.quem} sobre` : "Sobre"} ${f.livro.titulo}`;
  const descricao = `“${f.citacao}”`;
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: hrefLivro(f.livro) },
    openGraph: {
      type: "article",
      title: titulo,
      description: descricao,
      url: hrefFala(f.episodio, f.livro),
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

export default async function FalaPage({ params }: Props) {
  const { episodio, livro } = await params;
  const f = await carregarFala(episodio, livro);
  if (!f) return notFound();
  const endereco = hrefFala(f.episodio, f.livro);
  if (endereco !== `/fala/${episodio}/${livro}`) permanentRedirect(endereco);

  const minuto =
    f.segundo != null && f.episodio.linkYoutube ? `${f.episodio.linkYoutube}&t=${f.segundo}s` : null;

  return (
    <div className="max-w-2xl mx-auto">
      <article className="bg-card border border-border rounded-3xl p-6 sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-5">
          {f.episodio.podcast}
        </p>
        <blockquote className="font-serif text-2xl sm:text-4xl leading-snug tracking-tight">
          “{f.citacao}”
        </blockquote>
        {f.quem && <p className="mt-5 font-semibold">{f.quem}</p>}

        <div className="flex items-center gap-2 mt-7">
          {minuto && (
            <a
              href={minuto}
              data-trecho={`${f.livro.titulo}${f.quem ? ` — ${f.quem}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold rounded-full transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Ouvir o trecho
              <span className="font-mono font-normal opacity-90">{formatTimestamp(f.segundo!)}</span>
            </a>
          )}
          <Compartilhar
            caminho={endereco}
            titulo={`${f.quem ? `${f.quem} sobre` : "Sobre"} ${f.livro.titulo}`}
            rotulo="Compartilhar esta fala"
          />
        </div>

        {f.contexto && <p className="text-sm text-muted leading-relaxed mt-7">{f.contexto}</p>}

        <Link
          href={hrefEpisodio(f.episodio)}
          className="block mt-4 text-xs text-muted hover:text-foreground leading-snug"
        >
          {f.episodio.numero && <span className="font-mono mr-1.5">#{f.episodio.numero}</span>}
          {f.episodio.titulo}
        </Link>
      </article>

      <section className="flex items-center gap-5 mt-6 p-5 sm:p-6 bg-card border border-border rounded-2xl">
        <Link href={hrefLivro(f.livro)} className="shrink-0">
          <BookCover
            titulo={f.livro.titulo}
            autor={f.livro.autor}
            capaUrl={f.livro.capaUrl}
            carregar="eager"
            className="w-20 shadow-[0_10px_24px_-10px_rgba(43,37,33,0.6)]"
          />
        </Link>
        <div className="min-w-0">
          <Link href={hrefLivro(f.livro)} className="font-serif text-xl font-semibold leading-tight hover:underline">
            {f.livro.titulo}
          </Link>
          {f.livro.autor && <p className="text-sm text-muted mt-1">{f.livro.autor}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
            <a
              href={linkAmazon(f.livro.titulo, f.livro.autor)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="text-sm font-semibold text-accent-light underline underline-offset-2 hover:text-accent"
            >
              Comprar na Amazon
            </a>
            <Link href={hrefLivro(f.livro)} className="text-sm text-muted hover:text-foreground">
              Tudo que disseram →
            </Link>
          </div>
        </div>
      </section>

      <Newsletter />
    </div>
  );
}
