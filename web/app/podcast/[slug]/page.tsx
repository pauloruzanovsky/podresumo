import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { acharPorSlug, slugify } from "@/lib/slug";
import Link from "next/link";
import Image from "next/image";
import BibliotecaList from "@/components/BibliotecaList";
import BookCover from "@/components/BookCover";

export const revalidate = 60;

/**
 * A estante de um podcast — a página que fala do programa, não do site.
 *
 * É o artefato compartilhável: "Os Sócios Podcast — 84 livros citados em 36
 * episódios" é uma frase que o próprio podcast tem motivo pra divulgar, o que
 * um link genérico pra home não é.
 */

async function carregar(slug: string) {
  const { data: podcasts } = await supabase
    .from("podcasts")
    .select("id, nome, youtube_channel_id");

  const podcast = acharPorSlug(podcasts ?? [], slug);
  if (!podcast) return null;

  // !inner transforma o join em filtro: só citações cujo episódio é deste
  // podcast e cujo livro não é filme/série.
  const { data: rels } = await supabase
    .from("episode_livros")
    .select(
      "livro_id, episode_id, contexto, citacao_literal, quem_citou, natureza, timestamp_seg, episodes!inner(data, podcast_id, link_youtube), livros!inner(id, titulo, autor, capa_url, temas, tipo)"
    )
    .eq("episodes.podcast_id", podcast.id)
    .eq("livros.tipo", "livro");

  const { count: totalEpisodios } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .eq("status", "done")
    .eq("podcast_id", podcast.id);

  const porLivro = new Map<string, any>();
  for (const rel of (rels ?? []) as any[]) {
    const l = rel.livros;
    if (!l) continue;
    const data = rel.episodes?.data ?? null;
    const atual = porLivro.get(l.id);
    if (atual) {
      atual.episodios_count += 1;
      if (data && (!atual.ultima_data || data > atual.ultima_data)) {
        atual.ultima_data = data;
        if (rel.contexto) atual.contexto = rel.contexto;
      }
      atual.contexto ??= rel.contexto ?? null;
    } else {
      porLivro.set(l.id, {
        id: l.id,
        titulo: l.titulo,
        autor: l.autor,
        capa_url: l.capa_url ?? null,
        temas: (l.temas ?? []) as string[],
        episodios_count: 1,
        // Um só podcast nesta página: o filtro de podcast se esconde sozinho.
        podcasts: [podcast.nome],
        ultima_data: data,
        contexto: rel.contexto ?? null,
      });
    }
  }

  const livros = [...porLivro.values()].sort(
    (a, b) => b.episodios_count - a.episodios_count || a.titulo.localeCompare(b.titulo)
  );

  const citacoes = (rels ?? []) as any[];

  // Falas em destaque: só existem nos episódios reprocessados com o extrator
  // novo. Recomendação vem antes de menção de passagem; depois, a mais recente.
  const peso = (n: string | null) => (n === "recomenda" ? 0 : n === "critica" ? 1 : 2);
  const destaques: Destaque[] = citacoes
    .filter((r) => r.citacao_literal && r.livros)
    .sort(
      (a, b) =>
        peso(a.natureza) - peso(b.natureza) ||
        (b.episodes?.data ?? "").localeCompare(a.episodes?.data ?? "")
    )
    .slice(0, 3)
    .map((r) => ({
      livro_id: r.livros.id,
      titulo: r.livros.titulo,
      autor: r.livros.autor,
      capa_url: r.livros.capa_url ?? null,
      citacao: r.citacao_literal,
      quem_citou: r.quem_citou ?? null,
      link:
        r.timestamp_seg != null && r.episodes?.link_youtube
          ? `${r.episodes.link_youtube}&t=${r.timestamp_seg}s`
          : null,
    }));

  // Quem mais cita livros no programa — host ou convidado.
  const porPessoa = new Map<
    string,
    { nome: string; citacoes: number; recomenda: number }
  >();
  for (const r of citacoes) {
    const nome = (r.quem_citou ?? "").trim();
    if (!nome) continue;
    const p = porPessoa.get(nome) ?? { nome, citacoes: 0, recomenda: 0 };
    p.citacoes += 1;
    if (r.natureza === "recomenda") p.recomenda += 1;
    porPessoa.set(nome, p);
  }
  const pessoas = [...porPessoa.values()]
    .sort((a, b) => b.citacoes - a.citacoes || a.nome.localeCompare(b.nome))
    .slice(0, 6);

  // Autores que voltam: mais de uma citação no programa.
  const porAutor = new Map<
    string,
    { nome: string; citacoes: number; livros: Set<string> }
  >();
  for (const r of citacoes) {
    const nome = r.livros?.autor;
    if (!nome) continue;
    const a = porAutor.get(nome) ?? { nome, citacoes: 0, livros: new Set<string>() };
    a.citacoes += 1;
    a.livros.add(r.livros.id);
    porAutor.set(nome, a);
  }
  const autores = [...porAutor.values()]
    .filter((a) => a.citacoes > 1)
    .sort((a, b) => b.citacoes - a.citacoes || a.nome.localeCompare(b.nome))
    .slice(0, 6)
    .map((a) => ({ nome: a.nome, citacoes: a.citacoes, livros: a.livros.size }));

  const livrosPorEpisodio = new Map<string, number>();
  for (const r of citacoes)
    livrosPorEpisodio.set(
      r.episode_id,
      (livrosPorEpisodio.get(r.episode_id) ?? 0) + 1
    );

  const { data: recentes } = await supabase
    .from("episodes")
    .select("id, titulo, ep_number, data, thumbnail")
    .eq("status", "done")
    .eq("podcast_id", podcast.id)
    .order("data", { ascending: false })
    .limit(4);

  const episodios = ((recentes ?? []) as any[]).map((e) => ({
    id: e.id as string,
    titulo: e.titulo as string,
    ep_number: (e.ep_number ?? null) as string | null,
    thumbnail: (e.thumbnail ?? null) as string | null,
    livros: livrosPorEpisodio.get(e.id) ?? 0,
  }));

  return {
    podcast,
    livros,
    totalEpisodios: totalEpisodios ?? 0,
    destaques,
    pessoas,
    autores,
    episodios,
  };
}

interface Destaque {
  livro_id: string;
  titulo: string;
  autor: string | null;
  capa_url: string | null;
  citacao: string;
  quem_citou: string | null;
  link: string | null;
}

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece ao lado. */
function tituloLimpo(titulo: string, epNumber: string | null) {
  return epNumber ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

function Secao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight">
        {titulo}
      </h2>
      {subtitulo && <p className="text-sm text-muted mt-1">{subtitulo}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export async function generateStaticParams() {
  const { data } = await supabase.from("podcasts").select("nome");
  return (data ?? []).map((p: any) => ({ slug: slugify(p.nome) }));
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
  const descricao = `Todos os livros recomendados em ${totalEpisodios} episódios de ${podcast.nome}, com o trecho da conversa e o minuto exato de cada menção.`;

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dados = await carregar(slug);
  if (!dados) return notFound();

  const { podcast, livros, totalEpisodios, destaques, pessoas, autores, episodios } =
    dados;
  const canal = podcast.youtube_channel_id?.startsWith("@")
    ? podcast.youtube_channel_id
    : null;

  const totalCitacoes = livros.reduce(
    (soma, l) => soma + l.episodios_count,
    0
  );

  return (
    <div>
      <div className="text-center mb-12 sm:mb-16">
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
          episódios — com o trecho da conversa e o minuto de cada menção.
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

      {destaques.length > 0 && (
        <Secao
          titulo="Nas palavras de quem indicou"
          subtitulo="A fala do episódio, com o minuto pra ouvir."
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {destaques.map((d) => (
              <article
                key={d.livro_id}
                className="flex flex-col p-6 bg-card border border-border rounded-2xl"
              >
                <blockquote className="font-serif text-lg leading-snug text-foreground line-clamp-6">
                  “{d.citacao}”
                </blockquote>
                {d.quem_citou && (
                  <p className="text-sm font-semibold mt-3">— {d.quem_citou}</p>
                )}

                <div className="mt-auto pt-5">
                  <Link
                    href={`/livro/${d.livro_id}`}
                    className="group flex items-center gap-3 pt-5 border-t border-border"
                  >
                    <BookCover
                      titulo={d.titulo}
                      autor={d.autor}
                      capaUrl={d.capa_url}
                      className="w-10 shrink-0 shadow-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug group-hover:underline line-clamp-2">
                        {d.titulo}
                      </p>
                      <p className="text-xs text-muted line-clamp-1">
                        {d.autor ?? "—"}
                      </p>
                    </div>
                  </Link>
                  {d.link && (
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Ouvir o trecho
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </Secao>
      )}

      {(pessoas.length > 1 || autores.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12">
          {pessoas.length > 1 && (
            <Secao
              titulo="Quem mais cita livros"
              subtitulo="Hosts e convidados, por número de citações."
            >
              <ol className="divide-y divide-border border-y border-border">
                {pessoas.map((p, i) => (
                  <li key={p.nome} className="flex items-baseline gap-4 py-3">
                    <span className="font-mono text-xs text-muted w-5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium flex-1 min-w-0 truncate">
                      {p.nome}
                    </span>
                    <span className="text-sm text-muted whitespace-nowrap">
                      {p.citacoes} {p.citacoes === 1 ? "citação" : "citações"}
                      {p.recomenda > 0 &&
                        ` · ${p.recomenda} ${p.recomenda === 1 ? "recomendação" : "recomendações"}`}
                    </span>
                  </li>
                ))}
              </ol>
            </Secao>
          )}

          {autores.length > 0 && (
            <Secao
              titulo="Autores que sempre voltam"
              subtitulo="Citados em mais de uma conversa."
            >
              <ol className="divide-y divide-border border-y border-border">
                {autores.map((a, i) => (
                  <li key={a.nome}>
                    <Link
                      href={`/biblioteca?q=${encodeURIComponent(a.nome)}`}
                      className="group flex items-baseline gap-4 py-3"
                    >
                      <span className="font-mono text-xs text-muted w-5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium flex-1 min-w-0 truncate group-hover:underline">
                        {a.nome}
                      </span>
                      <span className="text-sm text-muted whitespace-nowrap">
                        {a.citacoes} citações · {a.livros}{" "}
                        {a.livros === 1 ? "livro" : "livros"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Secao>
          )}
        </div>
      )}

      {episodios.length > 0 && (
        <Secao titulo="Últimos episódios">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {episodios.map((e) => (
              <Link key={e.id} href={`/episodio/${e.id}`} className="group">
                {e.thumbnail && (
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-border">
                    <Image
                      src={e.thumbnail}
                      alt=""
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                )}
                <p className="text-sm font-medium leading-snug mt-3 line-clamp-2 group-hover:underline">
                  {tituloLimpo(e.titulo, e.ep_number)}
                </p>
                <p className="text-xs text-muted mt-1">
                  {e.ep_number && `#${e.ep_number} · `}
                  {e.livros === 0
                    ? "nenhum livro citado"
                    : `${e.livros} ${e.livros === 1 ? "livro" : "livros"}`}
                </p>
              </Link>
            ))}
          </div>
        </Secao>
      )}

      <Secao
        titulo="Todos os livros"
        subtitulo={`${totalCitacoes} citações no total.`}
      >
        <BibliotecaList livros={livros} />
      </Secao>
    </div>
  );
}
