import { unstable_cache } from "next/cache";
import { tituloEpisodio } from "@/lib/falas";
import { hrefEpisodio, hrefLivro } from "@/lib/links";
import { HOSTS, estantesDoMenu, podcastVisivel } from "@/lib/podcasts";
import { slugify } from "@/lib/slug";
import { supabase, todas } from "@/lib/supabase";

/**
 * A busca do site: livros, pessoas (autor, convidado, quem citou, host),
 * podcasts e episódios. Filtra em memória porque o Postgres não ignora acento
 * no `ilike` e porque o título em outro idioma mora em `titulo_alt`: "tools of
 * titans" tem de achar "Ferramentas dos Titãs". O acervo é pequeno, e o índice
 * fica cinco minutos em cache.
 */
export interface LivroBusca {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capaUrl: string | null;
  alternativos: string[];
  /** Quem citou: buscar um convidado traz os livros que ele levou à conversa. */
  quem: string[];
  citacoes: number;
  podcasts: string[];
}

export interface PessoaBusca {
  nome: string;
  papel: string;
  href: string;
  peso: number;
}

export interface EpisodioBusca {
  id: string;
  slug: string | null;
  titulo: string;
  numero: string | null;
  podcast: string;
  convidados: string[];
}

export interface PodcastBusca {
  nome: string;
  slug: string;
  capa: string | null;
  selo: string;
  hosts: string[];
}

interface Indice {
  livros: LivroBusca[];
  pessoas: PessoaBusca[];
  episodios: EpisodioBusca[];
}

export interface Resultados {
  podcasts: PodcastBusca[];
  pessoas: PessoaBusca[];
  livros: LivroBusca[];
  episodios: EpisodioBusca[];
}

/** Uma linha do dropdown, seja o que for: o navegador só desenha e navega. */
export interface Sugestao {
  tipo: "Podcast" | "Pessoa" | "Livro" | "Episódio";
  titulo: string;
  detalhe: string;
  href: string;
  capa: string | null;
  formato: "quadrada" | "livro" | "sem";
}

function vezes(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

interface FichaPessoa {
  citou: Map<string, number>;
  livrosEscritos: number;
  convidado: number;
}

function montarPessoas(fichas: Map<string, FichaPessoa>): PessoaBusca[] {
  const hostDe = new Map(Object.entries(HOSTS).flatMap(([p, nomes]) => nomes.map((n) => [n, p] as const)));
  return [...fichas.entries()].map(([nome, f]) => {
    const citou = [...f.citou.values()].reduce((a, b) => a + b, 0);
    const maisCitou = [...f.citou.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const peso = citou + f.convidado + f.livrosEscritos;
    const host = hostDe.get(nome);
    if (host) return { nome, papel: `Apresenta ${host}`, href: `/podcast/${slugify(host)}`, peso: peso + 1000 };
    const partes = [
      f.convidado ? `Convidado em ${vezes(f.convidado, "episódio", "episódios")}` : "",
      f.livrosEscritos ? `Autor de ${vezes(f.livrosEscritos, "livro", "livros")}` : "",
      citou ? `Citou ${vezes(citou, "livro", "livros")}` : "",
    ].filter(Boolean);
    // Sem página própria: quem citou abre a estante filtrada; o resto, a busca
    // com o nome, que junta os livros e os episódios da pessoa.
    const href = maisCitou
      ? `/podcast/${slugify(maisCitou)}?pessoa=${encodeURIComponent(nome)}#todos-os-livros`
      : `/busca?q=${encodeURIComponent(nome)}`;
    return { nome, papel: partes.join(" · "), href, peso };
  });
}

const carregar = unstable_cache(
  async (): Promise<Indice> => {
    const [livrosRes, episodiosRes] = await Promise.all([
      todas((de, ate) =>
        supabase
          .from("livros")
          .select("id, slug, titulo, autor, capa_url, titulo_alt, episode_livros(quem_citou, episodes(podcasts(nome)))")
          .eq("tipo", "livro")
          .order("id")
          .range(de, ate)
      ),
      todas((de, ate) =>
        supabase
          .from("episodes")
          .select("id, slug, ep_number, titulo, data, convidados, podcasts(nome)")
          .eq("status", "done")
          .order("data", { ascending: false })
          .order("id")
          .range(de, ate)
      ),
    ]);
    // erro não entra no cache: senão a busca ficaria vazia por cinco minutos
    if (livrosRes.error) throw new Error(livrosRes.error.message);
    if (episodiosRes.error) throw new Error(episodiosRes.error.message);

    const fichas = new Map<string, FichaPessoa>();
    const ficha = (nome: string) => {
      const atual = fichas.get(nome) ?? { citou: new Map(), livrosEscritos: 0, convidado: 0 };
      fichas.set(nome, atual);
      return atual;
    };

    const livros = (livrosRes.data as any[])
      .map((l) => {
        const rels = ((l.episode_livros ?? []) as any[]).filter((r) =>
          podcastVisivel(r.episodes?.podcasts?.nome)
        );
        for (const r of rels) {
          const quem = (r.quem_citou ?? "").trim();
          if (!quem) continue;
          const f = ficha(quem);
          const podcast = r.episodes.podcasts.nome as string;
          f.citou.set(podcast, (f.citou.get(podcast) ?? 0) + 1);
        }
        if (rels.length && l.autor) ficha(l.autor).livrosEscritos += 1;
        return {
          id: l.id,
          slug: l.slug ?? null,
          titulo: l.titulo,
          autor: l.autor ?? null,
          capaUrl: l.capa_url ?? null,
          alternativos: l.titulo_alt ?? [],
          quem: [...new Set(rels.map((r) => (r.quem_citou ?? "").trim()).filter(Boolean))] as string[],
          citacoes: rels.length,
          podcasts: [...new Set(rels.map((r) => r.episodes.podcasts.nome))] as string[],
        };
      })
      .filter((l) => l.citacoes > 0);

    const episodios = (episodiosRes.data as any[])
      .filter((e) => podcastVisivel(e.podcasts?.nome))
      .map((e) => {
        const convidados = ((e.convidados ?? []) as string[]).map((c) => c.trim()).filter(Boolean);
        for (const c of convidados) ficha(c).convidado += 1;
        return {
          id: e.id,
          slug: e.slug ?? null,
          titulo: tituloEpisodio(e.titulo, e.ep_number ?? null),
          numero: e.ep_number ?? null,
          podcast: e.podcasts.nome,
          convidados,
        };
      });

    return { livros, episodios, pessoas: montarPessoas(fichas) };
  },
  ["busca-indice"],
  { revalidate: 300 }
);

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Toda palavra da busca é começo de alguma palavra dos campos, em qualquer
 *  ordem: "ferriss tim" acha Tim Ferriss, e "tim" não acha "Último". */
function casa(termo: string, ...campos: (string | null | undefined)[]) {
  const palavras = normaliza(campos.filter(Boolean).join(" ")).split(/[^a-z0-9]+/);
  return termo
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((p) => palavras.some((w) => w.startsWith(p)));
}

function ordena<T>(itens: T[], nota: (item: T) => number, desempate: (a: T, b: T) => number) {
  return itens
    .map((item) => ({ item, n: nota(item) }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n || desempate(a.item, b.item))
    .map(({ item }) => item);
}

export async function buscarTudo(busca: string): Promise<Resultados> {
  const termo = normaliza(busca);
  if (!termo) return { podcasts: [], pessoas: [], livros: [], episodios: [] };
  const [indice, estantes] = await Promise.all([carregar(), estantesDoMenu().catch(() => [])]);

  const podcasts = estantes
    .map((e) => ({ nome: e.nome, slug: e.slug, capa: e.capa, selo: e.selo, hosts: HOSTS[e.nome] ?? [] }))
    .filter((p) => casa(termo, p.nome, ...p.hosts));

  const pessoas = ordena(
    indice.pessoas,
    (p) => (normaliza(p.nome).startsWith(termo) ? 2 : casa(termo, p.nome) ? 1 : 0),
    (a, b) => b.peso - a.peso
  );

  const livros = ordena(
    indice.livros,
    (l) => {
      if (normaliza(l.titulo).startsWith(termo)) return 4;
      if (casa(termo, l.titulo)) return 3;
      if (casa(termo, l.autor, ...l.alternativos)) return 2;
      return l.quem.some((q) => casa(termo, q)) ? 1 : 0;
    },
    (a, b) => b.citacoes - a.citacoes || a.titulo.localeCompare(b.titulo)
  );

  const episodios = indice.episodios.filter(
    (e) => casa(termo, e.titulo, e.numero ? `#${e.numero}` : null) || e.convidados.some((c) => casa(termo, c))
  );

  return { podcasts, pessoas, livros, episodios };
}

export function detalheEpisodio(e: EpisodioBusca) {
  return `${e.numero ? `#${e.numero} · ` : ""}${e.podcast}`;
}

/** O topo de cada grupo, pro dropdown: livro primeiro é o que o site tem. */
export function paraSugestoes(r: Resultados): Sugestao[] {
  return [
    ...r.podcasts.slice(0, 2).map((p): Sugestao => ({
      tipo: "Podcast",
      titulo: p.nome,
      detalhe: p.selo,
      href: `/podcast/${p.slug}`,
      capa: p.capa,
      formato: "quadrada",
    })),
    ...r.pessoas.slice(0, 3).map((p): Sugestao => ({
      tipo: "Pessoa",
      titulo: p.nome,
      detalhe: p.papel,
      href: p.href,
      capa: null,
      formato: "sem",
    })),
    ...r.livros.slice(0, 4).map((l): Sugestao => ({
      tipo: "Livro",
      titulo: l.titulo,
      detalhe: l.autor ?? vezes(l.citacoes, "citação", "citações"),
      href: hrefLivro(l),
      capa: l.capaUrl,
      formato: "livro",
    })),
    ...r.episodios.slice(0, 2).map((e): Sugestao => ({
      tipo: "Episódio",
      titulo: e.titulo,
      detalhe: detalheEpisodio(e),
      href: hrefEpisodio(e),
      capa: null,
      formato: "sem",
    })),
  ];
}
