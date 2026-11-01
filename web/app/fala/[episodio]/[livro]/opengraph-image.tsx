import { carregarFala } from "@/lib/falas";
import { capaOg, cartaoComCapas, cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { formatTimestamp } from "@/lib/tempo";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Fala sobre um livro citado em podcast";
export const revalidate = 3600;

/** A fala é o cartão inteiro: a citação grande, a capa do lado e o minuto. */
export default async function Image({
  params,
}: {
  params: Promise<{ episodio: string; livro: string }>;
}) {
  const { episodio, livro } = await params;
  const f = await carregarFala(episodio, livro);
  if (!f) return cartaoOg({ titulo: "Fala não encontrada" });

  const capa = f.livro.capaUrl ? await capaOg(f.livro.capaUrl) : null;
  return cartaoComCapas({
    rotulo: f.quem ?? f.episodio.podcast,
    texto: `“${f.citacao}”`,
    linha: `sobre ${f.livro.titulo}`,
    capas: capa ? [capa] : [],
    rodape: f.segundo != null ? `Ouça no minuto ${formatTimestamp(f.segundo)}` : f.episodio.podcast,
  });
}
