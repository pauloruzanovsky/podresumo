import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { acharPorSlug, slugify } from "@/lib/slug";
import EpisodeIndex from "@/components/EpisodeIndex";
import EstanteFiltravel, { type LivroEstante } from "@/components/EstanteFiltravel";
import Rankings, { type AutorPlacar, type PessoaPlacar } from "@/components/Rankings";
import { carregarIndice } from "@/lib/indice";
import { APRESENTADORES, livroDaCasa, podcastVisivel } from "@/lib/podcasts";

export const revalidate = 60;

/**
 * A estante de um podcast — a página que fala do programa, não do site.
 *
 * É o artefato compartilhável: "Os Sócios Podcast — 84 livros citados em 36
 * episódios" é uma frase que o próprio podcast tem motivo pra divulgar, o que
 * um link genérico pra home não é.
 *
 * A página é a estante (todos os livros, filtráveis, em prateleiras) e os
 * dois placares embaixo. O índice de episódios fica na lateral.
 */

const NO_PLACAR = 10;

async function carregar(slug: string) {
  const { data: podcasts } = await supabase
    .from("podcasts")
    .select("id, nome, youtube_channel_id");

  const podcast = acharPorSlug(podcasts ?? [], slug);
  if (!podcast || !podcastVisivel(podcast.nome)) return null;

  // !inner transforma o join em filtro: só citações cujo episódio é deste
  // podcast e cujo livro não é filme/série.
  const { data: rels } = await supabase
    .from("episode_livros")
    .select(
      "livro_id, quem_citou, episodes!inner(data, podcast_id), livros!inner(id, titulo, autor, capa_url, temas, tipo)"
    )
    .eq("episodes.podcast_id", podcast.id)
    .eq("livros.tipo", "livro");

  const { count: totalEpisodios } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .eq("status", "done")
    .eq("podcast_id", podcast.id);

  const citacoes = (rels ?? []) as any[];

  // ── a estante: um item por livro ──
  const porLivro = new Map<string, LivroEstante & { pessoasSet: Set<string> }>();
  for (const rel of citacoes) {
    const l = rel.livros;
    const data = rel.episodes?.data ?? null;
    const atual =
      porLivro.get(l.id) ??
      porLivro
        .set(l.id, {
          id: l.id,
          titulo: l.titulo,
          autor: l.autor,
          capa_url: l.capa_url ?? null,
          episodios_count: 0,
          ultima_data: null,
          temas: (l.temas ?? []) as string[],
          pessoas: [],
          pessoasSet: new Set<string>(),
          daCasa: livroDaCasa(l.autor),
        })
        .get(l.id)!;
    atual.episodios_count += 1;
    if (rel.quem_citou) atual.pessoasSet.add(rel.quem_citou);
    if (data && (!atual.ultima_data || data > atual.ultima_data)) atual.ultima_data = data;
  }
  const livros: LivroEstante[] = [...porLivro.values()].map(({ pessoasSet, ...l }) => ({
    ...l,
    pessoas: [...pessoasSet],
  }));

  // ── placar de pessoas: só convidados ──
  // Os apresentadores citam em quase todo episódio; com eles no placar a
  // disputa acabava antes de começar.
  const porPessoa = new Map<string, number>();
  for (const r of citacoes) {
    const nome = (r.quem_citou ?? "").trim();
    if (!nome || APRESENTADORES.includes(nome)) continue;
    porPessoa.set(nome, (porPessoa.get(nome) ?? 0) + 1);
  }
  const pessoas: PessoaPlacar[] = [...porPessoa.entries()]
    .map(([nome, n]) => ({ nome, citacoes: n }))
    .sort((a, b) => b.citacoes - a.citacoes || a.nome.localeCompare(b.nome))
    .slice(0, NO_PLACAR);

  // ── placar de autores ──
  // O livro do próprio apresentador fica de fora pelo mesmo motivo.
  const porAutor = new Map<
    string,
    { citacoes: number; livros: Map<string, { id: string; titulo: string; capa_url: string | null; n: number }> }
  >();
  for (const r of citacoes) {
    const l = r.livros;
    if (!l.autor || livroDaCasa(l.autor)) continue;
    const a = porAutor.get(l.autor) ?? { citacoes: 0, livros: new Map() };
    a.citacoes += 1;
    const livro = a.livros.get(l.id) ?? { id: l.id, titulo: l.titulo, capa_url: l.capa_url ?? null, n: 0 };
    livro.n += 1;
    a.livros.set(l.id, livro);
    porAutor.set(l.autor, a);
  }
  const autores: AutorPlacar[] = [...porAutor.entries()]
    .filter(([, a]) => a.citacoes > 1)
    .map(([nome, a]) => ({
      nome,
      citacoes: a.citacoes,
      livros: a.livros.size,
      // capas reais primeiro, depois as mais citadas
      capas: [...a.livros.values()]
        .sort((x, y) => Number(Boolean(y.capa_url)) - Number(Boolean(x.capa_url)) || y.n - x.n)
        .map(({ id, titulo, capa_url }) => ({ id, titulo, capa_url })),
    }))
    .sort((a, b) => b.citacoes - a.citacoes || a.nome.localeCompare(b.nome))
    .slice(0, NO_PLACAR);

  return {
    podcast,
    livros,
    totalCitacoes: citacoes.length,
    totalEpisodios: totalEpisodios ?? 0,
    pessoas,
    autores,
  };
}

export async function generateStaticParams() {
  const { data } = await supabase.from("podcasts").select("nome");
  return (data ?? [])
    .filter((p: any) => podcastVisivel(p.nome))
    .map((p: any) => ({ slug: slugify(p.nome) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dados = await carregar(slug);
  if (!dados) return { title: "Podcast não encontrado" };

  const { podcast, livros, totalEpisodios } = dados;
  const titulo = `${livros.length} livros citados em ${podcast.nome}`;
  const descricao = `Todos os livros citados em ${totalEpisodios} episódios de ${podcast.nome}, com o trecho da conversa e o minuto exato de cada citação.`;

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/podcast/${slug}` },
    openGraph: {
      type: "website",
      title: titulo,
      description: descricao,
      url: `/podcast/${slug}`,
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

export default async function PodcastPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; pessoa?: string }>;
}) {
  const { slug } = await params;
  // busca da home, nome de autor ou de convidado: abre a estante já filtrada
  const { q, pessoa } = await searchParams;
  const dados = await carregar(slug);
  if (!dados) return notFound();

  const { podcast, livros, totalCitacoes, totalEpisodios, pessoas, autores } = dados;
  const indice = await carregarIndice(podcast.id);
  const canal = podcast.youtube_channel_id?.startsWith("@")
    ? podcast.youtube_channel_id
    : null;

  return (
    <div>
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-xs uppercase tracking-widest text-muted mb-3">
          A estante de
        </p>
        <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 leading-tight">
          {podcast.nome}
        </h1>

        <p className="text-muted text-sm sm:text-lg max-w-xl mx-auto leading-relaxed">
          <span className="font-semibold text-foreground">{livros.length}</span>{" "}
          livros citados em{" "}
          <span className="font-semibold text-foreground">{totalEpisodios}</span>{" "}
          episódios — com o trecho da conversa e o minuto de cada citação.
        </p>

        {canal && (
          <a
            href={`https://www.youtube.com/${canal}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 bg-card border border-border rounded-full text-xs font-medium text-muted hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            {canal}
          </a>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10 lg:items-start">
        <EpisodeIndex itens={indice} podcastNome={podcast.nome} />
        <div className="min-w-0">
          {/* key: trocar ?pessoa= ou ?q= pelos links do placar remonta a
              estante com o filtro novo, em vez de manter o estado antigo. */}
          <EstanteFiltravel
            key={`${q ?? ""}|${pessoa ?? ""}`}
            livros={livros}
            totalCitacoes={totalCitacoes}
            initialQuery={q ?? ""}
            initialPessoa={pessoa ?? ""}
          />
          <Rankings pessoas={pessoas} autores={autores} apresentadores={APRESENTADORES} />
        </div>
      </div>
    </div>
  );
}
