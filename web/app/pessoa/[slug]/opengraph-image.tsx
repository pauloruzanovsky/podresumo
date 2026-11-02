import { carregarPessoa } from "@/lib/pessoas";
import { capaOg, cartaoComCapas, cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Participações e livros citados de uma pessoa nos podcasts";
export const revalidate = 3600;

/** Apresentador: "Bruno Perini — 251 livros citados. O mais citado: Fundação,
 *  15 vezes". Convidado: as participações e quantos livros levou à conversa. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await carregarPessoa(slug);
  if (!p) return cartaoOg({ titulo: "Pessoa não encontrada" });

  const capas = (
    await Promise.all(p.livros.slice(0, 3).map((l) => (l.capaUrl ? capaOg(l.capaUrl) : null)))
  ).filter((c): c is string => Boolean(c));
  const livros = `${p.livros.length} ${p.livros.length === 1 ? "livro citado" : "livros citados"}`;
  const [primeiro] = p.livros;

  if (p.apresenta && primeiro)
    return cartaoComCapas({
      rotulo: p.nome,
      texto: `${livros}. O mais citado: ${primeiro.titulo}, ${primeiro.vezes === 1 ? "1 vez" : `${primeiro.vezes} vezes`}.`,
      linha: `em ${p.episodiosComCitacao} episódios de ${p.apresenta}`,
      capas,
      rodape: "Com a fala e o minuto de cada uma",
    });

  const n = p.participacoes.length;
  return cartaoComCapas({
    rotulo: n ? `${n} ${n === 1 ? "participação" : "participações"} · ${p.podcasts.join(" e ")}` : p.podcasts.join(" e "),
    texto: p.nome,
    linha: p.livros.length ? `${livros} na conversa` : p.descricao ?? undefined,
    capas,
    rodape: p.livros.length ? "Com a fala e o minuto de cada uma" : undefined,
  });
}
