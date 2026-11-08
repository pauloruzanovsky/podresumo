import { supabase, todas } from "@/lib/dados";
import { podcastVisivel } from "@/lib/podcasts";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Podlibris — os livros citados nos podcasts";
// cartão só muda com deploy novo (ver lib/dados.ts)
export const revalidate = false;

/** Cartão da home, e o padrão de toda página que não tem o seu. */
export default async function Image() {
  const [{ data: acervo }, { data: feitos }] = await Promise.all([
    todas((de, ate) =>
      supabase
        .from("livros")
        .select("id, episode_livros(episodes(podcasts(nome)))")
        .eq("tipo", "livro")
        .order("id")
        .range(de, ate)
    ),
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
    titulo: `${livros.toLocaleString("pt-BR")} livros citados em ${episodios.toLocaleString("pt-BR")} episódios.`,
    subtitulo: "Cada um com a fala de quem citou e o minuto exato.",
    // os números já estão no título
    rodape: "podlibris.com",
  });
}
