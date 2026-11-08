import { supabase } from "@/lib/dados";
import { podcastVisivel } from "@/lib/podcasts";
import { resolverEpisodio, resolverLivro } from "@/lib/resolver";

/**
 * Uma fala é a citação de um livro num episódio (`episode_livros`), e a chave
 * dela é esse par: por isso o endereço é /fala/<episódio>/<livro>, sem coluna
 * nova no banco. Só existe página pra fala literal; citação que só tem o
 * contexto (paráfrase) não é "o que fulano disse".
 */
export interface Fala {
  citacao: string;
  contexto: string | null;
  quem: string | null;
  segundo: number | null;
  episodio: {
    id: string;
    slug: string | null;
    numero: string | null;
    titulo: string;
    linkYoutube: string | null;
    podcast: string;
  };
  livro: {
    id: string;
    slug: string | null;
    titulo: string;
    titulo_original: string | null;
    autor: string | null;
    capaUrl: string | null;
  };
}

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece no selo. */
export function tituloEpisodio(titulo: string, numero: string | null) {
  return numero ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

export async function carregarFala(paramEpisodio: string, paramLivro: string): Promise<Fala | null> {
  const [refEpisodio, refLivro] = await Promise.all([
    resolverEpisodio(paramEpisodio),
    resolverLivro(paramLivro),
  ]);
  if (!refEpisodio || !refLivro) return null;

  const { data } = await supabase
    .from("episode_livros")
    .select(
      "citacao_literal, contexto, quem_citou, timestamp_seg, episodes(titulo, ep_number, link_youtube, podcasts(nome)), livros(titulo, titulo_original, autor, capa_url)"
    )
    .eq("episode_id", refEpisodio.id)
    .eq("livro_id", refLivro.id)
    .maybeSingle();

  const r = data as any;
  if (!r?.citacao_literal || !r.episodes || !r.livros) return null;
  if (!podcastVisivel(r.episodes.podcasts?.nome)) return null;

  return {
    citacao: r.citacao_literal.trim().replace(/^["“]|["”]$/g, ""),
    contexto: r.contexto ?? null,
    quem: r.quem_citou ?? null,
    segundo: r.timestamp_seg ?? null,
    episodio: {
      id: refEpisodio.id,
      slug: refEpisodio.slug,
      numero: r.episodes.ep_number ?? null,
      titulo: tituloEpisodio(r.episodes.titulo, r.episodes.ep_number ?? null),
      linkYoutube: r.episodes.link_youtube ?? null,
      podcast: r.episodes.podcasts?.nome ?? "",
    },
    livro: {
      id: refLivro.id,
      slug: refLivro.slug,
      titulo: r.livros.titulo,
      titulo_original: r.livros.titulo_original ?? null,
      autor: r.livros.autor ?? null,
      capaUrl: r.livros.capa_url ?? null,
    },
  };
}
