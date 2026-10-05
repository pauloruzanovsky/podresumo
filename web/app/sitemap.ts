import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";
import { slugify } from "@/lib/slug";

// Revalida junto com as páginas: o sitemap precisa acompanhar livro novo
// entrando no acervo a cada sync.
export const revalidate = 3600;

/**
 * O acervo é o ativo de busca: ~157 páginas de livro e ~66 de episódio, cada
 * uma sobre um assunto específico. Sem sitemap o Google depende de rastrear
 * link a link a partir da home, e páginas no fim da biblioteca podem nunca
 * ser visitadas.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/biblioteca`, changeFrequency: "daily", priority: 0.9 },
  ];

  const [livrosRes, episodiosRes, podcastsRes] = await Promise.all([
    supabase
      .from("livros")
      .select("id, episode_livros(episode_id)")
      .eq("tipo", "livro"),
    supabase
      .from("episodes")
      .select("id, processed_at")
      .eq("status", "done"),
    supabase.from("podcasts").select("nome"),
  ]);

  const podcasts: MetadataRoute.Sitemap = (podcastsRes.data ?? []).map((p: any) => ({
    url: `${SITE_URL}/podcast/${slugify(p.nome)}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  // Livro sem citação não aparece no site; listar no sitemap mandaria o
  // Google pra uma página que o próprio app esconde.
  const livros: MetadataRoute.Sitemap = (livrosRes.data ?? [])
    .filter((l: any) => (l.episode_livros ?? []).length > 0)
    .map((l: any) => ({
      url: `${SITE_URL}/livro/${l.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const episodios: MetadataRoute.Sitemap = (episodiosRes.data ?? []).map(
    (e: any) => ({
      url: `${SITE_URL}/episodio/${e.id}`,
      lastModified: e.processed_at ? new Date(e.processed_at) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })
  );

  return [...fixas, ...podcasts, ...livros, ...episodios];
}
