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

// "Pod" (podcast) + "libris" (livros, em latim — o de "ex libris"). Funciona
// igual em português e em inglês, pensando em podcasts de fora no futuro.
// As duas metades vão separadas pro logotipo, com "libris" no verde.
export const SITE_NAME = "Podlibris";
export const SITE_NAME_POD = "Pod";
export const SITE_NAME_LIBRIS = "libris";

export const SITE_DESCRIPTION =
  "Os livros citados nos podcasts que você ouve — com o trecho do episódio e o minuto exato de cada citação.";

/** Título de página: "Alguma coisa — Podlibris", sem repetir na home. */
export function pageTitle(titulo?: string) {
  return titulo ? `${titulo} — ${SITE_NAME}` : SITE_NAME;
}
