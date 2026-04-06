"use client";

interface PodcastFilterProps {
  podcasts: [string, number][];
  activePodcast: string | null;
  onToggle: (name: string) => void;
}

export default function PodcastFilter({ podcasts, activePodcast, onToggle }: PodcastFilterProps) {
  if (podcasts.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {podcasts.map(([name, count]) => (
        <button
          key={name}
          onClick={() => onToggle(name)}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activePodcast === name
              ? "bg-accent text-white shadow-[0_0_12px_rgba(64,138,113,0.3)]"
              : "bg-card border border-border text-muted hover:text-foreground hover:border-accent/30"
          }`}
        >
          {name}
          <span className="ml-1.5 text-[10px] opacity-50">{count}</span>
        </button>
      ))}
    </div>
  );
}
