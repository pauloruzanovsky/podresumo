import { supabase } from "@/lib/supabase";
import BibliotecaList from "@/components/BibliotecaList";

export const revalidate = 60;

export default async function BibliotecaPage() {
  const { data: livros, error } = await supabase
    .from("livros")
    .select("id, titulo, autor, episode_livros(episode_id, episodes(podcasts(nome)))")
    .order("titulo");

  if (error) {
    return <p className="text-red-400">Erro ao carregar livros: {error.message}</p>;
  }

  const livrosProcessados = (livros ?? [])
    .map((livro: any) => {
      const episodeLivros = livro.episode_livros ?? [];
      // Unique podcast names for this book
      const podcastNames = [
        ...new Set(
          episodeLivros
            .map((rel: any) => rel.episodes?.podcasts?.nome)
            .filter(Boolean) as string[]
        ),
      ];
      return {
        id: livro.id,
        titulo: livro.titulo,
        autor: livro.autor,
        episodios_count: episodeLivros.length,
        podcasts: podcastNames,
      };
    })
    .filter((livro) => livro.episodios_count > 0)
    .sort((a, b) => b.episodios_count - a.episodios_count);

  const { count: totalEpisodes } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .eq("status", "done");

  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-14">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
          Biblioteca
          <br />
          <span className="text-accent">de livros citados.</span>
        </h1>
        <p className="text-muted text-base max-w-lg mx-auto leading-relaxed">
          Todos os livros mencionados nos episódios — ordenados por número de citações.
        </p>

        <div className="flex justify-center gap-8 mt-8">
          <div>
            <div className="text-2xl font-bold text-accent-light">{livrosProcessados.length}</div>
            <div className="text-xs text-muted mt-0.5">livros</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="text-2xl font-bold text-accent-light">{totalEpisodes ?? 0}</div>
            <div className="text-xs text-muted mt-0.5">episódios</div>
          </div>
        </div>
      </div>

      <BibliotecaList livros={livrosProcessados} />
    </div>
  );
}
