import { unstable_cache } from "next/cache";
import { podcastVisivel } from "@/lib/podcasts";
import { supabase, todas } from "@/lib/supabase";

/**
 * A busca do site: todos os livros, de todas as estantes. Filtra em memória
 * porque o Postgres não ignora acento no `ilike` e porque o título em outro
 * idioma mora em `titulo_alt`: "tools of titans" tem de achar "Ferramentas
 * dos Titãs". O acervo tem menos de mil livros, e a lista fica cinco minutos
 * em cache.
 */
export interface LivroBusca {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capaUrl: string | null;
  alternativos: string[];
  citacoes: number;
  podcasts: string[];
}

const carregar = unstable_cache(
  async (): Promise<LivroBusca[]> => {
    const { data, error } = await todas((de, ate) =>
      supabase
        .from("livros")
        .select("id, slug, titulo, autor, capa_url, titulo_alt, episode_livros(episodes(podcasts(nome)))")
        .eq("tipo", "livro")
        .order("id")
        .range(de, ate)
    );
    // erro não entra no cache: senão a busca ficaria vazia por cinco minutos
    if (error) throw new Error(error.message);
    return (data as any[])
      .map((l) => {
        const nomes: string[] = (l.episode_livros ?? [])
          .map((r: any) => r.episodes?.podcasts?.nome)
          .filter(podcastVisivel);
        return {
          id: l.id,
          slug: l.slug ?? null,
          titulo: l.titulo,
          autor: l.autor ?? null,
          capaUrl: l.capa_url ?? null,
          alternativos: l.titulo_alt ?? [],
          citacoes: nomes.length,
          podcasts: [...new Set(nomes)],
        };
      })
      .filter((l) => l.citacoes > 0);
  },
  ["busca-livros"],
  { revalidate: 300 }
);

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Título que começa com a busca vem antes; depois, os mais citados. */
export async function buscarLivros(busca: string): Promise<LivroBusca[]> {
  const termo = normaliza(busca);
  if (!termo) return [];
  const livros = await carregar();
  const nota = (l: LivroBusca) => {
    if (normaliza(l.titulo).startsWith(termo)) return 2;
    return [l.titulo, l.autor ?? "", ...l.alternativos].some((t) => normaliza(t).includes(termo)) ? 1 : 0;
  };
  return livros
    .map((l) => ({ l, n: nota(l) }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n || b.l.citacoes - a.l.citacoes || a.l.titulo.localeCompare(b.l.titulo))
    .map(({ l }) => l);
}
