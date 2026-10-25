/**
 * Slug derivado do nome do podcast.
 *
 * Deriva em vez de guardar coluna no banco: são poucos podcasts, o nome não
 * muda, e isso evita uma migração e um campo que alguém teria que manter em
 * sincronia na mão.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acento
    .toLowerCase()
    .replace(/\bpodcast\b/g, "") // "Os Sócios Podcast" -> "os-socios"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Encontra o podcast cujo nome gera este slug. */
export function acharPorSlug<T extends { nome: string }>(
  podcasts: T[],
  slug: string
): T | undefined {
  return podcasts.find((p) => slugify(p.nome) === slug);
}
