import { supabase } from "@/lib/supabase";
import { cartaoOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "PodResumo — os livros citados nos podcasts";
export const revalidate = 3600;

/** Cartão da home, e o padrão de toda página que não tem o seu. */
export default async function Image() {
  const [{ count: livros }, { count: episodios }] = await Promise.all([
    supabase
      .from("livros")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "livro"),
    supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("status", "done"),
  ]);

  return cartaoOg({
    titulo: "O que ler em seguida, recomendado por quem você ouve.",
    subtitulo: "Os livros citados nos podcasts, com o minuto exato de cada menção.",
    rodape: `${livros ?? 0} livros · ${episodios ?? 0} episódios`,
  });
}
