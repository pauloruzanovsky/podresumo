import { notFound } from "next/navigation";
import { carregarFala } from "@/lib/falas";
import { capaOg, cartaoComCapas, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { formatTimestamp } from "@/lib/tempo";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Fala sobre um livro citado em podcast";
// cartão só muda com deploy novo (ver lib/dados.ts)
export const revalidate = false;

// lista vazia: o cartão é desenhado na primeira visita e guardado (sem isto a
// Vercel o redesenhava a cada pedido, com max-age=0)
export async function generateStaticParams() {
  return [];
}

/** A fala é o cartão inteiro: a citação grande, a capa do lado e o minuto. */
export default async function Image({
  params,
}: {
  params: Promise<{ episodio: string; livro: string }>;
}) {
  const { episodio, livro } = await params;
  const f = await carregarFala(episodio, livro);
  if (!f) notFound();

  const capa = f.livro.capaUrl ? await capaOg(f.livro.capaUrl) : null;
  return cartaoComCapas({
    rotulo: f.quem ?? f.episodio.podcast,
    texto: `“${f.citacao}”`,
    linha: `sobre ${f.livro.titulo}`,
    capas: capa ? [capa] : [],
    rodape: f.segundo != null ? `Ouça no minuto ${formatTimestamp(f.segundo)}` : f.episodio.podcast,
  });
}
