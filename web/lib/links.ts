/**
 * Endereços de livro e episódio. Usam o slug legível (/livro/em-nome-do-povo)
 * quando existe e caem no id quando ainda não foi gerado — o slug é
 * preenchido pelo pipeline (flows/preencher_slugs) depois de cada gravação.
 *
 * As páginas aceitam os dois e redirecionam o id pro slug, então link antigo
 * nunca quebra.
 */
export function hrefLivro(l: { id: string; slug?: string | null }) {
  return `/livro/${l.slug || l.id}`;
}

export function hrefEpisodio(e: { id: string; slug?: string | null }) {
  return `/episodio/${e.slug || e.id}`;
}

/** A fala de um livro num episódio: o link que se compartilha (lib/falas). */
export function hrefFala(
  e: { id: string; slug?: string | null },
  l: { id: string; slug?: string | null }
) {
  return `/fala/${e.slug || e.id}/${l.slug || l.id}`;
}

/**
 * Sem ISBN/ASIN no acervo não dá pra linkar a página do produto, mas dá pra
 * fazer a busca cair certo: título + autor, restrita à categoria de livros
 * (`i=stripbooks`). Só o título trazia resultado errado em títulos genéricos
 * como "Cartas" ou "Rebecca".
 */
export function linkAmazon(titulo: string, autor?: string | null) {
  const termo = autor ? `${titulo} ${autor}` : titulo;
  // Com a identificação de afiliado (NEXT_PUBLIC_AMAZON_TAG, ex.: podlibris-20)
  // a compra vinda daqui gera comissão; sem ela, o link é a busca comum.
  const tag = process.env.NEXT_PUBLIC_AMAZON_TAG;
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(termo)}&i=stripbooks${
    tag ? `&tag=${encodeURIComponent(tag)}` : ""
  }`;
}

/** UUID do Postgres: identifica link antigo de livro (pelo id). */
export const ehUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
