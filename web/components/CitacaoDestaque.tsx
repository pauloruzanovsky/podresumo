import Link from "next/link";
import BookCover from "./BookCover";
import { hrefEpisodio, hrefLivro } from "@/lib/links";

/**
 * A citação do dia na home: uma fala literal de recomendação, com o livro, quem
 * disse e o botão pro minuto (que toca no player embutido). É o diferencial
 * do site — a fala e o minuto — logo na primeira visita, e troca todo dia.
 */
export interface Destaque {
  citacao: string;
  quem: string | null;
  segundo: number;
  linkYoutube: string;
  livro: { id: string; slug: string | null; titulo: string; autor: string | null; capaUrl: string | null };
  episodio: { id: string; slug: string | null; numero: string | null; titulo: string };
}

function minuto(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function CitacaoDestaque({ d }: { d: Destaque }) {
  return (
    <section className="mb-14 sm:mb-16" aria-label="Citação do dia">
      <article className="relative overflow-hidden bg-card border border-border rounded-3xl p-6 sm:p-10">
        <p className="relative text-[11px] font-semibold uppercase tracking-widest text-muted mb-5">
          A citação do dia
        </p>

        <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-10 sm:items-center">
          <Link href={hrefLivro(d.livro)} className="shrink-0 self-start group">
            <BookCover
              titulo={d.livro.titulo}
              autor={d.livro.autor}
              capaUrl={d.livro.capaUrl}
              className="w-24 sm:w-36 shadow-[0_18px_40px_-14px_rgba(43,37,33,0.6)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:-rotate-1"
            />
          </Link>

          <div className="min-w-0">
            <blockquote className="font-serif text-2xl sm:text-[2rem] leading-snug tracking-tight">
              “{d.citacao}”
            </blockquote>
            <p className="mt-4 text-sm">
              {d.quem && <span className="font-semibold">— {d.quem}</span>}
              <span className="text-muted">
                {d.quem ? ", sobre " : "Sobre "}
                <Link href={hrefLivro(d.livro)} className="italic underline underline-offset-2 hover:text-foreground">
                  {d.livro.titulo}
                </Link>
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-6">
              <a
                href={`${d.linkYoutube}&t=${d.segundo}s`}
                data-trecho={`${d.livro.titulo} — ${d.quem ?? "trecho"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold rounded-full transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Ouvir o trecho
                <span className="font-mono font-normal opacity-90">{minuto(d.segundo)}</span>
              </a>
              <Link href={hrefEpisodio(d.episodio)} className="text-xs text-muted hover:text-foreground leading-snug">
                {d.episodio.numero && <span className="font-mono mr-1.5">#{d.episodio.numero}</span>}
                {d.episodio.titulo}
              </Link>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
