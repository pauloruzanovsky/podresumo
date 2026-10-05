import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

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
    alternates: { canonical: `/episodio/${id}` },
    openGraph: {
      type: "article",
      title: ep.titulo,
      description: descricao,
      url: `/episodio/${id}`,
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

function formatTimestamp(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const sec = seg % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
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
  titulo: string;
  autor: string | null;
  capa_url: string | null;
  natureza: string | null;
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
  const { id } = await params;

  const { data: ep, error } = await supabase
    .from("episodes")
    .select(
      "*, episode_livros(natureza, livros(id, titulo, autor, tipo, capa_url))"
    )
    .eq("id", id)
    .single();

  if (error || !ep) return notFound();

  const livros: LivroCitado[] = ((ep.episode_livros ?? []) as any[])
    .filter((rel) => rel.livros && rel.livros.tipo === "livro")
    .map((rel) => ({
      id: rel.livros.id,
      titulo: rel.livros.titulo,
      autor: rel.livros.autor,
      capa_url: rel.livros.capa_url ?? null,
      natureza: rel.natureza ?? null,
    }))
    // recomendação primeiro
    .sort(
      (a, b) =>
        Number(b.natureza === "recomenda") - Number(a.natureza === "recomenda")
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
    <div className="max-w-4xl mx-auto">
      <Link
        href="/episodios"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Episódios
      </Link>

      {/* Hero */}
      {ep.thumbnail && (
        <div className="relative w-full h-56 sm:h-72 md:h-80 rounded-2xl overflow-hidden mb-8">
          <Image
            src={ep.thumbnail}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 860px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <p className="text-sm text-white/80 mb-2">
              {ep.ep_number && (
                <span className="font-mono font-semibold text-white mr-2">
                  #{ep.ep_number}
                </span>
              )}
              {formatDate(ep.data)} · {ep.duracao}
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white leading-snug">
              {titulo}
            </h1>
          </div>
        </div>
      )}

      {!ep.thumbnail && (
        <div className="mb-8">
          <p className="text-sm text-muted mb-2">
            {ep.ep_number && (
              <span className="font-mono font-semibold text-foreground mr-2">
                #{ep.ep_number}
              </span>
            )}
            {formatDate(ep.data)} · {ep.duracao}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{titulo}</h1>
        </div>
      )}

      {/* Convidados: com apresentação quando a extração trouxe; senão só os nomes */}
      {apresentacoes.length > 0 ? (
        <div className="mb-6 flex flex-col gap-3">
          {apresentacoes.map((c) => (
            <p key={c.nome} className="leading-relaxed">
              <span className="font-semibold">{c.nome}</span>
              {c.descricao && (
                <span className="text-muted"> — {c.descricao}</span>
              )}
            </p>
          ))}
        </div>
      ) : (
        convidados.length > 0 && (
          <p className="mb-6">
            <span className="text-muted">Com </span>
            <span className="font-semibold">{convidados.join(", ")}</span>
          </p>
        )
      )}

      <div className="flex items-center gap-2 flex-wrap mb-10">
        {ep.link_youtube && (
          <a
            href={ep.link_youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-full transition-colors mr-2"
          >
            <IconePlay />
            Assistir no YouTube
          </a>
        )}
        {(ep.tags ?? []).slice(0, 5).map((tag: string) => (
          <span
            key={tag}
            className="px-3 py-1.5 rounded-full border border-border text-xs text-muted"
          >
            {tag}
          </span>
        ))}
      </div>

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

      {/* Capítulos (ou tópicos, nos episódios antigos) + Livros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-12">
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

        {livros.length > 0 && (
          <section>
            <Rotulo>Livros citados ({livros.length})</Rotulo>
            <div className="flex flex-col gap-3">
              {livros.map((livro) => (
                <Link
                  key={livro.id}
                  href={`/livro/${livro.id}`}
                  className="group flex items-center gap-4 p-3 bg-card border border-border rounded-xl hover:bg-card-hover transition-colors"
                >
                  <BookCover
                    titulo={livro.titulo}
                    autor={livro.autor}
                    capaUrl={livro.capa_url}
                    className="w-11 shrink-0 shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug group-hover:underline line-clamp-2">
                      {livro.titulo}
                    </p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-1">
                      {livro.autor ?? "—"}
                    </p>
                  </div>
                  {livro.natureza === "recomenda" && (
                    <span className="px-2 py-0.5 rounded-full border border-accent/30 bg-accent/5 text-accent-light text-[11px] font-medium whitespace-nowrap">
                      Recomenda
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
