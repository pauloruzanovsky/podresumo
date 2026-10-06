import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { podcastVisivel } from "@/lib/podcasts";
import BibliotecaList from "@/components/BibliotecaList";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Biblioteca",
  description:
    "Todos os livros citados nos podcasts, com o trecho do episódio e o minuto de cada recomendação.",
  alternates: { canonical: "/biblioteca" },
};

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const { data: livros, error } = await supabase
    .from("livros")
    .select(
      "id, titulo, autor, temas, capa_url, episode_livros(episode_id, contexto, episodes(data, podcasts(nome)))"
    )
    .eq("tipo", "livro") // filme/documentário/série citados ficam de fora
    .order("titulo");

  if (error) {
    return <p className="text-red-600">Erro ao carregar livros: {error.message}</p>;
  }

  const livrosProcessados = (livros ?? [])
    .map((livro: any) => {
      // citação de podcast oculto não conta (lib/podcasts)
      const episodeLivros = (livro.episode_livros ?? []).filter((rel: any) =>
        podcastVisivel(rel.episodes?.podcasts?.nome)
      );
      const podcastNames = [
        ...new Set(
          episodeLivros
            .map((rel: any) => rel.episodes?.podcasts?.nome)
            .filter(Boolean) as string[]
        ),
      ];
      const datas = episodeLivros
        .map((rel: any) => rel.episodes?.data)
        .filter((d: unknown): d is string => typeof d === "string");
      const ultimaData =
        datas.length > 0
          ? datas.reduce((a: string, b: string) => (a > b ? a : b))
          : null;
      // O contexto é o diferencial do acervo — mostra POR QUE o livro foi
      // citado. Pega o da citação mais recente que tenha texto.
      const contexto =
        [...episodeLivros]
          .sort((a: any, b: any) =>
            (b.episodes?.data ?? "") > (a.episodes?.data ?? "") ? 1 : -1
          )
          .map((rel: any) => rel.contexto)
          .find((c: unknown): c is string => typeof c === "string" && c.length > 0) ??
        null;

      return {
        id: livro.id,
        titulo: livro.titulo,
        autor: livro.autor,
        episodios_count: episodeLivros.length,
        podcasts: podcastNames,
        ultima_data: ultimaData,
        temas: (livro.temas ?? []) as string[],
        contexto,
        capa_url: livro.capa_url ?? null,
      };
    })
    .filter((livro) => livro.episodios_count > 0)
    .sort((a, b) => b.episodios_count - a.episodios_count);

  const { data: feitos } = await supabase
    .from("episodes")
    .select("podcasts(nome)")
    .eq("status", "done");
  const totalEpisodes = ((feitos ?? []) as any[]).filter((e) =>
    podcastVisivel(e.podcasts?.nome)
  ).length;

  return (
    <div>
      {/* Hero — compacto no celular de propósito. Na versão anterior o
          cabeçalho + stats + filtros ocupavam ~1.600px numa tela de 812px, e
          nenhum livro aparecia sem rolar. A estante é o produto; ela precisa
          estar na primeira tela. */}
      <div className="text-center mb-6 sm:mb-10">
        <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight mb-3 sm:mb-4 leading-tight">
          Biblioteca
        </h1>
        <p className="hidden sm:block text-muted text-base max-w-lg mx-auto leading-relaxed">
          Todos os livros mencionados nos episódios — ordenados por número de citações.
        </p>

        {/* No celular os números viram uma linha só, sem o bloco vertical. */}
        <p className="sm:hidden text-xs text-muted">
          <span className="font-semibold text-foreground">{livrosProcessados.length}</span> livros
          {" · "}
          <span className="font-semibold text-foreground">{totalEpisodes ?? 0}</span> episódios
        </p>

        <div className="hidden sm:flex justify-center gap-8 mt-8">
          <div>
            <div className="text-2xl font-bold text-foreground">{livrosProcessados.length}</div>
            <div className="text-xs text-muted mt-0.5">livros</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="text-2xl font-bold text-foreground">{totalEpisodes ?? 0}</div>
            <div className="text-xs text-muted mt-0.5">episódios</div>
          </div>
        </div>
      </div>

      <BibliotecaList livros={livrosProcessados} initialQuery={q ?? ""} />
    </div>
  );
}
