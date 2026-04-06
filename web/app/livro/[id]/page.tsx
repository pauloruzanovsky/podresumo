import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

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

function getAmazonLink(titulo: string) {
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(titulo)}`;
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
      "*, episode_livros(contexto, timestamp_seg, episode_id, episodes(titulo, ep_number, data, link_youtube))"
    )
    .eq("id", id)
    .single();

  if (error || !livro) return notFound();

  const citacoes = (livro.episode_livros ?? [])
    .map(
      (rel: {
        contexto: string | null;
        timestamp_seg: number | null;
        episode_id: string;
        episodes: {
          titulo: string;
          ep_number: string | null;
          data: string;
          link_youtube: string;
        };
      }) => ({
        contexto: rel.contexto,
        timestamp_seg: rel.timestamp_seg,
        episode_id: rel.episode_id,
        titulo: rel.episodes.titulo,
        ep_number: rel.episodes.ep_number,
        data: rel.episodes.data,
        link_youtube: rel.episodes.link_youtube,
      })
    )
    .sort(
      (a: { data: string }, b: { data: string }) =>
        new Date(b.data).getTime() - new Date(a.data).getTime()
    );

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/biblioteca"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent-light transition-colors mb-8"
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
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {livro.titulo}
        </h1>
        <p className="text-muted text-lg">{livro.autor}</p>

        <div className="flex items-center gap-4 mt-6">
          <span className="text-sm text-muted">
            Citado em{" "}
            <span className="font-semibold text-accent-light">
              {citacoes.length}
            </span>{" "}
            {citacoes.length === 1 ? "episódio" : "episódios"}
          </span>

          <a
            href={getAmazonLink(livro.titulo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent-light text-sm font-medium hover:bg-accent/15 transition-colors"
          >
            Buscar na Amazon
          </a>
        </div>
      </div>

      {/* Citações */}
      <h2 className="text-[11px] font-semibold text-accent-light uppercase tracking-widest mb-4">
        Episódios que citam este livro
      </h2>

      <div className="flex flex-col gap-4">
        {citacoes.map(
          (c: {
            episode_id: string;
            titulo: string;
            ep_number: string | null;
            data: string;
            link_youtube: string;
            contexto: string | null;
            timestamp_seg: number | null;
          }) => (
            <div
              key={c.episode_id}
              className="p-5 bg-card border border-border rounded-2xl"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <Link
                  href={`/episodio/${c.episode_id}`}
                  className="text-sm font-semibold text-foreground hover:text-accent-light transition-colors leading-snug"
                >
                  {c.ep_number && (
                    <span className="font-mono text-xs text-accent mr-2">
                      #{c.ep_number}
                    </span>
                  )}
                  {c.titulo}
                </Link>
                <span className="text-xs text-muted whitespace-nowrap">
                  {formatDate(c.data)}
                </span>
              </div>

              {c.contexto && (
                <p className="text-sm text-muted leading-relaxed">
                  {c.timestamp_seg != null ? (
                    <a
                      href={`${c.link_youtube}&t=${c.timestamp_seg}s`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-accent-light hover:text-accent font-semibold mr-2"
                    >
                      [{formatTimestamp(c.timestamp_seg)}]
                    </a>
                  ) : null}
                  {c.contexto}
                </p>
              )}

              {!c.contexto && c.timestamp_seg != null && (
                <a
                  href={`${c.link_youtube}&t=${c.timestamp_seg}s`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-accent-light hover:text-accent font-semibold"
                >
                  [{formatTimestamp(c.timestamp_seg)}]
                </a>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
