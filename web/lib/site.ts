/**
 * Identidade do site, num lugar só — usada por metadata, Open Graph, sitemap
 * e robots.
 *
 * `NEXT_PUBLIC_SITE_URL` precisa estar definida em produção: sem ela o Next
 * monta URLs absolutas de Open Graph apontando pra localhost, e aí o card do
 * WhatsApp quebra sem dar erro em lugar nenhum.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const SITE_NAME = "PodResumo";

export const SITE_DESCRIPTION =
  "Os livros citados nos podcasts que você ouve — com o trecho do episódio e o minuto exato de cada recomendação.";

/** Título de página: "Alguma coisa — PodResumo", sem repetir na home. */
export function pageTitle(titulo?: string) {
  return titulo ? `${titulo} — ${SITE_NAME}` : SITE_NAME;
}
