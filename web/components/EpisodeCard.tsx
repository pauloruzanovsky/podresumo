import Link from "next/link";
import Image from "next/image";

interface EpisodeCardProps {
  episode: {
    id: string;
    ep_number?: string;
    titulo: string;
    data: string;
    duracao: string;
    thumbnail: string;
    resumo: string;
    main_insight: string;
    tags: string[];
    podcast: string;
    livros: { titulo: string; autor: string }[];
  };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function EpisodeCard({ episode }: EpisodeCardProps) {
  return (
    <Link href={`/episodio/${episode.id}`}>
      <div className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/30 transition-all duration-300 cursor-pointer hover:shadow-[0_0_30px_rgba(64,138,113,0.06)]">
        {/* Thumbnail */}
        {episode.thumbnail && (
          <div className="relative w-full h-44 overflow-hidden">
            <Image
              src={episode.thumbnail}
              alt={episode.titulo}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
            {/* EP badge */}
            <div className="absolute top-3 left-3 bg-accent/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-[11px] font-mono text-white font-bold">
              {episode.ep_number ? `#${episode.ep_number}` : "EP"}
            </div>
            {/* Duration */}
            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-md text-[11px] font-mono text-white/80">
              {episode.duracao}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {/* Podcast + Date */}
          <div className="flex items-center gap-2 text-[11px] text-muted/60 font-mono">
            {episode.podcast && (
              <>
                <span className="text-accent-light/70">{episode.podcast}</span>
                <span>·</span>
              </>
            )}
            <span>{formatDate(episode.data)}</span>
          </div>

          {/* Title */}
          <h3 className="text-[15px] font-semibold text-foreground leading-snug mt-1.5 mb-2.5 group-hover:text-accent-light transition-colors line-clamp-2">
            {episode.titulo}
          </h3>

          {/* Resumo */}
          <p className="text-[13px] text-muted leading-relaxed mb-4 line-clamp-2">
            {episode.resumo}
          </p>

          {/* Insight highlight */}
          <div className="bg-accent/[0.08] border border-accent/15 rounded-lg px-3 py-2.5 mb-4">
            <p className="text-[12px] text-accent-light/80 leading-relaxed line-clamp-2">
              {episode.main_insight}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {(episode.tags ?? []).slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-accent/[0.06] text-muted text-[10px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
            {episode.livros.length > 0 && (
              <span className="text-[11px] text-muted/50 font-mono">
                {episode.livros.length} livro{episode.livros.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
