import type { Metadata } from "next";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import HomeSearch from "@/components/HomeSearch";
import { buscarLivros } from "@/lib/busca";
import { hrefLivro } from "@/lib/links";
import { ESTANTES } from "@/lib/podcasts";

// Resultado de busca não é página pro Google: cada termo geraria uma cópia.
export const metadata: Metadata = {
  title: "Busca",
  robots: { index: false },
};

const NO_MAXIMO = 60;

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const busca = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const achados = await buscarLivros(busca);

  return (
    <div className="max-w-4xl mx-auto">
      {/* key: uma busca nova a partir daqui reinicia o campo */}
      <HomeSearch key={busca} inicial={busca} />

      {busca && (
        <p className="text-sm text-muted mt-6 mb-5">
          {achados.length === 0
            ? `Nenhum livro encontrado para “${busca}”.`
            : `${achados.length} ${achados.length === 1 ? "livro" : "livros"} para “${busca}”`}
          {achados.length > NO_MAXIMO && `, mostrando os ${NO_MAXIMO} primeiros`}
        </p>
      )}

      {busca && achados.length === 0 && (
        <Link href={ESTANTES} className="text-sm underline underline-offset-2 hover:text-foreground">
          Ver as estantes
        </Link>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {achados.slice(0, NO_MAXIMO).map((l) => (
          <li key={l.id}>
            <Link
              href={hrefLivro(l)}
              className="group flex gap-4 p-3 h-full bg-card border border-border rounded-xl hover:bg-card-hover transition-colors"
            >
              <BookCover
                titulo={l.titulo}
                autor={l.autor}
                capaUrl={l.capaUrl}
                className="w-14 shrink-0 shadow-sm"
              />
              <span className="min-w-0">
                <span className="block font-medium leading-snug group-hover:underline">{l.titulo}</span>
                {l.autor && <span className="block text-sm text-muted mt-0.5">{l.autor}</span>}
                <span className="block text-xs text-muted mt-1.5">
                  {l.citacoes} {l.citacoes === 1 ? "citação" : "citações"} em {l.podcasts.join(", ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
