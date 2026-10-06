import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { podcastVisivel } from "@/lib/podcasts";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookCover from "@/components/BookCover";

export const revalidate = 60;

/**
 * Metadata por livro. É esta página que viaja no WhatsApp, então o título e a
 * descrição precisam dizer o que o link é sem a pessoa abrir: qual livro, quem
 * recomendou e quantas vezes.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const { data: livro } = await supabase
    .from("livros")
    .select("titulo, autor, capa_url, episode_livros(episodes(podcasts(nome)))")
    .eq("id", id)
    .single();

  if (!livro) return { title: "Livro não encontrado" };

  const rels = ((livro.episode_livros ?? []) as any[]).filter((r) =>
    podcastVisivel(r.episodes?.podcasts?.nome)
  );
  if (rels.length === 0) return { title: "Livro não encontrado" };

  const citacoes = rels.length;
  const podcasts = [
    ...new Set(rels.map((r) => r.episodes?.podcasts?.nome) as string[]),
  ];

  const porQuem = podcasts.length ? ` em ${podcasts.join(" e ")}` : "";
  const vezes = citacoes === 1 ? "1 vez" : `${citacoes} vezes`;
  const titulo = livro.autor ? `${livro.titulo} — ${livro.autor}` : livro.titulo;
  const descricao = `Citado ${vezes}${porQuem}. Veja o trecho do episódio e o minuto exato de cada menção.`;

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/livro/${id}` },
    openGraph: {
      type: "article",
      title: titulo,
      description: descricao,
      url: `/livro/${id}`,
      // A imagem vem de opengraph-image.tsx (título, autor e a fala de quem
      // indicou). A capa sozinha era pequena demais pro card do WhatsApp.
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

function formatTimestamp(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Sem ISBN/ASIN no acervo não dá pra linkar a página do produto, mas dá pra
 * fazer a busca cair certo: título + autor, restrita à categoria de livros
 * (`i=stripbooks`). Só o título trazia resultado errado em títulos genéricos
 * como "Cartas" ou "Rebecca".
 */
function getAmazonLink(titulo: string, autor?: string | null) {
  const termo = autor ? `${titulo} ${autor}` : titulo;
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(termo)}&i=stripbooks`;
}

interface Citacao {
  contexto: string | null;
  timestamp_seg: number | null;
  // Só existem nos episódios já reprocessados com o extrator novo; os demais
  // caem no layout antigo (paráfrase + minuto).
  citacao_literal: string | null;
  quem_citou: string | null;
  natureza: "recomenda" | "menciona" | "critica" | null;
  episode_id: string;
  titulo: string;
  ep_number: string | null;
  data: string;
  link_youtube: string;
}

const NATUREZA: Record<string, { rotulo: string; classe: string }> = {
  recomenda: {
    rotulo: "Recomenda",
    classe: "border-accent/30 text-accent-light bg-accent/5",
  },
  menciona: { rotulo: "Menciona", classe: "border-border text-muted" },
  critica: {
    rotulo: "Critica",
    classe: "border-amber-300 text-amber-800 bg-amber-50",
  },
};

/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece no selo. */
function tituloLimpo(titulo: string, epNumber: string | null) {
  return epNumber ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

export default async function LivroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: livro, error } = await supabase
    .from("livros")
    .select(
      "*, episode_livros(contexto, timestamp_seg, citacao_literal, quem_citou, natureza, episode_id, episodes(titulo, ep_number, data, link_youtube, podcasts(nome)))"
    )
    .eq("id", id)
    .single();

  if (error || !livro) return notFound();

  const citacoes: Citacao[] = (livro.episode_livros ?? [])
    // citação de podcast oculto não aparece (lib/podcasts)
    .filter((rel: any) => podcastVisivel(rel.episodes?.podcasts?.nome))
    .map((rel: any) => ({
      contexto: rel.contexto,
      timestamp_seg: rel.timestamp_seg,
      citacao_literal: rel.citacao_literal,
      quem_citou: rel.quem_citou,
      natureza: rel.natureza,
      episode_id: rel.episode_id,
      titulo: rel.episodes.titulo,
      ep_number: rel.episodes.ep_number,
      data: rel.episodes.data,
      link_youtube: rel.episodes.link_youtube,
    }))
    .sort(
      (a: Citacao, b: Citacao) =>
        new Date(b.data).getTime() - new Date(a.data).getTime()
    );

  // Livro que só foi citado em podcast oculto não tem página.
  if (citacoes.length === 0) return notFound();

  // Livros citados nos mesmos episódios. É a única recomendação que este
  // acervo pode fazer com honestidade: não é "quem leu isso leu aquilo", é
  // "saiu na mesma conversa".
  const episodeIds = citacoes.map((c) => c.episode_id);
  const { data: coCitadosRaw } = episodeIds.length
    ? await supabase
        .from("episode_livros")
        .select("livro_id, livros(id, titulo, autor, tipo, capa_url)")
        .in("episode_id", episodeIds)
        .neq("livro_id", id)
    : { data: [] };

  const juntos = new Map<
    string,
    {
      id: string;
      titulo: string;
      autor: string | null;
      capa_url: string | null;
      vezes: number;
    }
  >();
  for (const rel of (coCitadosRaw ?? []) as any[]) {
    const l = rel.livros;
    if (!l || l.tipo !== "livro") continue;
    const atual = juntos.get(l.id);
    if (atual) atual.vezes += 1;
    else
      juntos.set(l.id, {
        id: l.id,
        titulo: l.titulo,
        autor: l.autor,
        capa_url: l.capa_url ?? null,
        vezes: 1,
      });
  }
  const coCitados = [...juntos.values()]
    .sort((a, b) => b.vezes - a.vezes || a.titulo.localeCompare(b.titulo))
    .slice(0, 6);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/biblioteca"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Biblioteca
      </Link>

      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row gap-6 sm:gap-8">
        {/* self-start: sem isso o flex estica a capa até a altura da coluna de
            texto e sobra gradiente aparecendo embaixo da imagem. */}
        <BookCover
          titulo={livro.titulo}
          autor={livro.autor}
          capaUrl={livro.capa_url}
          size="lg"
          className="w-32 sm:w-40 shrink-0 self-start shadow-md"
        />

        <div className="min-w-0">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
          {livro.titulo}
        </h1>
        <p className="text-muted text-lg">
          {livro.autor ?? (
            <span className="italic text-muted/60">autor não citado no episódio</span>
          )}
        </p>

        {/* Os temas saíram daqui de propósito. `livros.temas` é herdado das
            tags dos EPISÓDIOS que citam o livro, então um livro citado em 4
            episódios acumulava a união das 4 listas — "A Lógica do Cisne
            Negro" aparecia marcado com Bitcoin, Educação e Produtividade.
            Como eixo de navegação na biblioteca funciona; como afirmação
            sobre o livro, é falso. Volta quando o tema for derivado do livro. */}

        <div className="flex items-center gap-4 mt-6 flex-wrap">
          <span className="text-sm text-muted">
            Citado em{" "}
            <span className="font-semibold text-foreground">
              {citacoes.length}
            </span>{" "}
            {citacoes.length === 1 ? "episódio" : "episódios"}
          </span>

          <a
            href={getAmazonLink(livro.titulo, livro.autor)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-full text-foreground text-sm font-medium hover:bg-card-hover transition-colors"
          >
            Buscar na Amazon
          </a>
        </div>
        </div>
      </div>

      {/* Citações */}
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">
        O que disseram sobre este livro
      </h2>

      <div className="flex flex-col gap-5">
        {citacoes.map((c) => {
          const natureza = c.natureza ? NATUREZA[c.natureza] : null;
          return (
            <article
              key={c.episode_id}
              className="p-6 sm:p-7 bg-card border border-border rounded-2xl"
            >
              {c.citacao_literal ? (
                <>
                  <blockquote className="font-serif text-xl sm:text-2xl leading-snug text-foreground">
                    “{c.citacao_literal}”
                  </blockquote>
                  <div className="flex items-center gap-3 flex-wrap mt-4">
                    {c.quem_citou && (
                      <span className="text-sm font-semibold text-foreground">
                        — {c.quem_citou}
                      </span>
                    )}
                    {natureza && (
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${natureza.classe}`}
                      >
                        {natureza.rotulo}
                      </span>
                    )}
                  </div>
                  {c.contexto && (
                    <p className="text-sm text-muted leading-relaxed mt-4">
                      {c.contexto}
                    </p>
                  )}
                </>
              ) : (
                c.contexto && (
                  <p className="text-base text-foreground/80 leading-relaxed">
                    {c.contexto}
                  </p>
                )
              )}

              <div className="flex items-center justify-between gap-4 flex-wrap mt-6 pt-5 border-t border-border">
                <Link
                  href={`/episodio/${c.episode_id}`}
                  className="min-w-0 text-sm text-muted hover:text-foreground transition-colors leading-snug"
                >
                  {c.ep_number && (
                    <span className="font-mono text-xs mr-2">
                      #{c.ep_number}
                    </span>
                  )}
                  {tituloLimpo(c.titulo, c.ep_number)}
                  <span className="text-xs text-muted/70 whitespace-nowrap">
                    {" · "}
                    {formatDate(c.data)}
                  </span>
                </Link>

                {/* O único botão cheio da página: o minuto exato é o que este
                    site tem e os outros não. */}
                {c.timestamp_seg != null && (
                  <a
                    href={`${c.link_youtube}&t=${c.timestamp_seg}s`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-full transition-colors shrink-0"
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
                    <span className="font-mono font-normal opacity-90">
                      {formatTimestamp(c.timestamp_seg)}
                    </span>
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {coCitados.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-1">
            Citados nos mesmos episódios
          </h2>
          <p className="text-xs text-muted mb-4">
            Livros que apareceram na mesma conversa.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {coCitados.map((l) => (
              <Link
                key={l.id}
                href={`/livro/${l.id}`}
                className="group flex gap-3 p-3 bg-card border border-border rounded-xl hover:border-accent/30 hover:bg-card-hover transition-all"
              >
                <BookCover
                  titulo={l.titulo}
                  autor={l.autor}
                  capaUrl={l.capa_url}
                  className="w-12 shrink-0 shadow-sm"
                />
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold leading-snug text-foreground group-hover:text-accent-light transition-colors line-clamp-2">
                    {l.titulo}
                  </h3>
                  <p className="text-[11px] text-muted mt-0.5 line-clamp-1">
                    {l.autor ?? "—"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
