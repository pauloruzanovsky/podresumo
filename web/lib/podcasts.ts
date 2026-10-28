import { supabase } from "@/lib/supabase";

/**
 * Podcasts que estão no banco mas não aparecem no site.
 *
 * Esconder em vez de apagar: os episódios e as citações continuam lá, e
 * religar é tirar o nome desta lista — sem baixar nem extrair nada de novo.
 * O Modern Wisdom ficou oculto até ser reextraído com o prompt atual (fala,
 * minuto e quem citou), em out/2026.
 */
export const PODCASTS_OCULTOS: string[] = [];

/**
 * Pra onde vão os links genéricos de "livros" (menu, busca da home, volta da
 * página do livro). Com um podcast só no site, a estante dele É o acervo — a
 * antiga /biblioteca era a mesma lista sem o contexto do programa. Quando
 * voltar a haver mais de um podcast, a biblioteca (no histórico do git, até o
 * commit 905162b) volta como catálogo que cruza todos.
 */
export const ESTANTE_PRINCIPAL = "/podcast/os-socios";
export const TODOS_OS_LIVROS = `${ESTANTE_PRINCIPAL}#todos-os-livros`;

/**
 * Quem apresenta o programa. Livro escrito por um deles sai das prateleiras
 * de destaque e ganha a "menção honrosa": o Bruno cita o próprio livro em
 * dezenas de episódios, quase sempre divulgando — no ranking geral ele
 * passava na frente de tudo sem ser indicação de leitura.
 */
export const APRESENTADORES = ["Bruno Perini", "Malu Perini", "Chris Williamson"];

export function livroDaCasa(autor?: string | null): boolean {
  return Boolean(autor) && APRESENTADORES.includes(autor as string);
}

export function podcastVisivel(nome?: string | null): boolean {
  return Boolean(nome) && !PODCASTS_OCULTOS.includes(nome as string);
}

export interface Podcast {
  id: string;
  nome: string;
  youtube_channel_id: string | null;
}

export async function podcastsVisiveis(): Promise<Podcast[]> {
  const { data } = await supabase
    .from("podcasts")
    .select("id, nome, youtube_channel_id");
  return ((data ?? []) as Podcast[]).filter((p) => podcastVisivel(p.nome));
}
