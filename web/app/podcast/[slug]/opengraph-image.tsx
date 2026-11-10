import { notFound } from "next/navigation";
import { supabase, todas } from "@/lib/dados";
import { podcastVisivel } from "@/lib/podcasts";
import { acharPorSlug } from "@/lib/slug";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Livros citados no podcast";
// cartão só muda com deploy novo (ver lib/dados.ts)
export const revalidate = false;

// lista vazia: o cartão é desenhado na primeira visita e guardado (sem isto a
// Vercel o redesenhava a cada pedido, com max-age=0)
export async function generateStaticParams() {
  return [];
}

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
  if (!podcast || !podcastVisivel(podcast.nome)) notFound();

  const [{ data: rels }, { count: episodios }] = await Promise.all([
    todas((de, ate) =>
      supabase
        .from("episode_livros")
        .select("livro_id, episodes!inner(podcast_id), livros!inner(tipo)")
        .eq("episodes.podcast_id", podcast.id)
        .eq("livros.tipo", "livro")
        .order("episode_id")
        .order("livro_id")
        .range(de, ate)
    ),
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
