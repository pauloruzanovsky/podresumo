import { supabase, todas } from "@/lib/dados";

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
  /** Data de lançamento (AAAA-MM-DD). */
  data: string | null;
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
      .select("id, slug, ep_number, data, titulo, episode_livros(livros(tipo))")
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
    data: e.data ?? null,
    titulo: e.ep_number ? semSufixo(e.titulo) : e.titulo,
    livros: ((e.episode_livros ?? []) as any[]).filter(
      (r) => r.livros?.tipo === "livro"
    ).length,
  }));
}

/**
 * Pedaço do índice em volta do episódio aberto: `raio` de cada lado (21 no
 * total), encostando no começo ou no fim quando ele está na ponta.
 *
 * A página de episódio levava o índice inteiro (~900 itens no Modern Wisdom),
 * no HTML e de novo no payload do React: mais da metade da página. A Vercel
 * cobra o ISR write por 8 KB gravados, e os robôs regravam as ~2.100 páginas
 * de episódio a cada deploy (cota estourada em nov/2026). A lista inteira fica
 * na estante do podcast.
 */
export function vizinhos(itens: ItemIndice[], atualId: string, raio = 10): ItemIndice[] {
  const tamanho = 2 * raio + 1;
  const pos = itens.findIndex((i) => i.id === atualId);
  const inicio = Math.max(0, Math.min(pos - raio, itens.length - tamanho));
  return itens.slice(inicio, inicio + tamanho);
}
