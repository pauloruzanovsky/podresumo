"use client";

interface PodcastFilterProps {
  podcasts: [string, number][];
  activePodcast: string | null;
  onToggle: (name: string) => void;
}

export default function PodcastFilter({ podcasts, activePodcast, onToggle }: PodcastFilterProps) {
  if (podcasts.length <= 1) return null;

  return (
    <div className="flex flex-nowrap sm:flex-wrap gap-2 mb-4 sm:mb-6 overflow-x-auto sm:overflow-visible tags-scroll -mx-1 px-1">
      {podcasts.map(([name, count]) => (
        <button
          key={name}
          onClick={() => onToggle(name)}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activePodcast === name
              ? "bg-foreground text-background"
              : "bg-card border border-border text-muted hover:text-foreground hover:border-foreground/20"
          }`}
        >
          {name}
          <span className="ml-1.5 text-[10px] opacity-50">{count}</span>
        </button>
      ))}
    </div>
  );
}
