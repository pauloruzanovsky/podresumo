"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import BookCover from "./BookCover";
import Compartilhar from "./Compartilhar";
import { hrefEpisodio, hrefFala, hrefLivro } from "@/lib/links";
import { formatTimestamp } from "@/lib/tempo";

/**
 * O baralho de citações da home: falas literais de recomendação, uma por
 * livro, empilhadas como cartas. A de cima é a citação do dia. No celular a
 * pessoa arrasta a carta com o dedo; no computador, as setas (do botão ou do
 * teclado) ou o mouse. É o diferencial do site, a fala e o minuto, em forma
 * de brincadeira: o "Ouvir o trecho" toca no player embutido, como todo link
 * de minuto.
 *
 * Sem JavaScript fica só a carta de cima, e as setas nem aparecem. Poses e
 * cores em globals.css (`.carta`).
 */
export interface Destaque {
  citacao: string;
  quem: string | null;
  segundo: number;
  linkYoutube: string;
  livro: { id: string; slug: string | null; titulo: string; autor: string | null; capaUrl: string | null };
  episodio: { id: string; slug: string | null; numero: string | null; titulo: string };
}

// Arrasto: passa a carta depois de 90px, ou antes disso num gesto rápido.
const DISTANCIA_PASSA = 90;
const VELOCIDADE_PASSA = 0.5;

/** A carta jogada pra fora da mesa, do lado `lado` (1 direita, -1 esquerda). */
const foraDaMesa = (lado: number) => `translate(${lado * 115}%, -6%) rotate(${lado * 16}deg)`;

interface Arrasto {
  id: number;
  x: number;
  y: number;
  t: number;
  dx: number;
  ativo: boolean;
}

export default function BaralhoCitacoes({
  falas,
  titulo,
  busca,
}: {
  falas: Destaque[];
  /** O título da home, acima da carta no celular e à esquerda no computador. */
  titulo: ReactNode;
  /** A busca, logo abaixo do título. */
  busca: ReactNode;
}) {
  const [topo, setTopo] = useState(0);
  const [pronto, setPronto] = useState(false);
  const mesa = useRef<HTMLDivElement>(null);
  const cartas = useRef<(HTMLElement | null)[]>([]);
  const arrasto = useRef<Arrasto | null>(null);
  const acabouDeArrastar = useRef(false);
  const n = falas.length;

  useEffect(() => setPronto(true), []);

  function voar(carta: HTMLElement, quadros: Keyframe[], curva: string) {
    carta.style.transition = "none";
    carta.classList.add("voando");
    const voo = carta.animate(quadros, { duration: 520, easing: curva });
    voo.onfinish = voo.oncancel = () => {
      carta.classList.remove("voando");
      carta.style.transition = "";
    };
  }

  function passar(direcao: 1 | -1, lado: number = direcao) {
    const atual = cartas.current[topo];
    const seguinte = (topo + direcao + n) % n;
    if (!atual) return;
    const pose = getComputedStyle(atual).transform;
    atual.style.transform = "";
    setTopo(seguinte);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (direcao === 1) {
      voar(
        atual,
        [
          { transform: pose, opacity: 1, zIndex: 9 },
          { transform: foraDaMesa(lado), opacity: 0, zIndex: 9 },
        ],
        "cubic-bezier(.4,0,.7,1)"
      );
    } else {
      const volta = cartas.current[seguinte];
      if (!volta) return;
      voar(
        volta,
        [
          { transform: foraDaMesa(-1), opacity: 0, zIndex: 9 },
          { transform: "rotate(-1.5deg)", opacity: 1, zIndex: 9 },
        ],
        "cubic-bezier(.2,.8,.2,1)"
      );
    }
  }

  function aoApertar(ev: PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0 || !(ev.target as Element).closest("[data-profundidade='0']")) return;
    arrasto.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: ev.timeStamp, dx: 0, ativo: false };
  }

  function aoMover(ev: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    const carta = cartas.current[topo];
    if (!a || ev.pointerId !== a.id || !carta) return;
    const dx = ev.clientX - a.x;
    const dy = ev.clientY - a.y;
    if (!a.ativo) {
      // gesto mais vertical que horizontal é rolagem da página, não da carta
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      a.ativo = true;
      mesa.current?.setPointerCapture(ev.pointerId);
      mesa.current?.classList.add("arrastando");
      carta.style.transition = "none";
    }
    a.dx = dx;
    carta.style.transform = `translate(${dx}px, ${dy * 0.15}px) rotate(${-1.5 + dx * 0.05}deg)`;
  }

  function aoSoltar(ev: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a || ev.pointerId !== a.id) return;
    arrasto.current = null;
    if (!a.ativo) return;
    acabouDeArrastar.current = true;
    setTimeout(() => (acabouDeArrastar.current = false));
    mesa.current?.classList.remove("arrastando");
    const velocidade = Math.abs(a.dx) / Math.max(1, ev.timeStamp - a.t);
    if (ev.type === "pointerup" && (Math.abs(a.dx) > DISTANCIA_PASSA || velocidade > VELOCIDADE_PASSA)) {
      passar(1, Math.sign(a.dx) || 1);
      return;
    }
    const carta = cartas.current[topo];
    if (carta) {
      carta.style.transition = "";
      carta.style.transform = "";
    }
  }

  return (
    <section
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-14 gap-y-4 sm:gap-y-6"
      aria-label="Citações dos episódios"
    >
      {/* No celular a ordem é título, busca, carta: a busca é a ação de quem
          já sabe o que quer, e a carta vem logo depois, ainda na primeira
          tela. No computador o título e a busca dividem a coluna da
          esquerda e a carta ocupa a da direita. */}
      <div className="lg:self-end flex flex-col gap-5 lg:gap-6">
        {titulo}
        {/* o bloco dá a largura: direto no flex, o mx-auto da busca a encolhia */}
        <div className="w-full">{busca}</div>
      </div>

      <div
        ref={mesa}
        className="baralho lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center"
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDragStart={(ev) => ev.preventDefault()}
        onClickCapture={(ev) => {
          // o fim do arrasto não pode valer como clique no botão ou no livro
          if (acabouDeArrastar.current) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        }}
      >
        {falas.map((d, i) => {
          const profundidade = (i - topo + n) % n;
          return (
            <article
              key={`${d.episodio.id}-${d.livro.id}`}
              ref={(el) => {
                cartas.current[i] = el;
              }}
              className="carta"
              data-profundidade={profundidade}
              data-tom={i % 3}
              data-tamanho={d.citacao.length < 110 ? "curta" : d.citacao.length < 160 ? "media" : "longa"}
              inert={profundidade !== 0}
            >
              <div>
                {i === 0 && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-4">
                    A citação do dia
                  </p>
                )}
                <blockquote className="font-serif tracking-tight">“{d.citacao}”</blockquote>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <Link href={hrefLivro(d.livro)} className="shrink-0">
                    <BookCover
                      titulo={d.livro.titulo}
                      autor={d.livro.autor}
                      capaUrl={d.livro.capaUrl}
                      carregar={profundidade < 3 ? "eager" : "lazy"}
                      className="w-11 shadow-[0_6px_14px_-6px_rgba(43,37,33,0.6)]"
                    />
                  </Link>
                  <p className="min-w-0 text-sm leading-snug">
                    {d.quem && <span className="block font-semibold truncate">{d.quem}</span>}
                    <span className="text-muted">
                      sobre{" "}
                      <Link
                        href={hrefLivro(d.livro)}
                        className="italic underline underline-offset-2 hover:text-foreground"
                      >
                        {d.livro.titulo}
                      </Link>
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-5">
                  <a
                    href={`${d.linkYoutube}&t=${d.segundo}s`}
                    data-trecho={`${d.livro.titulo} — ${d.quem ?? "trecho"}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 whitespace-nowrap bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold rounded-full transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Ouvir o trecho
                    <span className="font-mono font-normal opacity-90">{formatTimestamp(d.segundo)}</span>
                  </a>
                  <Compartilhar
                    caminho={hrefFala(d.episodio, d.livro)}
                    titulo={`${d.quem ? `${d.quem} sobre` : "Sobre"} ${d.livro.titulo}`}
                    rotulo="Compartilhar esta fala"
                  />
                </div>
                <Link
                  href={hrefEpisodio(d.episodio)}
                  className="block mt-3 text-xs text-muted hover:text-foreground leading-snug line-clamp-2"
                >
                  {d.episodio.numero && <span className="font-mono mr-1.5">#{d.episodio.numero}</span>}
                  {d.episodio.titulo}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Setas
        className="flex justify-center lg:justify-start lg:self-start"
        visivel={pronto && n > 1}
        posicao={topo + 1}
        total={n}
        aoPassar={passar}
      />
    </section>
  );
}

function Setas({
  visivel,
  posicao,
  total,
  aoPassar,
  className,
}: {
  visivel: boolean;
  posicao: number;
  total: number;
  aoPassar: (direcao: 1 | -1) => void;
  className: string;
}) {
  const botao =
    "grid place-items-center w-11 h-11 rounded-xl bg-card border border-border text-foreground hover:bg-card-hover active:scale-95 transition";
  return (
    <div
      className={`${className} items-center gap-2.5 ${visivel ? "" : "invisible"}`}
      onKeyDown={(ev) => {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        aoPassar(ev.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <button type="button" className={botao} onClick={() => aoPassar(-1)} aria-label="Citação anterior">
        <Seta d="M19 12H5m6-6-6 6 6 6" />
      </button>
      <button type="button" className={botao} onClick={() => aoPassar(1)} aria-label="Próxima citação">
        <Seta d="M5 12h14m-6-6 6 6-6 6" />
      </button>
      <span className="ml-2 text-sm text-muted tabular-nums" aria-live="polite">
        <span className="font-medium text-foreground">{posicao}</span> de {total}
      </span>
    </div>
  );
}

function Seta({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}
