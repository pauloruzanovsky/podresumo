import Link from "next/link";
import BookCover from "./BookCover";

/**
 * Os dois placares da estante: quem mais cita livros e os autores que mais
 * voltam. Barras pra dar escala de relance e medalha pros três primeiros —
 * a ideia é instigar a disputa entre convidados ("fui o que mais citou?").
 *
 * Gráfico de uma série só: sem legenda, valor escrito no fim de cada barra,
 * cor da marca (`--color-chart`, validada no verificador de paleta). Cada
 * linha filtra a estante acima.
 */
export interface PessoaPlacar {
  nome: string;
  citacoes: number;
}

export interface AutorPlacar {
  nome: string;
  citacoes: number;
  livros: number;
  capas: { id: string; titulo: string; capa_url: string | null }[];
}

// ouro, prata, bronze — o número vai por cima, em tinta escura
const MEDALHAS = ["#d9b54a", "#c3c5c8", "#c8935f"];

export function Posicao({ i }: { i: number }) {
  if (i < 3) {
    return (
      <span
        className="grid place-items-center w-7 h-7 rounded-full text-[11px] font-bold text-[#2b2521] shadow-[inset_0_-2px_0_rgba(0,0,0,0.15)] shrink-0"
        style={{ background: MEDALHAS[i] }}
        aria-label={`${i + 1}º lugar`}
      >
        {i + 1}
      </span>
    );
  }
  return (
    <span className="grid place-items-center w-7 h-7 font-mono text-xs text-muted shrink-0">
      {i + 1}
    </span>
  );
}

/**
 * Barra num trilho de largura fixa e rótulo numa coluna de largura fixa: só
 * assim o comprimento é comparável entre as linhas. Com o rótulo dividindo o
 * espaço com a barra, cada linha encolhia de um jeito e o 1º lugar chegou a
 * ficar menor que o 2º.
 */
function Barra({
  valor,
  maximo,
  rotulo,
  larguraRotulo,
}: {
  valor: number;
  maximo: number;
  rotulo: string;
  larguraRotulo: string;
}) {
  return (
    <span className="flex items-center gap-2 mt-1.5">
      <span className="flex-1 min-w-0">
        <span
          className="block h-2 rounded-r-[4px] bg-chart group-hover:opacity-80 transition-opacity"
          style={{ width: `${Math.max((valor / maximo) * 100, 3)}%` }}
        />
      </span>
      <span className={`${larguraRotulo} shrink-0 text-right text-xs text-muted whitespace-nowrap tabular-nums`}>
        {rotulo}
      </span>
    </span>
  );
}

function Quadro({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5 sm:p-6">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{titulo}</h2>
      <p className="text-xs text-muted mt-1 mb-4">{subtitulo}</p>
      {children}
    </section>
  );
}

export default function Rankings({
  pessoas,
  autores,
  apresentadores,
}: {
  pessoas: PessoaPlacar[];
  autores: AutorPlacar[];
  apresentadores: string[];
}) {
  if (pessoas.length === 0 && autores.length === 0) return null;
  const maxPessoa = pessoas[0]?.citacoes ?? 1;
  const maxAutor = autores[0]?.citacoes ?? 1;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-14 sm:mb-16">
      {pessoas.length > 0 && (
        <Quadro
          titulo="Quem mais cita livros"
          subtitulo={`Entre os convidados — ${apresentadores.join(" e ")} ficam fora da disputa. Clique pra ver os livros de cada um.`}
        >
          <ol className="flex flex-col gap-1">
            {pessoas.map((p, i) => (
              <li key={p.nome}>
                <Link
                  href={`?pessoa=${encodeURIComponent(p.nome)}#todos-os-livros`}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-card-hover transition-colors"
                >
                  <Posicao i={i} />
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate group-hover:underline ${i === 0 ? "font-semibold" : "font-medium"} text-sm`}>
                      {p.nome}
                    </span>
                    <Barra
                      valor={p.citacoes}
                      maximo={maxPessoa}
                      rotulo={`${p.citacoes} ${p.citacoes === 1 ? "citação" : "citações"}`}
                      larguraRotulo="w-20"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Quadro>
      )}

      {autores.length > 0 && (
        <Quadro
          titulo="Autores que sempre voltam"
          subtitulo="Os mais citados no programa, somando todos os livros de cada um."
        >
          <ol className="flex flex-col gap-1">
            {autores.map((a, i) => (
              <li key={a.nome}>
                <Link
                  href={`?q=${encodeURIComponent(a.nome)}#todos-os-livros`}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-card-hover transition-colors"
                >
                  <Posicao i={i} />
                  {/* as capas dos livros dele, em leque */}
                  <span className="flex shrink-0 w-12" aria-hidden="true">
                    {a.capas.slice(0, 3).map((c, j) => (
                      <BookCover
                        key={c.id}
                        titulo={c.titulo}
                        capaUrl={c.capa_url}
                        className={`w-7 shadow-sm ring-1 ring-card ${j > 0 ? "-ml-4" : ""}`}
                      />
                    ))}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate group-hover:underline ${i === 0 ? "font-semibold" : "font-medium"} text-sm`}>
                      {a.nome}
                    </span>
                    <Barra
                      valor={a.citacoes}
                      maximo={maxAutor}
                      rotulo={`${a.citacoes} citações · ${a.livros} ${a.livros === 1 ? "livro" : "livros"}`}
                      larguraRotulo="w-32"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Quadro>
      )}
    </div>
  );
}
