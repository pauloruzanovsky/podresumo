import { supabase } from "@/lib/dados";
import { ehUuid } from "@/lib/links";

/**
 * Erro do banco (timeout, cota de disco) vira exceção, não "não achei": um
 * notFound() aqui entraria no cache como 404 por um dia. Exceção não entra,
 * e a Vercel segue servindo a última versão boa.
 */
function falhou(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
}

/**
 * Traduz o pedaço da URL (slug ou id antigo) pro registro. As páginas de
 * livro e episódio aceitam os dois: o slug é o endereço de hoje; o id é o de
 * links que já circularam antes dos slugs existirem, e redireciona.
 */
export async function resolverLivro(
  param: string
): Promise<{ id: string; slug: string | null } | null> {
  const porSlug = await supabase.from("livros").select("id, slug").eq("slug", param).maybeSingle();
  falhou(porSlug);
  if (porSlug.data) return porSlug.data;
  if (!ehUuid(param)) return null;
  const porId = await supabase.from("livros").select("id, slug").eq("id", param).maybeSingle();
  falhou(porId);
  return porId.data ?? null;
}

export async function resolverEpisodio(
  param: string
): Promise<{ id: string; slug: string | null } | null> {
  const porSlug = await supabase.from("episodes").select("id, slug").eq("slug", param).maybeSingle();
  falhou(porSlug);
  if (porSlug.data) return porSlug.data;
  // id do episódio é o id do vídeo no YouTube (11 caracteres)
  const porId = await supabase.from("episodes").select("id, slug").eq("id", param).maybeSingle();
  falhou(porId);
  return porId.data ?? null;
}
