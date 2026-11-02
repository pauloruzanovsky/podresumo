import { slugify } from "@/lib/slug";

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

/** Página de quem cita ou participa (lib/pessoas): o slug sai do nome. */
export function hrefPessoa(nome: string) {
  return `/pessoa/${slugify(nome)}`;
}

interface LivroAmazon {
  titulo: string;
  titulo_original?: string | null;
  autor?: string | null;
}

const AMAZON = {
  br: { site: "https://www.amazon.com.br", tag: process.env.NEXT_PUBLIC_AMAZON_TAG },
  us: { site: "https://www.amazon.com", tag: process.env.NEXT_PUBLIC_AMAZON_TAG_US },
};

const DEV = process.env.NODE_ENV === "development";

/**
 * Busca na Amazon: título + autor, restrita à categoria de livros
 * (`i=stripbooks`). Só o título trazia resultado errado em títulos genéricos
 * como "Cartas" ou "Rebecca".
 *
 * Link direto pelo ISBN (/dp/) foi testado em nov/2026 e descartado: edição
 * esgotada dá página não encontrada (Fundação deu), e a busca nunca quebra.
 */
export function linkAmazon(livro: LivroAmazon, loja: "br" | "us" = "br") {
  const { site, tag } = AMAZON[loja];
  // Com a identificação de afiliado (NEXT_PUBLIC_AMAZON_TAG, ex.: podlibris-20)
  // a compra vinda daqui gera comissão; sem ela, o link é a busca comum.
  const comTag = tag ? `&tag=${encodeURIComponent(tag)}` : "";
  // na loja dos EUA, o título em inglês ("Como Mudar Sua Mente" não acha nada lá)
  const titulo = loja === "us" ? livro.titulo_original || livro.titulo : livro.titulo;
  const { autor } = livro;
  const termo = autor ? `${titulo} ${autor}` : titulo;
  return `${site}/s?k=${encodeURIComponent(termo)}&i=stripbooks${comTag}`;
}

/**
 * A segunda loja só existe com tag própria dos EUA (cada país tem a sua conta)
 * e só pra livro citado em podcast em inglês: buscar título em português na
 * amazon.com não acha nada. Null = só a loja do Brasil.
 */
export function linkAmazonEua(livro: LivroAmazon, citadoEmIngles: boolean) {
  if (!AMAZON.us.tag && !DEV) return null;
  if (!citadoEmIngles) return null;
  return linkAmazon(livro, "us");
}

/** UUID do Postgres: identifica link antigo de livro (pelo id). */
export const ehUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
