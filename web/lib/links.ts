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

/** UUID do Postgres: identifica link antigo de livro (pelo id). */
export const ehUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
