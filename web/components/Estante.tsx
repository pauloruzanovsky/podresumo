import Link from "next/link";
import BookCover from "./BookCover";

/**
 * Estante de biblioteca: um móvel com prateleiras, cada uma com uma plaquinha
 * dizendo o que tem ali e os livros de frente, de pé sobre a tábua.
 *
 * É a primeira coisa da página do podcast — quem clica numa estante espera
 * ver livros, não texto.
 */
export interface LivroNaEstante {
  id: string;
  titulo: string;
  autor: string | null;
  capa_url: string | null;
  /** Linha pequena sob o título: "4 citações", "indicado por Bruno Perini". */
  rotulo: string;
}

export interface Prateleira {
  titulo: string;
  subtitulo: string;
  livros: LivroNaEstante[];
}

export default function Estante({ prateleiras }: { prateleiras: Prateleira[] }) {
  const comLivros = prateleiras.filter((p) => p.livros.length > 0);
  if (comLivros.length === 0) return null;

  return (
    // O móvel: fundo um tom mais escuro que o papel, com sombra interna, pra
    // os livros parecerem estar dentro de um nicho e não soltos na página.
    <div className="rounded-2xl border border-shelf/60 bg-[#efe5d3] shadow-[inset_0_2px_10px_rgba(43,37,33,0.10)] px-3 sm:px-6 pt-6 pb-2 mb-12 sm:mb-16">
      {comLivros.map((p) => (
        <section key={p.titulo} className="mb-8 last:mb-4">
          {/* Plaquinha da seção, como nas estantes de livraria */}
          <header className="flex items-baseline gap-3 flex-wrap px-2 mb-4">
            <h2 className="font-serif text-lg sm:text-xl font-semibold tracking-tight">
              {p.titulo}
            </h2>
            <p className="text-xs text-muted">{p.subtitulo}</p>
          </header>

          {/* Cada livro carrega o seu pedaço de tábua; sem espaço entre as
              colunas os pedaços se emendam numa prateleira contínua, e quando
              a grade quebra em duas linhas (celular) cada linha ganha a sua. */}
          <ul className="grid grid-cols-3 md:grid-cols-6 gap-y-6">
            {p.livros.map((l) => (
              <li key={l.id} className="min-w-0">
                <Link href={`/livro/${l.id}`} className="group block">
                  <div className="px-2 sm:px-3">
                    <BookCover
                      titulo={l.titulo}
                      autor={l.autor}
                      capaUrl={l.capa_url}
                      className="w-full rounded-b-none shadow-[0_-1px_0_rgba(255,255,255,0.25),4px_0_10px_-4px_rgba(43,37,33,0.45)] transition-transform duration-200 ease-out group-hover:-translate-y-2 group-focus-visible:-translate-y-2"
                    />
                  </div>
                  {/* A tábua: claro em cima (a face), escuro embaixo (a quina),
                      e a sombra que ela projeta no fundo do móvel. */}
                  <div className="h-3 bg-gradient-to-b from-[#d9c6a4] via-shelf to-[#a98f68] shadow-[0_7px_9px_-5px_rgba(43,37,33,0.55)]" />
                  <div className="px-2 sm:px-3 pt-2.5">
                    <p className="text-xs font-semibold leading-snug line-clamp-2 group-hover:underline">
                      {l.titulo}
                    </p>
                    <p className="text-[11px] text-muted leading-snug mt-0.5 line-clamp-2">
                      {l.rotulo}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
