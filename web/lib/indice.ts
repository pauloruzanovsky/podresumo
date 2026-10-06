import { supabase } from "@/lib/supabase";

/**
 * Índice de um podcast: todos os episódios, do mais novo pro mais antigo,
 * com a marca de quais já têm os livros mapeados.
 *
 * Inclui os `listed` e `pending` (catalogados, ainda sem extração), que o
 * resto do site ignora — é o que deixa a lista mostrar o acervo inteiro e não
 * só o que já foi processado.
 */
export interface ItemIndice {
  id: string;
  numero: string | null;
  titulo: string;
  /** Tem página no site. */
  mapeado: boolean;
  /** Livros citados (só conta quando mapeado). */
  livros: number;
}

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já vai ao lado. */
function semSufixo(titulo: string) {
  return titulo.replace(/\s*\|[^|]*$/, "");
}

export async function carregarIndice(podcastId: string): Promise<ItemIndice[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, ep_number, titulo, status, episode_livros(livros(tipo))")
    .eq("podcast_id", podcastId)
    .order("data", { ascending: false });

  return ((data ?? []) as any[]).map((e) => ({
    id: e.id,
    numero: e.ep_number ?? null,
    titulo: e.ep_number ? semSufixo(e.titulo) : e.titulo,
    mapeado: e.status === "done",
    livros: ((e.episode_livros ?? []) as any[]).filter(
      (r) => r.livros?.tipo === "livro"
    ).length,
  }));
}
