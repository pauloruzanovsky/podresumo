import { supabase } from "@/lib/supabase";

/**
 * Podcasts que estão no banco mas não aparecem no site.
 *
 * Esconder em vez de apagar: os episódios e as citações continuam lá, e
 * religar é tirar o nome desta lista — sem baixar nem extrair nada de novo.
 * O Modern Wisdom saiu enquanto o foco é o Os Sócios; os 30 episódios dele
 * ainda estão com a extração antiga.
 */
export const PODCASTS_OCULTOS = ["Modern Wisdom"];

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
