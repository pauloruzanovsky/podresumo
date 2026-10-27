"use client";

import { useEffect, useState } from "react";

/**
 * O trecho toca aqui mesmo. Todo link do site pro YouTube com minuto
 * (`watch?v=…&t=…s` — "Ouvir o trecho", minutos dos livros, falas e
 * capítulos) abre um player embutido, já no segundo certo, em vez de mandar a
 * pessoa embora do site.
 *
 * Funciona por delegação: um ouvinte só, no documento, pega o clique nesses
 * links. Nenhum link precisou mudar, e sem JavaScript (ou com Ctrl/Cmd,
 * botão do meio) ele continua abrindo o YouTube como antes.
 *
 * O título do player vem de `data-trecho` no link, quando houver; senão, do
 * texto do card em volta.
 */
interface Trecho {
  video: string;
  inicio: number;
  titulo: string;
  url: string;
}

function lerTrecho(a: HTMLAnchorElement): Trecho | null {
  let u: URL;
  try {
    u = new URL(a.href);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== "/watch") return null;
  const video = u.searchParams.get("v");
  const t = u.searchParams.get("t");
  if (!video || !t) return null;
  const inicio = parseInt(t, 10);
  if (!Number.isFinite(inicio)) return null;
  const titulo =
    a.dataset.trecho ||
    a.closest("article, figure, li")?.querySelector("blockquote, h3, [data-titulo]")?.textContent?.trim() ||
    "Trecho do episódio";
  return { video, inicio, titulo, url: a.href };
}

function minuto(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerTrecho() {
  const [trecho, setTrecho] = useState<Trecho | null>(null);

  useEffect(() => {
    function aoClicar(ev: MouseEvent) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const t = lerTrecho(a);
      if (!t) return;
      ev.preventDefault();
      setTrecho(t);
    }
    document.addEventListener("click", aoClicar);
    return () => document.removeEventListener("click", aoClicar);
  }, []);

  useEffect(() => {
    if (!trecho) return;
    const fechar = (ev: KeyboardEvent) => ev.key === "Escape" && setTrecho(null);
    document.addEventListener("keydown", fechar);
    return () => document.removeEventListener("keydown", fechar);
  }, [trecho]);

  if (!trecho) return null;

  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trecho.video)}?start=${trecho.inicio}&autoplay=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div
      role="dialog"
      aria-label="Trecho do episódio"
      className="player-entra fixed z-[60] inset-x-0 bottom-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px] bg-card border border-border sm:rounded-2xl rounded-t-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.45)] overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 pt-3 pb-2.5">
        <span className="relative mt-1.5 flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-chart opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-chart" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted tabular-nums">Tocando a partir de {minuto(trecho.inicio)}</p>
          <p className="text-sm font-medium leading-snug line-clamp-2">{trecho.titulo.replace(/^“|”$/g, "")}</p>
        </div>
        <a
          href={trecho.url}
          target="_blank"
          rel="noopener noreferrer"
          // abrir no YouTube não deve reabrir o player
          onClickCapture={(e) => e.stopPropagation()}
          className="shrink-0 mt-0.5 text-[11px] text-muted hover:text-foreground underline underline-offset-2"
        >
          YouTube ↗
        </a>
        <button
          type="button"
          onClick={() => setTrecho(null)}
          aria-label="Fechar o player"
          className="shrink-0 grid place-items-center w-7 h-7 -mr-1 rounded-full text-muted hover:text-foreground hover:bg-card-hover"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="relative aspect-video bg-black">
        <iframe
          key={`${trecho.video}-${trecho.inicio}`}
          src={src}
          title={trecho.titulo}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}
