import Link from "next/link";
import BookCover from "./BookCover";
import { hrefLivro } from "@/lib/links";

/**
 * Fileiras de capas reais correndo devagar no topo da home: antes de ler
 * qualquer coisa, a pessoa já vê que o site é feito de livros. Cada capa
 * leva à página do livro; passar o mouse pausa (CSS em globals.css, que
 * também desliga o movimento pra quem pediu menos animação no sistema).
 *
 * A lista vai duplicada em cada fileira pra emenda do loop não aparecer.
 */
export interface CapaMural {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capaUrl: string;
}

function Fileira({
  capas,
  sentido,
  duracao,
  carregar,
  className = "",
}: {
  capas: CapaMural[];
  sentido: "ida" | "volta";
  duracao: string;
  /** "eager" na fileira que aparece em toda tela; "lazy" na que o celular
   *  esconde — escondida com lazy, a imagem nem é baixada. */
  carregar: "eager" | "lazy";
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <ul
        className="mural-fileira flex w-max gap-3 sm:gap-4"
        data-sentido={sentido}
        style={{ ["--mural-duracao" as string]: duracao }}
      >
        {[...capas, ...capas].map((l, i) => (
          <li key={`${l.id}-${i}`} aria-hidden={i >= capas.length}>
            <Link
              href={hrefLivro(l)}
              tabIndex={i >= capas.length ? -1 : undefined}
              title={l.autor ? `${l.titulo} — ${l.autor}` : l.titulo}
              className="block w-16 sm:w-24 transition-transform duration-300 hover:-translate-y-1.5"
            >
              <BookCover
                titulo={l.titulo}
                autor={l.autor}
                capaUrl={l.capaUrl}
                carregar={carregar}
                className="w-full shadow-[0_8px_18px_-8px_rgba(43,37,33,0.55)]"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MuralCapas({ capas }: { capas: CapaMural[] }) {
  if (capas.length < 8) return null;
  const meio = Math.ceil(capas.length / 2);
  return (
    <div
      className="mural relative -mx-8 lg:-mx-12 mb-8 sm:mb-12 flex flex-col gap-3 sm:gap-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
      aria-label="Livros citados"
    >
      <Fileira capas={capas.slice(0, meio)} sentido="ida" duracao="110s" carregar="eager" />
      {/* a segunda fileira só no computador: no celular a newsletter
          precisa caber na primeira tela */}
      <Fileira capas={capas.slice(meio)} sentido="volta" duracao="130s" carregar="lazy" className="hidden sm:block" />
    </div>
  );
}
