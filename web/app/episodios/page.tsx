import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import EpisodeList from "@/components/EpisodeList";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Episódios",
  description: "Todos os episódios processados, com resumo e livros citados.",
  alternates: { canonical: "/episodios" },
};

export default async function EpisodiosPage() {
  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("id, titulo, data, duracao, thumbnail, resumo, main_insight, main_action, tags, convidados, ep_number, podcasts(nome), episode_livros(livro_id, livros(titulo, autor))")
    .eq("status", "done")
    .order("data", { ascending: false });

  if (error) {
    return <p className="text-red-600">Erro ao carregar episódios: {error.message}</p>;
  }

  const episodesWithBooks = ((episodes ?? []) as any[]).map((ep: any) => ({
    ...ep,
    podcast: ep.podcasts?.nome ?? "",
    livros: (ep.episode_livros ?? []).map((rel: any) => ({
      id: rel.livro_id,
      titulo: rel.livros?.titulo,
      autor: rel.livros?.autor,
    })),
  }));

  const totalBooks = new Set(
    episodesWithBooks.flatMap((ep) => ep.livros.map((l: { titulo: string }) => l.titulo))
  ).size;

  const totalPodcasts = new Set(
    episodesWithBooks.map((ep) => ep.podcast).filter(Boolean)
  ).size;

  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />
          <span className="text-xs font-medium text-muted">
            {episodesWithBooks.length} episódios disponíveis
          </span>
        </div>
        <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight mb-4 leading-tight">
          Episódios
        </h1>
        <p className="text-muted text-center items-center">
          Insights, ações práticas e livros citados — extraídos por IA a partir
          da transcrição completa de cada episódio.
        </p>

        {/* Stats */}
        <div className="flex justify-center gap-8 mt-8">
          <div>
            <div className="text-2xl font-bold text-foreground">{episodesWithBooks.length}</div>
            <div className="text-xs text-muted mt-0.5">episódios</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="text-2xl font-bold text-foreground">{totalBooks}</div>
            <div className="text-xs text-muted mt-0.5">livros citados</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="text-2xl font-bold text-foreground">{totalPodcasts}</div>
            <div className="text-xs text-muted mt-0.5">podcast</div>
          </div>
        </div>
      </div>

      <EpisodeList episodes={episodesWithBooks} />
    </div>
  );
}
