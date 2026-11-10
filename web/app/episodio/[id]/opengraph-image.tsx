import { notFound } from "next/navigation";
import { supabase } from "@/lib/dados";
import { tituloEpisodio } from "@/lib/falas";
import { capaOg, cartaoComCapas, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { resolverEpisodio } from "@/lib/resolver";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Livros citados no episódio";
// cartão só muda com deploy novo (ver lib/dados.ts)
export const revalidate = false;

// lista vazia: o cartão é desenhado na primeira visita e guardado (sem isto a
// Vercel o redesenhava a cada pedido, com max-age=0)
export async function generateStaticParams() {
  return [];
}

/** Cartão do episódio: quantos livros saíram da conversa e as capas deles.
 *  A thumbnail do YouTube dizia só o que o próprio vídeo já diz. */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ref = await resolverEpisodio(id);
  if (!ref) notFound();

  const { data: ep } = await supabase
    .from("episodes")
    .select("titulo, ep_number, podcasts(nome), episode_livros(livros(tipo, capa_url))")
    .eq("id", ref.id)
    .single();
  if (!ep) notFound();

  const livros = ((ep.episode_livros ?? []) as any[])
    .map((r) => r.livros)
    .filter((l) => l?.tipo === "livro");
  // busca a mais do que usa: capa que falha ou vem em formato ruim fica de fora
  const capas = (
    await Promise.all(
      livros
        .filter((l) => l.capa_url)
        .slice(0, 6)
        .map((l) => capaOg(l.capa_url))
    )
  )
    .filter((c): c is string => Boolean(c))
    .slice(0, 3);

  const podcast = (ep.podcasts as any)?.nome ?? "";
  return cartaoComCapas({
    rotulo: ep.ep_number ? `${podcast} #${ep.ep_number}` : podcast,
    texto: tituloEpisodio(ep.titulo, ep.ep_number),
    capas,
    rodape:
      livros.length === 0
        ? undefined
        : `${livros.length} ${livros.length === 1 ? "livro citado" : "livros citados"}, com o minuto de cada um`,
  });
}
