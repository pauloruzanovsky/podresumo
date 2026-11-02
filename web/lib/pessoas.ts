import { unstable_cache } from "next/cache";
import { supabase, todas } from "@/lib/supabase";
import { slugify } from "@/lib/slug";
import { HOSTS, podcastVisivel } from "@/lib/podcasts";
import { tituloEpisodio } from "@/lib/falas";

/**
 * A página de uma pessoa: os episódios de que participou e os livros que
 * citou. Entra quem foi convidado de algum episódio (`episodes.convidados`),
 * quem citou livro (`episode_livros.quem_citou`) e quem apresenta (HOSTS).
 *
 * O endereço é /pessoa/<slug do nome>, derivado como o slug do podcast: sem
 * tabela de pessoas nem coluna nova. As grafias já vêm unificadas pelo
 * pipeline (flows/normalize_pessoas); as que sobrarem e derem o mesmo slug
 * caem na mesma página.
 */

export interface FalaDaPessoa {
  citacao: string | null;
  segundo: number | null;
  natureza: string | null;
  episodio: {
    id: string;
    slug: string | null;
    numero: string | null;
    titulo: string;
    data: string | null;
    linkYoutube: string | null;
  };
}

export interface LivroDaPessoa {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capaUrl: string | null;
  /** Em quantos episódios a pessoa citou o livro. */
  vezes: number;
  ultimaData: string | null;
  /** A fala de destaque: literal, recomendação antes de menção, a mais recente. */
  destaque: FalaDaPessoa;
}

/** Livro escrito pela pessoa. `vezes` conta o site inteiro, não só ela. */
export interface LivroProprio {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capaUrl: string | null;
  vezes: number;
}

export interface Participacao {
  id: string;
  slug: string | null;
  numero: string | null;
  titulo: string;
  data: string | null;
  podcast: string;
  /** Quantos livros a pessoa citou neste episódio. */
  livros: number;
}

export interface Pessoa {
  nome: string;
  /** O podcast que a pessoa apresenta, se apresenta. */
  apresenta: string | null;
  /** "Fundador da XP", da apresentação do convidado no episódio mais recente. */
  descricao: string | null;
  podcasts: string[];
  participacoes: Participacao[];
  /** Episódios em que citou algum livro. */
  episodiosComCitacao: number;
  /** Os citados por ela, fora os que ela escreveu. */
  livros: LivroDaPessoa[];
  proprios: LivroProprio[];
  indexavel: boolean;
}

interface FichaIndice {
  nomes: string[];
  citacoes: number;
  participacoes: number;
}

/** Abaixo disso a página é rala demais pro Google. */
const MINIMO_PRA_INDEXAR = 3;
const indexavel = (f: FichaIndice) => f.citacoes + f.participacoes >= MINIMO_PRA_INDEXAR;

const hostDe = new Map(
  Object.entries(HOSTS).flatMap(([podcast, nomes]) => nomes.map((n) => [slugify(n), podcast] as const))
);

/** slug → grafias e contagens. Com cache: roda em toda página de pessoa. */
const indicePessoas = unstable_cache(
  async (): Promise<Record<string, FichaIndice>> => {
    const [citacoes, episodios] = await Promise.all([
      todas((de, ate) =>
        supabase
          .from("episode_livros")
          .select("quem_citou, livros!inner(tipo), episodes!inner(podcasts(nome))")
          .not("quem_citou", "is", null)
          .eq("livros.tipo", "livro")
          .order("episode_id")
          .order("livro_id")
          .range(de, ate)
      ),
      todas((de, ate) =>
        supabase
          .from("episodes")
          .select("convidados, podcasts(nome)")
          .eq("status", "done")
          .order("id")
          .range(de, ate)
      ),
    ]);
    if (citacoes.error) throw new Error(citacoes.error.message);
    if (episodios.error) throw new Error(episodios.error.message);

    const indice: Record<string, FichaIndice> = {};
    const ficha = (nome: string) => {
      const slug = slugify(nome);
      const f = (indice[slug] ??= { nomes: [], citacoes: 0, participacoes: 0 });
      if (!f.nomes.includes(nome)) f.nomes.push(nome);
      return f;
    };
    for (const r of citacoes.data as any[]) {
      const nome = (r.quem_citou as string).trim();
      if (nome && podcastVisivel(r.episodes?.podcasts?.nome)) ficha(nome).citacoes += 1;
    }
    for (const e of episodios.data as any[]) {
      if (!podcastVisivel(e.podcasts?.nome)) continue;
      for (const c of (e.convidados ?? []) as string[]) if (c?.trim()) ficha(c.trim()).participacoes += 1;
    }
    for (const nomes of Object.values(HOSTS)) for (const n of nomes) ficha(n).participacoes += 1;
    return indice;
  },
  ["indice-pessoas"],
  { revalidate: 3600 }
);

/** As páginas que vão pro sitemap. */
export async function pessoasIndexaveis(): Promise<string[]> {
  const indice = await indicePessoas();
  return Object.entries(indice)
    .filter(([slug, f]) => slug && indexavel(f))
    .map(([slug]) => slug);
}

/** "Bruno Perini" escreveu "Bruno Perini, Fulano"? Então o livro é dele. Nome
 *  de uma palavra só ("Bruno") pegaria o Giordano Bruno: não conta. */
function escritoPor(autor: string | null, nome: string) {
  const n = slugify(nome);
  return Boolean(autor && n.includes("-") && slugify(autor).includes(n));
}

export async function carregarPessoa(slug: string): Promise<Pessoa | null> {
  const ficha = (await indicePessoas())[slug];
  if (!ficha) return null;
  const { nomes } = ficha;
  const apresenta = hostDe.get(slug) ?? null;

  const [citacoesRes, participacoesRes, propriosRes] = await Promise.all([
    todas((de, ate) =>
      supabase
        .from("episode_livros")
        .select(
          "livro_id, episode_id, quem_citou, citacao_literal, timestamp_seg, natureza, episodes!inner(slug, titulo, ep_number, data, link_youtube, podcasts(nome)), livros!inner(id, slug, titulo, autor, capa_url, tipo)"
        )
        .in("quem_citou", nomes)
        .eq("livros.tipo", "livro")
        .order("episode_id")
        .order("livro_id")
        .range(de, ate)
    ),
    // quem apresenta participa de todos os episódios do programa
    todas((de, ate) => {
      const q = supabase
        .from("episodes")
        .select("id, slug, ep_number, titulo, data, convidados, convidados_info, podcasts!inner(nome)")
        .eq("status", "done");
      return (apresenta ? q.eq("podcasts.nome", apresenta) : q.overlaps("convidados", nomes))
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate);
    }),
    Promise.all(
      nomes
        .filter((n) => n.includes(" "))
        .map((n) =>
          supabase
            .from("livros")
            .select("id, slug, titulo, autor, capa_url, episode_livros(episode_id, episodes(podcasts(nome)))")
            .eq("tipo", "livro")
            .ilike("autor", `%${n}%`)
        )
    ),
  ]);
  if (citacoesRes.error) throw new Error(citacoesRes.error.message);
  if (participacoesRes.error) throw new Error(participacoesRes.error.message);

  const citacoes = (citacoesRes.data as any[]).filter((r) => podcastVisivel(r.episodes?.podcasts?.nome));
  const eps = (participacoesRes.data as any[]).filter((e) => podcastVisivel(e.podcasts?.nome));
  if (citacoes.length === 0 && eps.length === 0) return null;

  // a grafia mais usada vira o nome da página
  const contaNome = new Map<string, number>();
  for (const r of citacoes) contaNome.set(r.quem_citou, (contaNome.get(r.quem_citou) ?? 0) + 1);
  for (const e of eps)
    for (const c of (e.convidados ?? []) as string[])
      if (nomes.includes(c)) contaNome.set(c, (contaNome.get(c) ?? 0) + 1);
  const nome = ([...contaNome.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nomes[0]).trim();

  // ── livros citados ──
  const porLivro = new Map<string, LivroDaPessoa>();
  const livrosPorEp = new Map<string, number>();
  for (const r of citacoes) {
    const l = r.livros;
    const e = r.episodes;
    livrosPorEp.set(r.episode_id, (livrosPorEp.get(r.episode_id) ?? 0) + 1);
    const fala: FalaDaPessoa = {
      citacao: r.citacao_literal?.trim().replace(/^["“]|["”]$/g, "") || null,
      segundo: r.timestamp_seg ?? null,
      natureza: r.natureza ?? null,
      episodio: {
        id: r.episode_id,
        slug: e.slug ?? null,
        numero: e.ep_number ?? null,
        titulo: tituloEpisodio(e.titulo, e.ep_number ?? null),
        data: e.data ?? null,
        linkYoutube: e.link_youtube ?? null,
      },
    };
    const atual = porLivro.get(l.id);
    if (!atual) {
      porLivro.set(l.id, {
        id: l.id,
        slug: l.slug ?? null,
        titulo: l.titulo,
        autor: l.autor ?? null,
        capaUrl: l.capa_url ?? null,
        vezes: 1,
        ultimaData: fala.episodio.data,
        destaque: fala,
      });
      continue;
    }
    atual.vezes += 1;
    if (fala.episodio.data && (!atual.ultimaData || fala.episodio.data > atual.ultimaData))
      atual.ultimaData = fala.episodio.data;
    if (melhorFala(fala, atual.destaque)) atual.destaque = fala;
  }
  const livros = [...porLivro.values()]
    .filter((l) => !escritoPor(l.autor, nome))
    .sort(
      (a, b) =>
        b.vezes - a.vezes ||
        (b.ultimaData ?? "").localeCompare(a.ultimaData ?? "") ||
        a.titulo.localeCompare(b.titulo)
    );

  // ── livros que a pessoa escreveu, citados por qualquer um ──
  const proprios = new Map<string, LivroProprio>();
  for (const res of propriosRes) {
    for (const l of (res.data ?? []) as any[]) {
      if (!escritoPor(l.autor, nome)) continue;
      const vezes = ((l.episode_livros ?? []) as any[]).filter((r) =>
        podcastVisivel(r.episodes?.podcasts?.nome)
      ).length;
      if (vezes > 0)
        proprios.set(l.id, {
          id: l.id,
          slug: l.slug ?? null,
          titulo: l.titulo,
          autor: l.autor ?? null,
          capaUrl: l.capa_url ?? null,
          vezes,
        });
    }
  }

  // ── participações ──
  const participacoes: Participacao[] = eps.map((e) => ({
    id: e.id,
    slug: e.slug ?? null,
    numero: e.ep_number ?? null,
    titulo: tituloEpisodio(e.titulo, e.ep_number ?? null),
    data: e.data ?? null,
    podcast: e.podcasts.nome,
    livros: livrosPorEp.get(e.id) ?? 0,
  }));
  const descricao = apresenta
    ? null
    : (eps
        .flatMap((e) => (e.convidados_info ?? []) as { nome?: string; descricao?: string }[])
        .find((c) => c.nome && nomes.includes(c.nome) && c.descricao)?.descricao ?? null);

  return {
    nome,
    apresenta,
    descricao,
    podcasts: [
      ...new Set([...eps.map((e) => e.podcasts.nome), ...citacoes.map((r) => r.episodes.podcasts.nome)]),
    ] as string[],
    participacoes,
    episodiosComCitacao: livrosPorEp.size,
    livros,
    proprios: [...proprios.values()].sort((a, b) => b.vezes - a.vezes),
    indexavel: indexavel(ficha),
  };
}

/** `a` é melhor destaque que `b`? Fala literal, depois recomendação, depois a mais nova. */
function melhorFala(a: FalaDaPessoa, b: FalaDaPessoa) {
  return (
    Number(Boolean(a.citacao)) - Number(Boolean(b.citacao)) ||
    Number(a.natureza === "recomenda") - Number(b.natureza === "recomenda") ||
    (a.episodio.data ?? "").localeCompare(b.episodio.data ?? "")
  ) > 0;
}
