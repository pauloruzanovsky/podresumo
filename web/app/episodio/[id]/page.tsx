import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getAmazonLink(titulo: string) {
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(titulo)}`;
}

export default async function EpisodioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: ep, error } = await supabase
    .from("episodes")
    .select("*, episode_livros(livro_id, livros(titulo, autor))")
    .eq("id", id)
    .single();

  if (error || !ep) return notFound();

  const livros = (ep.episode_livros ?? []).map(
    (rel: { livros: { titulo: string; autor: string } }) => ({
      titulo: rel.livros.titulo,
      autor: rel.livros.autor,
    })
  );

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent-light transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      {/* Hero */}
      {ep.thumbnail && (
        <div className="relative w-full h-56 sm:h-72 md:h-80 rounded-2xl overflow-hidden mb-8">
          <Image
            src={ep.thumbnail}
            alt={ep.titulo}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 860px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-xs text-white font-bold px-2.5 py-1 bg-accent rounded-md">
                {ep.ep_number ? `#${ep.ep_number}` : "EP"}
              </span>
              <span className="text-sm text-white/50">
                {formatDate(ep.data)} · {ep.duracao}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white leading-snug">
              {ep.titulo}
            </h1>
          </div>
        </div>
      )}

      {!ep.thumbnail && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs text-white font-bold px-2.5 py-1 bg-accent rounded-md">
              {ep.ep_number ? `#${ep.ep_number}` : "EP"}
            </span>
            <span className="text-sm text-muted">
              {formatDate(ep.data)} · {ep.duracao}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {ep.titulo}
          </h1>
        </div>
      )}

      {/* Guests + Tags */}
      <div className="flex gap-2 flex-wrap mb-8">
        {(ep.convidados ?? []).map((c: string) => (
          <span
            key={c}
            className="px-3 py-1.5 rounded-full bg-accent/15 border border-accent/25 text-accent-light text-sm font-medium"
          >
            {c}
          </span>
        ))}
        {(ep.tags ?? []).slice(0, 6).map((tag: string) => (
          <span
            key={tag}
            className="px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* YouTube */}
      {ep.link_youtube && (
        <div className="mb-6">
          <a
            href={ep.link_youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500/10 border border-red-500/15 rounded-xl text-red-400 text-sm font-medium hover:bg-red-500/15 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            Assistir no YouTube
          </a>
        </div>
      )}

      {/* Insight + Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-accent/[0.08] border border-accent/20 rounded-2xl p-6">
          <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-3">
            Principal Insight
          </h2>
          <p className="text-[15px] font-medium text-foreground leading-relaxed">
            {ep.main_insight}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-3">
            Ação Recomendada
          </h2>
          <p className="text-[15px] text-foreground/80 leading-relaxed">
            {ep.main_action}
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-3">
          Resumo
        </h2>
        <p className="text-sm text-muted leading-relaxed">{ep.resumo}</p>
      </div>

      {/* Tópicos + Livros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-4">
            Tópicos Abordados
          </h2>
          <div className="flex flex-col gap-2.5">
            {(ep.topicos ?? []).map((t: string, i: number) => (
              <div
                key={i}
                className="flex items-start gap-3 pb-2.5 border-b border-border last:border-0 last:pb-0"
              >
                <span className="font-mono text-[11px] text-accent/40 font-semibold min-w-[20px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] text-muted leading-relaxed">
                  {t}
                </span>
              </div>
            ))}
          </div>
        </div>

        {livros.length > 0 && (
          <div>
            <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-4">
              Livros Citados ({livros.length})
            </h2>
            <div className="flex flex-col gap-3">
              {livros.map(
                (livro: { titulo: string; autor: string }, i: number) => (
                  <a
                    key={i}
                    href={getAmazonLink(livro.titulo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-accent/25 transition-all group"
                  >
                    <div>
                      <div className="text-sm font-semibold text-foreground group-hover:text-accent-light transition-colors">
                        {livro.titulo}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{livro.autor}</div>
                    </div>
                    <span className="text-[11px] font-mono text-accent-light font-semibold px-2.5 py-1 bg-accent/10 rounded-md whitespace-nowrap">
                      AMAZON
                    </span>
                  </a>
                )
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
