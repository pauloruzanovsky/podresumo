import { supabase } from "@/lib/supabase";
import { podcastVisivel } from "@/lib/podcasts";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "PodResumo — os livros citados nos podcasts";
export const revalidate = 3600;

/** Cartão da home, e o padrão de toda página que não tem o seu. */
export default async function Image() {
  const [{ data: acervo }, { data: feitos }] = await Promise.all([
    supabase
      .from("livros")
      .select("id, episode_livros(episodes(podcasts(nome)))")
      .eq("tipo", "livro"),
    supabase.from("episodes").select("podcasts(nome)").eq("status", "done"),
  ]);

  // mesmas contagens da home: só o que vem de podcast visível
  const livros = ((acervo ?? []) as any[]).filter((l) =>
    (l.episode_livros ?? []).some((r: any) =>
      podcastVisivel(r.episodes?.podcasts?.nome)
    )
  ).length;
  const episodios = ((feitos ?? []) as any[]).filter((e) =>
    podcastVisivel(e.podcasts?.nome)
  ).length;

  return cartaoOg({
    titulo: "O que ler em seguida, recomendado por quem você ouve.",
    subtitulo: "Os livros citados nos podcasts, com o minuto exato de cada menção.",
    rodape: `${livros} livros · ${episodios} episódios`,
  });
}
