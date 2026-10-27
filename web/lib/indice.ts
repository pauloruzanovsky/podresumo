import { supabase, todas } from "@/lib/supabase";

/**
 * Índice de um podcast: os episódios que têm página no site, do mais novo
 * pro mais antigo.
 *
 * Os que ficaram de fora (sem legenda no YouTube) não aparecem: com o acervo
 * praticamente todo mapeado, "em breve" seria promessa que não se cumpre.
 */
export interface ItemIndice {
  id: string;
  slug: string | null;
  numero: string | null;
  titulo: string;
  /** Livros citados. */
  livros: number;
}

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já vai ao lado. */
function semSufixo(titulo: string) {
  return titulo.replace(/\s*\|[^|]*$/, "");
}

export async function carregarIndice(podcastId: string): Promise<ItemIndice[]> {
  const { data } = await todas((de, ate) =>
    supabase
      .from("episodes")
      .select("id, slug, ep_number, titulo, episode_livros(livros(tipo))")
      .eq("podcast_id", podcastId)
      .eq("status", "done")
      .order("data", { ascending: false })
      .order("id")
      .range(de, ate)
  );

  return (data as any[]).map((e) => ({
    id: e.id,
    slug: e.slug ?? null,
    numero: e.ep_number ?? null,
    titulo: e.ep_number ? semSufixo(e.titulo) : e.titulo,
    livros: ((e.episode_livros ?? []) as any[]).filter(
      (r) => r.livros?.tipo === "livro"
    ).length,
  }));
}
