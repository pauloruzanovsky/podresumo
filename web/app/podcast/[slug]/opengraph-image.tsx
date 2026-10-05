import { supabase } from "@/lib/supabase";
import { acharPorSlug } from "@/lib/slug";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Livros citados no podcast";
export const revalidate = 3600;

/** "A estante de Os Sócios Podcast — 82 livros citados em 36 episódios". É o
 *  cartão que o próprio podcast tem motivo pra repostar. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: podcasts } = await supabase.from("podcasts").select("id, nome");
  const podcast = acharPorSlug(podcasts ?? [], slug);
  if (!podcast) return cartaoOg({ titulo: "Podcast não encontrado" });

  const [{ data: rels }, { count: episodios }] = await Promise.all([
    supabase
      .from("episode_livros")
      .select("livro_id, episodes!inner(podcast_id), livros!inner(tipo)")
      .eq("episodes.podcast_id", podcast.id)
      .eq("livros.tipo", "livro"),
    supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("status", "done")
      .eq("podcast_id", podcast.id),
  ]);

  const livros = new Set((rels ?? []).map((r: any) => r.livro_id)).size;

  return cartaoOg({
    rotulo: "A estante de",
    titulo: podcast.nome,
    subtitulo: `${livros} livros citados em ${episodios ?? 0} episódios — com o minuto de cada menção.`,
  });
}
