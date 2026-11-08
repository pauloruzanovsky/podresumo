import Link from "next/link";
import BookCover from "@/components/BookCover";
import CapaPodcast from "@/components/CapaPodcast";
import ComprarAmazon from "@/components/ComprarAmazon";
import { Posicao } from "@/components/Rankings";
import type { FalaNoPodcast, LivroEmComum } from "@/lib/emComum";
import { hrefEpisodio, hrefFala, hrefLivro, hrefPessoa, linkAmazon, linkAmazonEua } from "@/lib/links";
import { PODCASTS_EM_INGLES } from "@/lib/podcasts";
import { formatTimestamp } from "@/lib/tempo";

/**
 * A linha do ranking dos livros que todo mundo cita (lib/emComum), usada na
 * página /livros-em-comum e no top 10 da home.
 */

export const CURTO: Record<string, string> = {
  "Os Sócios Podcast": "Os Sócios",
  "The Tim Ferriss Show": "Tim Ferriss",
  "Huberman Lab": "Huberman Lab",
  "Modern Wisdom": "Modern Wisdom",
};
export const curto = (nome: string) => CURTO[nome] ?? nome;

export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
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
export function LinhaRanking({ l, i, carregar }: { l: LivroEmComum; i: number; carregar?: "eager" }) {
  return (
    <li>
      <details className="group bg-card border border-border rounded-2xl open:shadow-[0_18px_40px_-24px_rgba(43,37,33,0.45)] transition-shadow">
        <summary className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <Posicao i={i} />
          {/* a capa leva à página do livro; o resto da linha abre as falas */}
          <Link href={hrefLivro(l)} className="shrink-0" aria-label={`Página de ${l.titulo}`}>
            <BookCover
              titulo={l.titulo}
              autor={l.autor}
              capaUrl={l.capaUrl}
              carregar={carregar}
              className="w-11 sm:w-14 shadow-[0_10px_20px_-10px_rgba(43,37,33,0.6)]"
            />
          </Link>
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
          {/* depois de ouvir a indicação é a hora de comprar: o botão vem aqui,
              sem obrigar a passar pela página do livro */}
          <div className="flex items-center gap-3 flex-wrap mt-5">
            <ComprarAmazon
              br={linkAmazon(l)}
              eua={linkAmazonEua(l, l.falas.some((f) => PODCASTS_EM_INGLES.includes(f.podcast)))}
              estilo="botao"
            />
            <Link
              href={hrefLivro(l)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-border hover:bg-card-hover text-sm font-semibold text-foreground rounded-full transition-colors"
            >
              Página do livro
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </details>
    </li>
  );
}

