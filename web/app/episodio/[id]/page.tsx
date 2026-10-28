import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import EpisodeIndex from "@/components/EpisodeIndex";
import Estante from "@/components/Estante";
import { carregarIndice } from "@/lib/indice";
import { podcastVisivel } from "@/lib/podcasts";
import { slugify } from "@/lib/slug";
import { notFound, permanentRedirect } from "next/navigation";
import { hrefEpisodio, hrefLivro } from "@/lib/links";
import { resolverEpisodio } from "@/lib/resolver";
import { formatTimestamp } from "@/lib/tempo";

// Em cache e atualizada a cada minuto. Sem isto a página era montada do zero
// a cada visita (~1 a 5 s na Vercel). A lista vazia em generateStaticParams
// liga o cache sem pré-montar todos os episódios no build: cada um entra no
// cache na primeira visita.
export const revalidate = 60;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: param } = await params;
  const ref = await resolverEpisodio(param);
  if (!ref) return { title: "Episódio não encontrado" };
  const id = ref.id;
  const endereco = hrefEpisodio(ref);

  const { data: ep } = await supabase
    .from("episodes")
    .select("titulo, resumo, thumbnail, episode_livros(livro_id)")
    .eq("id", id)
    .single();

  if (!ep) return { title: "Episódio não encontrado" };

  const livros = (ep.episode_livros ?? []).length;
  const quantos =
    livros === 0
      ? "Resumo do episódio e principais insights."
      : `${livros} livro${livros === 1 ? "" : "s"} citado${livros === 1 ? "" : "s"} neste episódio, com o minuto de cada menção.`;
  // O resumo é longo demais pra descrição; o corte mantém a frase legível.
  const descricao = (ep.resumo || "").slice(0, 150).trim() || quantos;

  return {
    title: ep.titulo,
    description: descricao,
    alternates: { canonical: endereco },
    openGraph: {
      type: "article",
      title: ep.titulo,
      description: descricao,
      url: endereco,
      images: ep.thumbnail ? [{ url: ep.thumbnail }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: ep.titulo,
      description: descricao,
    },
  };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}


/** "TÍTULO | Os Sócios 296" -> "TÍTULO": o número já aparece no selo. */
function tituloLimpo(titulo: string, epNumber: string | null) {
  return epNumber ? titulo.replace(/\s*\|[^|]*$/, "") : titulo;
}

// Só existem nos episódios extraídos com o prompt v3 em diante; nos demais as
// listas vêm vazias e a página cai nos tópicos sem minuto.
interface Capitulo {
  titulo: string;
  timestamp_seg: number | null;
}
interface Frase {
  texto: string;
  quem: string | null;
  timestamp_seg: number | null;
}
interface ConvidadoInfo {
  nome: string;
  descricao: string | null;
}
interface LivroCitado {
  id: string;
  slug: string | null;
  titulo: string;
  autor: string | null;
  capa_url: string | null;
  natureza: string | null;
  quem_citou: string | null;
  timestamp_seg: number | null;
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">
      {children}
    </h2>
  );
}

function IconePlay() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export default async function EpisodioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // aceita o slug (/episodio/312-...) e o id do vídeo, que redireciona
  const { id: param } = await params;
  const ref = await resolverEpisodio(param);
  if (!ref) return notFound();
  if (ref.slug && param !== ref.slug) permanentRedirect(hrefEpisodio(ref));
  const id = ref.id;

  const { data: ep, error } = await supabase
    .from("episodes")
    .select(
      "*, podcasts(nome), episode_livros(natureza, quem_citou, timestamp_seg, livros(id, slug, titulo, autor, tipo, capa_url))"
    )
    .eq("id", id)
    .single();

  // Só episódio extraído tem página; os catalogados (listed/pending)
  // aparecem no índice como "em breve". Podcast oculto também não abre.
  if (error || !ep || ep.status !== "done" || !podcastVisivel(ep.podcasts?.nome))
    return notFound();

  const indice = await carregarIndice(ep.podcast_id);

  const livros: LivroCitado[] = ((ep.episode_livros ?? []) as any[])
    .filter((rel) => rel.livros && rel.livros.tipo === "livro")
    .map((rel) => ({
      id: rel.livros.id,
      slug: rel.livros.slug ?? null,
      titulo: rel.livros.titulo,
      autor: rel.livros.autor,
      capa_url: rel.livros.capa_url ?? null,
      natureza: rel.natureza ?? null,
      quem_citou: rel.quem_citou ?? null,
      timestamp_seg: rel.timestamp_seg ?? null,
    }))
    // na ordem em que aparecem na conversa
    .sort(
      (a, b) => (a.timestamp_seg ?? Infinity) - (b.timestamp_seg ?? Infinity)
    );

  // A extração às vezes devolve um capítulo fora de ordem; o minuto está
  // certo, então é ele que ordena.
  const capitulos = ((ep.capitulos ?? []) as Capitulo[])
    .filter((c) => c.titulo)
    .sort(
      (a, b) => (a.timestamp_seg ?? Infinity) - (b.timestamp_seg ?? Infinity)
    );
  const frases = ((ep.frases ?? []) as Frase[]).filter((f) => f.texto);
  const apresentacoes = ((ep.convidados_info ?? []) as ConvidadoInfo[]).filter(
    (c) => c.nome
  );
  const convidados = (ep.convidados ?? []) as string[];

  const noMinuto = (seg: number) => `${ep.link_youtube}&t=${seg}s`;
  const titulo = tituloLimpo(ep.titulo, ep.ep_number);

  return (
    // no celular o índice vai pro fim: antes ele empurrava o episódio pra baixo
    <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10 lg:items-start">
    <div className="order-last lg:order-none lg:contents">
      <EpisodeIndex itens={indice} atualId={id} podcastNome={ep.podcasts?.nome ?? ""} />
    </div>
    <div className="min-w-0 max-w-4xl">
      <Link
        // volta pra estante do podcast deste episódio; a lista de episódios
        // fica no menu e na lateral
        href={`/podcast/${slugify(ep.podcasts?.nome ?? "")}`}
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Estante
      </Link>

      {/* Topo: a thumbnail limpa (ela já traz o título desenhado; escrever
          por cima duplicava) e o título embaixo, em serifada. */}
      {/* no computador a thumbnail fica ao lado do título, pequena: em
          largura inteira ela empurrava os livros pra baixo da dobra */}
      <header className="mb-10 md:flex md:items-center md:gap-8">
        {ep.thumbnail && (
          <div className="relative w-full md:w-80 shrink-0 aspect-video rounded-2xl overflow-hidden mb-6 md:mb-0 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.6)]">
            <Image
              src={ep.thumbnail}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 320px"
              priority
            />
          </div>
        )}
        <div className="min-w-0">
        <p className="text-sm text-muted mb-2 tabular-nums">
          {ep.ep_number && (
            <span className="font-mono font-semibold text-foreground mr-2">#{ep.ep_number}</span>
          )}
          {formatDate(ep.data)}
          {ep.duracao && ` · ${ep.duracao}`}
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          {titulo}
        </h1>
        {convidados.length > 0 && (
          <p className="mt-2 text-muted">
            com <span className="text-foreground">{convidados.join(", ")}</span>
          </p>
        )}
        {ep.link_youtube && (
          <a
            href={ep.link_youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 border border-border hover:bg-card-hover text-sm font-medium rounded-full transition-colors"
          >
            <IconePlay />
            Episódio completo no YouTube
          </a>
        )}
        </div>
      </header>

      {/* Os livros vêm antes de tudo que é texto: é o que o site tem de
          próprio, e no fim da página ninguém chegava neles. */}
      <Estante
        prateleiras={[
          {
            titulo: `Livros citados neste episódio`,
            subtitulo:
              livros.length === 1
                ? "Toque no livro pra ver o que foi dito, ou no minuto pra ouvir."
                : `${livros.length} livros, na ordem em que aparecem na conversa.`,
            livros: livros.map((l) => ({
              id: l.id,
              slug: l.slug,
              titulo: l.titulo,
              autor: l.autor,
              capa_url: l.capa_url,
              rotulo: l.quem_citou ? `citado por ${l.quem_citou}` : (l.autor ?? ""),
              minuto:
                l.timestamp_seg != null && ep.link_youtube
                  ? {
                      href: noMinuto(l.timestamp_seg),
                      texto: formatTimestamp(l.timestamp_seg),
                    }
                  : undefined,
            })),
          },
        ]}
      />

      {/* Quem são os convidados, quando a extração trouxe a apresentação */}
      {apresentacoes.length > 0 && (
        <section className="mb-10">
          <Rotulo>Quem está na conversa</Rotulo>
          <div className="flex flex-col gap-3">
            {apresentacoes.map((c) => (
              <p key={c.nome} className="leading-relaxed">
                <span className="font-semibold">{c.nome}</span>
                {c.descricao && <span className="text-muted"> — {c.descricao}</span>}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Insight + Ação */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="md:col-span-3 bg-card border border-border rounded-2xl p-6 sm:p-7">
          <Rotulo>Principal insight</Rotulo>
          <p className="font-serif text-xl leading-snug text-foreground">
            {ep.main_insight}
          </p>
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded-2xl p-6 sm:p-7">
          <Rotulo>Pra fazer hoje</Rotulo>
          <p className="text-[15px] text-foreground/80 leading-relaxed">
            {ep.main_action}
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-7 mb-12">
        <Rotulo>Resumo</Rotulo>
        <p className="text-[15px] text-foreground/80 leading-relaxed whitespace-pre-line">
          {ep.resumo}
        </p>
      </div>

      {/* Falas */}
      {frases.length > 0 && (
        <section className="mb-12">
          <Rotulo>Falas do episódio</Rotulo>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {frases.map((f, i) => (
              <figure
                key={i}
                className="flex flex-col p-6 bg-card border border-border rounded-2xl"
              >
                <blockquote className="font-serif text-lg leading-snug text-foreground">
                  “{f.texto}”
                </blockquote>
                <figcaption className="flex items-center justify-between gap-3 mt-auto pt-4">
                  <span className="text-sm font-semibold">
                    {f.quem ? `— ${f.quem}` : ""}
                  </span>
                  {f.timestamp_seg != null && ep.link_youtube && (
                    <a
                      href={noMinuto(f.timestamp_seg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-sm text-accent-light hover:text-accent font-semibold"
                    >
                      <IconePlay />
                      {formatTimestamp(f.timestamp_seg)}
                    </a>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Capítulos (ou tópicos, nos episódios antigos) */}
      <div className="max-w-2xl">
        {capitulos.length > 0 ? (
          <section>
            <Rotulo>Capítulos</Rotulo>
            <ol className="divide-y divide-border border-y border-border">
              {capitulos.map((c, i) => {
                const conteudo = (
                  <>
                    <span className="font-mono text-sm text-accent-light font-semibold w-14 shrink-0">
                      {c.timestamp_seg != null ? formatTimestamp(c.timestamp_seg) : "—"}
                    </span>
                    <span className="text-sm leading-snug group-hover:underline">
                      {c.titulo}
                    </span>
                  </>
                );
                return (
                  <li key={i}>
                    {c.timestamp_seg != null && ep.link_youtube ? (
                      <a
                        href={noMinuto(c.timestamp_seg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-baseline gap-3 py-3"
                      >
                        {conteudo}
                      </a>
                    ) : (
                      <div className="flex items-baseline gap-3 py-3">{conteudo}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          (ep.topicos ?? []).length > 0 && (
            <section>
              <Rotulo>Tópicos abordados</Rotulo>
              <ol className="divide-y divide-border border-y border-border">
                {(ep.topicos ?? []).map((t: string, i: number) => (
                  <li key={i} className="flex items-baseline gap-3 py-3">
                    <span className="font-mono text-xs text-muted w-6 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-snug">{t}</span>
                  </li>
                ))}
              </ol>
            </section>
          )
        )}

      </div>
    </div>
    </div>
  );
}
