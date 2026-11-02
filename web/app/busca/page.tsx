import type { Metadata } from "next";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import CapaPodcast from "@/components/CapaPodcast";
import HomeSearch from "@/components/HomeSearch";
import { buscarTudo, detalheEpisodio } from "@/lib/busca";
import { hrefEpisodio, hrefLivro } from "@/lib/links";
import { ESTANTES } from "@/lib/podcasts";

// Resultado de busca não é página pro Google: cada termo geraria uma cópia.
export const metadata: Metadata = {
  title: "Busca",
  robots: { index: false },
};

const LIVROS_NO_MAXIMO = 60;
const PESSOAS_NO_MAXIMO = 12;
const EPISODIOS_NO_MAXIMO = 20;

function Grupo({ titulo, total, children }: { titulo: string; total: number; children: React.ReactNode }) {
  if (total === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3">
        {titulo} <span className="font-normal">· {total}</span>
      </h2>
      {children}
    </section>
  );
}

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const busca = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const { podcasts, pessoas, livros, episodios } = await buscarTudo(busca);
  const total = podcasts.length + pessoas.length + livros.length + episodios.length;
  const card = "bg-card border border-border rounded-xl hover:bg-card-hover transition-colors";

  return (
    <div className="max-w-4xl mx-auto">
      {/* key: uma busca nova a partir daqui reinicia o campo */}
      <HomeSearch key={busca} inicial={busca} focar={!busca} />

      {busca && total === 0 && (
        <div className="text-sm text-muted mt-6">
          <p className="mb-2">Nada encontrado para “{busca}”.</p>
          <Link href={ESTANTES} className="underline underline-offset-2 hover:text-foreground">
            Ver as estantes
          </Link>
        </div>
      )}

      <Grupo titulo="Podcasts" total={podcasts.length}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {podcasts.map((p) => (
            <li key={p.slug}>
              <Link href={`/podcast/${p.slug}`} className={`flex items-center gap-3 p-3 h-full ${card}`}>
                <CapaPodcast capa={p.capa} className="w-12 shrink-0 rounded-lg" />
                <span className="min-w-0">
                  <span className="block font-medium leading-snug">{p.nome}</span>
                  <span className="block text-xs text-muted mt-0.5">{p.selo}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="Pessoas" total={pessoas.length}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pessoas.slice(0, PESSOAS_NO_MAXIMO).map((p) => (
            <li key={p.nome}>
              <Link href={p.href} className={`block p-3 h-full ${card}`}>
                <span className="block font-medium leading-snug">{p.nome}</span>
                <span className="block text-xs text-muted mt-0.5">{p.papel}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="Livros" total={livros.length}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {livros.slice(0, LIVROS_NO_MAXIMO).map((l) => (
            <li key={l.id}>
              <Link href={hrefLivro(l)} className={`group flex gap-4 p-3 h-full ${card}`}>
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
      </Grupo>

      <Grupo titulo="Episódios" total={episodios.length}>
        <ul className="grid grid-cols-1 gap-3">
          {episodios.slice(0, EPISODIOS_NO_MAXIMO).map((e) => (
            <li key={e.id}>
              <Link href={hrefEpisodio(e)} className={`block p-3 ${card}`}>
                <span className="block font-medium leading-snug">{e.titulo}</span>
                <span className="block text-xs text-muted mt-0.5">{detalheEpisodio(e)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Grupo>
    </div>
  );
}
