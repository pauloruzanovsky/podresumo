import { supabase } from "@/lib/supabase";
import { ehUuid } from "@/lib/links";

/**
 * Traduz o pedaço da URL (slug ou id antigo) pro registro. As páginas de
 * livro e episódio aceitam os dois: o slug é o endereço de hoje; o id é o de
 * links que já circularam antes dos slugs existirem, e redireciona.
 */
export async function resolverLivro(
  param: string
): Promise<{ id: string; slug: string | null } | null> {
  const porSlug = await supabase.from("livros").select("id, slug").eq("slug", param).maybeSingle();
  if (porSlug.data) return porSlug.data;
  if (!ehUuid(param)) return null;
  const porId = await supabase.from("livros").select("id, slug").eq("id", param).maybeSingle();
  return porId.data ?? null;
}

export async function resolverEpisodio(
  param: string
): Promise<{ id: string; slug: string | null } | null> {
  const porSlug = await supabase.from("episodes").select("id, slug").eq("slug", param).maybeSingle();
  if (porSlug.data) return porSlug.data;
  // id do episódio é o id do vídeo no YouTube (11 caracteres)
  const porId = await supabase.from("episodes").select("id, slug").eq("id", param).maybeSingle();
  return porId.data ?? null;
}
