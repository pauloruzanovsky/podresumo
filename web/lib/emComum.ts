import { unstable_cache } from "next/cache";
import { supabase, todas } from "@/lib/dados";
import { livroDaCasa, podcastVisivel } from "@/lib/podcasts";
import { tituloEpisodio } from "@/lib/falas";

/**
 * Os livros que aparecem em mais de um podcast: o mesmo livro indicado pelo
 * Bruno, pelo Chris Williamson, pelo Tim Ferriss e pelo Huberman, cada um com
 * a própria fala e o minuto.
 *
 * Citação de livro "da casa" no próprio programa não conta (Protocols no
 * Huberman Lab, os livros do Tim no Ferriss): é divulgação, e sem esse filtro
 * eles encabeçavam a lista só pela autocitação.
 */

export const CAMINHO_EM_COMUM = "/livros-em-comum";

export interface FalaNoPodcast {
  podcast: string;
  capaPodcast: string | null;
  quem: string | null;
  citacao: string | null;
  /** paráfrase, quando não há fala literal */
  contexto: string | null;
  segundo: number | null;
  episodio: { id: string; slug: string | null; numero: string | null; titulo: string; linkYoutube: string | null };
  /** episódios deste podcast que citam o livro */
  episodios: number;
}

export interface LivroEmComum {
  id: string;
  slug: string | null;
  titulo: string;
  titulo_original: string | null;
  autor: string | null;
  capaUrl: string | null;
  /** episódios somando todos os podcasts */
  episodios: number;
  /** episódios em que foi indicação de leitura, não só menção */
  recomendacoes: number;
  /** uma fala por podcast, na ordem de ORDEM_PODCASTS */
  falas: FalaNoPodcast[];
}

// português primeiro: é a primeira coisa lida
const ORDEM_PODCASTS = ["Os Sócios Podcast", "Modern Wisdom", "The Tim Ferriss Show", "Huberman Lab"];
const ordem = (nome: string) => {
  const i = ORDEM_PODCASTS.indexOf(nome);
  return i < 0 ? ORDEM_PODCASTS.length : i;
};

const limpa = (s: string | null) => (s ? s.trim().replace(/^["“]|["”]$/g, "") : null);

/** A melhor fala de um livro num podcast: recomendação com fala e minuto, depois só fala, depois o resto. */
function nota(r: any) {
  return (
    (r.natureza === "recomenda" ? 4 : 0) +
    (r.citacao_literal ? 2 : 0) +
    (r.timestamp_seg != null ? 1 : 0)
  );
}

export const carregarEmComum = unstable_cache(
  async (): Promise<{ livros: LivroEmComum[]; podcasts: number }> => {
    const { data, error } = await todas((de, ate) =>
      supabase
        .from("episode_livros")
        .select(
          "livro_id, episode_id, quem_citou, citacao_literal, contexto, timestamp_seg, natureza, " +
            "livros!inner(id, slug, titulo, titulo_original, autor, capa_url, tipo), " +
            "episodes!inner(slug, titulo, ep_number, data, link_youtube, podcasts(nome, thumbnail))"
        )
        .eq("livros.tipo", "livro")
        .order("episode_id")
        .order("livro_id")
        .range(de, ate)
    );
    if (error) throw new Error(error.message);

    const porLivro = new Map<string, { livro: any; porPodcast: Map<string, any[]> }>();
    const podcastsVistos = new Set<string>();
    for (const r of data as any[]) {
      const nome: string | undefined = r.episodes?.podcasts?.nome;
      if (!nome || !podcastVisivel(nome)) continue;
      podcastsVistos.add(nome);
      if (livroDaCasa(r.livros.autor, nome)) continue;
      const item = porLivro.get(r.livro_id) ?? { livro: r.livros, porPodcast: new Map() };
      porLivro.set(r.livro_id, item);
      const lista = item.porPodcast.get(nome) ?? [];
      lista.push(r);
      item.porPodcast.set(nome, lista);
    }

    const livros: LivroEmComum[] = [];
    for (const { livro, porPodcast } of porLivro.values()) {
      if (porPodcast.size < 2) continue;
      const falas: FalaNoPodcast[] = [...porPodcast.entries()]
        .sort(([a], [b]) => ordem(a) - ordem(b))
        .map(([podcast, citacoes]) => {
          const r = [...citacoes].sort(
            (a, b) => nota(b) - nota(a) || (b.episodes.data ?? "").localeCompare(a.episodes.data ?? "")
          )[0];
          const e = r.episodes;
          return {
            podcast,
            capaPodcast: e.podcasts?.thumbnail ?? null,
            quem: r.quem_citou ?? null,
            citacao: limpa(r.citacao_literal),
            contexto: r.citacao_literal ? null : (r.contexto ?? null),
            segundo: r.timestamp_seg ?? null,
            episodio: {
              id: r.episode_id,
              slug: e.slug ?? null,
              numero: e.ep_number ?? null,
              titulo: tituloEpisodio(e.titulo, e.ep_number ?? null),
              linkYoutube: e.link_youtube ?? null,
            },
            episodios: new Set(citacoes.map((c: any) => c.episode_id)).size,
          };
        });
      livros.push({
        id: livro.id,
        slug: livro.slug ?? null,
        titulo: livro.titulo,
        titulo_original: livro.titulo_original ?? null,
        autor: livro.autor ?? null,
        capaUrl: livro.capa_url ?? null,
        episodios: falas.reduce((n, f) => n + f.episodios, 0),
        recomendacoes: new Set(
          [...porPodcast.values()].flat().filter((c: any) => c.natureza === "recomenda").map((c: any) => c.episode_id)
        ).size,
        falas,
      });
    }
    // em mais podcasts primeiro; empate, o número de episódios, que é o que a
    // linha mostra (ordenar por indicações deixava a Bíblia, com 47, abaixo de
    // um livro com 35, e o ranking parecia errado)
    livros.sort(
      (a, b) =>
        b.falas.length - a.falas.length ||
        b.episodios - a.episodios ||
        b.recomendacoes - a.recomendacoes ||
        a.titulo.localeCompare(b.titulo)
    );
    return { livros, podcasts: podcastsVistos.size };
  },
  ["livros-em-comum"],
  { revalidate: false, tags: ["dados"] }
);
