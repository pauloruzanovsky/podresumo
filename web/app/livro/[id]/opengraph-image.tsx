import { supabase } from "@/lib/dados";
import { PODCASTS_EM_INGLES, podcastVisivel } from "@/lib/podcasts";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { resolverLivro } from "@/lib/resolver";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Livro citado em podcast";
export const revalidate = 3600;

/** Cartão do livro: título, autor e — quando a extração trouxe — a fala de
 *  quem indicou. Substitui a capa do Open Library como imagem do link: a capa
 *  sozinha é pequena e não diz por que o link importa. */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: param } = await params;
  const ref = await resolverLivro(param);
  if (!ref) return cartaoOg({ titulo: "Livro não encontrado" });
  const id = ref.id;
  const { data: livro } = await supabase
    .from("livros")
    .select(
      "titulo, autor, episode_livros(citacao_literal, quem_citou, natureza, episodes(data, podcasts(nome)))"
    )
    .eq("id", id)
    .single();

  if (!livro) return cartaoOg({ titulo: "Livro não encontrado" });

  const citacoes = ((livro.episode_livros ?? []) as any[]).filter((c) =>
    podcastVisivel(c.episodes?.podcasts?.nome)
  );
  const podcasts = [
    ...new Set(citacoes.map((c) => c.episodes?.podcasts?.nome).filter(Boolean)),
  ];

  // A fala que vai no cartão: em português antes de inglês (o link circula
  // no WhatsApp daqui), recomendação antes de menção, depois a mais recente.
  // Fala longa demais não cabe e fica de fora.
  const fala = citacoes
    .filter((c) => c.citacao_literal && c.citacao_literal.length <= 220)
    .sort(
      (a, b) =>
        Number(PODCASTS_EM_INGLES.includes(a.episodes?.podcasts?.nome)) -
          Number(PODCASTS_EM_INGLES.includes(b.episodes?.podcasts?.nome)) ||
        Number(b.natureza === "recomenda") - Number(a.natureza === "recomenda") ||
        (b.episodes?.data ?? "").localeCompare(a.episodes?.data ?? "")
    )[0];

  const vezes = citacoes.length === 1 ? "Citado 1 vez" : `Citado ${citacoes.length} vezes`;

  return cartaoOg({
    titulo: livro.titulo,
    subtitulo: livro.autor ?? undefined,
    citacao: fala
      ? { texto: fala.citacao_literal, quem: fala.quem_citou }
      : undefined,
    // três nomes de podcast não cabem ao lado do logo
    rodape:
      podcasts.length === 1 ? `${vezes} em ${podcasts[0]}`
      : podcasts.length > 1 ? `${vezes} em ${podcasts.length} podcasts`
      : vezes,
  });
}
