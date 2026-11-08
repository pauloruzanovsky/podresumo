import type { MetadataRoute } from "next";
import { supabase, todas } from "@/lib/dados";
import { podcastVisivel } from "@/lib/podcasts";
import { SITE_URL } from "@/lib/site";
import { hrefEpisodio, hrefLivro } from "@/lib/links";
import { slugify } from "@/lib/slug";
import { pessoasIndexaveis } from "@/lib/pessoas";

// Muda junto com as páginas: livro novo entra no sitemap no deploy seguinte.
export const revalidate = false;

/**
 * O acervo é o ativo de busca: ~157 páginas de livro e ~66 de episódio, cada
 * uma sobre um assunto específico. Sem sitemap o Google depende de rastrear
 * link a link a partir da home, e páginas no fim da biblioteca podem nunca
 * ser visitadas.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
  ];

  const [livrosRes, episodiosRes, podcastsRes] = await Promise.all([
    todas((de, ate) =>
      supabase
        .from("livros")
        .select("id, slug, episode_livros(episodes(podcasts(nome)))")
        .eq("tipo", "livro")
        .order("id")
        .range(de, ate)
    ),
    todas((de, ate) =>
      supabase
        .from("episodes")
        .select("id, slug, processed_at, podcasts(nome)")
        .eq("status", "done")
        .order("id")
        .range(de, ate)
    ),
    supabase.from("podcasts").select("nome"),
  ]);

  const podcasts: MetadataRoute.Sitemap = (podcastsRes.data ?? [])
    .filter((p: any) => podcastVisivel(p.nome))
    .map((p: any) => ({
    url: `${SITE_URL}/podcast/${slugify(p.nome)}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  // Livro sem citação não aparece no site; listar no sitemap mandaria o
  // Google pra uma página que o próprio app esconde.
  const livros: MetadataRoute.Sitemap = (livrosRes.data ?? [])
    .filter((l: any) =>
      (l.episode_livros ?? []).some((r: any) =>
        podcastVisivel(r.episodes?.podcasts?.nome)
      )
    )
    .map((l: any) => ({
      url: `${SITE_URL}${hrefLivro(l)}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const episodios: MetadataRoute.Sitemap = (episodiosRes.data ?? [])
    .filter((e: any) => podcastVisivel(e.podcasts?.nome))
    .map((e: any) => ({
      url: `${SITE_URL}${hrefEpisodio(e)}`,
      lastModified: e.processed_at ? new Date(e.processed_at) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  // só quem tem página com conteúdo (lib/pessoas: participações + citações)
  const pessoas: MetadataRoute.Sitemap = (await pessoasIndexaveis().catch(() => [])).map((slug) => ({
    url: `${SITE_URL}/pessoa/${slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...fixas, ...podcasts, ...livros, ...pessoas, ...episodios];
}
