"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ESTANTES } from "@/lib/podcasts";

export default function HomeSearch({ inicial = "" }: { inicial?: string }) {
  const [q, setQ] = useState(inicial);
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    // a busca cobre todas as estantes (lib/busca)
    router.push(query ? `/busca?q=${encodeURIComponent(query)}` : ESTANTES);
  }

  return (
    <form onSubmit={onSubmit} className="relative max-w-xl mx-auto">
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        enterKeyHint="search"
        aria-label="Buscar livro ou autor"
        placeholder="Buscar livro ou autor..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full pl-11 pr-4 py-3.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-foreground/30 transition-all"
      />
    </form>
  );
}
