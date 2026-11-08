import type { Metadata } from "next";
import { supabase } from "@/lib/dados";
import { podcastVisivel } from "@/lib/podcasts";
import EpisodeList from "@/components/EpisodeList";

// Sem prazo: o site lê o retrato do banco tirado no build (lib/dados.ts), então
// os dados só mudam com deploy novo, que já zera o cache. Remontar a cada dia
// só gastava CPU e ISR writes com robôs (cota da Vercel estourada em nov/2026).
export const revalidate = false;

export const metadata: Metadata = {
  title: "Episódios",
  description: "Todos os episódios processados, com resumo e livros citados.",
  alternates: { canonical: "/episodios" },
};

// O cartão mostra 2 linhas de resumo e de insight; o texto inteiro dos ~870
// episódios passava de 2 MB no HTML. A busca da lista procura neste trecho.
const TRECHO = 280;
function trecho(texto: string | null) {
  if (!texto || texto.length <= TRECHO) return texto ?? "";
  return texto.slice(0, TRECHO).replace(/\s+\S*$/, "") + "…";
}

export default async function EpisodiosPage() {
  // Duas consultas em paralelo em vez de uma com os livros aninhados: o
  // limite de 3 s do Supabase vale por consulta, e a junta passava dele
  // quando o banco estava sem cota de disco (07/11/2026).
  const [episodiosRes, livrosRes] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, slug, titulo, data, duracao, thumbnail, resumo, main_insight, tags, convidados, ep_number, podcasts(nome)")
      .eq("status", "done")
      .order("data", { ascending: false }),
    supabase
      .from("episodes")
      .select("id, episode_livros(livro_id, livros(slug, titulo))")
      .eq("status", "done"),
  ]);

  const error = episodiosRes.error ?? livrosRes.error;
  if (error) {
    // lança pra não gravar a mensagem no cache (ver app/page.tsx)
    throw new Error(`Erro ao carregar episódios: ${error.message}`);
  }

  const livrosPorEpisodio = new Map<string, any[]>(
    ((livrosRes.data ?? []) as any[]).map((ep) => [ep.id, ep.episode_livros ?? []])
  );

  const episodesWithBooks = ((episodiosRes.data ?? []) as any[])
    .filter((ep: any) => podcastVisivel(ep.podcasts?.nome))
    .map((ep: any) => ({
      id: ep.id,
      slug: ep.slug,
      titulo: ep.titulo,
      data: ep.data,
      duracao: ep.duracao,
      thumbnail: ep.thumbnail,
      resumo: trecho(ep.resumo),
      main_insight: trecho(ep.main_insight),
      tags: ep.tags,
      convidados: ep.convidados,
      ep_number: ep.ep_number,
      podcast: ep.podcasts?.nome ?? "",
      livros: (livrosPorEpisodio.get(ep.id) ?? []).map((rel: any) => ({
        id: rel.livro_id,
        slug: rel.livros?.slug ?? null,
        titulo: rel.livros?.titulo,
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
