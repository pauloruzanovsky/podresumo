"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Sugestao } from "@/lib/busca";

const ESPERA_MS = 160;
const ID_LISTA = "sugestoes-busca";

/**
 * O campo de busca, com sugestões enquanto a pessoa digita (/api/busca). Enter
 * sem nada marcado abre a página de resultados, que mostra tudo; sem
 * JavaScript, o formulário faz o mesmo.
 */
export default function HomeSearch({ inicial = "" }: { inicial?: string }) {
  const [q, setQ] = useState(inicial);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [aberta, setAberta] = useState(false);
  const [marcada, setMarcada] = useState(-1);
  const router = useRouter();
  const pedido = useRef<AbortController | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  const mostrar = aberta && sugestoes.length > 0;

  // Na home o campo fica no pé da primeira tela: sobe, pra lista caber.
  useEffect(() => {
    const form = formulario.current;
    if (mostrar && form && form.getBoundingClientRect().top > window.innerHeight * 0.4) {
      form.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [mostrar]);

  useEffect(() => {
    const termo = q.trim();
    pedido.current?.abort();
    if (termo.length < 2) {
      setSugestoes([]);
      return;
    }
    const controle = new AbortController();
    pedido.current = controle;
    const relogio = setTimeout(async () => {
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`, { signal: controle.signal });
        if (!r.ok) return;
        const dados = await r.json();
        setSugestoes(dados.sugestoes);
        setMarcada(-1);
      } catch {
        // pedido cancelado por uma letra nova, ou rede fora: fica só o Enter
      }
    }, ESPERA_MS);
    return () => {
      clearTimeout(relogio);
      controle.abort();
    };
  }, [q]);

  function ir(href: string) {
    setAberta(false);
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (marcada >= 0 && sugestoes[marcada]) return ir(sugestoes[marcada].href);
    const query = q.trim();
    if (query) ir(`/busca?q=${encodeURIComponent(query)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // o navegador apagaria o texto do campo de busca junto
      e.preventDefault();
      setAberta(false);
      setMarcada(-1);
      return;
    }
    if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || sugestoes.length === 0) return;
    e.preventDefault();
    setAberta(true);
    // -1 é o próprio campo: as setas passam por ele ao dar a volta na lista
    const posicoes = sugestoes.length + 1;
    const passo = e.key === "ArrowDown" ? 1 : -1;
    setMarcada((m) => ((m + 1 + passo + posicoes) % posicoes) - 1);
  }

  return (
    <form
      ref={formulario}
      action="/busca"
      onSubmit={onSubmit}
      role="search"
      className="relative max-w-xl mx-auto text-left scroll-mt-20"
    >
      <svg
        className="absolute left-4 top-[1.15rem] w-4 h-4 text-muted/50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
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
        name="q"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={ID_LISTA}
        aria-autocomplete="list"
        aria-activedescendant={marcada >= 0 ? `${ID_LISTA}-${marcada}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        aria-label="Buscar livro, autor, convidado ou podcast"
        placeholder="Busque livro, autor, convidado, podcast..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAberta(true);
        }}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onKeyDown={onKeyDown}
        className="w-full pl-11 pr-4 py-3.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-foreground/30 transition-all [&::-webkit-search-cancel-button]:appearance-none"
      />

      {mostrar && (
        <ul
          id={ID_LISTA}
          role="listbox"
          // sem isto o clique tira o foco do campo, que fecha a lista antes
          // de o clique chegar na sugestão
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-40 left-0 right-0 top-full mt-2 p-1.5 max-h-[60vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-[0_20px_50px_-20px_rgba(43,37,33,0.45)]"
        >
          {sugestoes.map((s, i) => (
            <li
              key={`${s.tipo}-${s.href}`}
              id={`${ID_LISTA}-${i}`}
              role="option"
              aria-selected={i === marcada}
              onClick={() => ir(s.href)}
              // mouse movido de verdade: a página sobe ao abrir a lista, e o
              // ponteiro parado não pode marcar uma sugestão pro Enter
              onMouseMove={() => setMarcada(i)}
              className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer ${i === marcada ? "bg-card-hover" : ""}`}
            >
              <Miniatura s={s} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{s.titulo}</span>
                <span className="block text-xs text-muted truncate">{s.detalhe}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">{s.tipo}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Miniatura({ s }: { s: Sugestao }) {
  const caixa = "shrink-0 bg-card-hover";
  if (s.formato === "livro") {
    const livro = `${caixa} w-7 h-10 mx-1.5 rounded`;
    // sem capa fica a lombada vazia: a coluna segue alinhada
    return s.capa ? <img src={s.capa} alt="" className={`${livro} object-cover`} /> : <span className={livro} aria-hidden="true" />;
  }
  if (s.formato === "quadrada" && s.capa) {
    return <img src={s.capa} alt="" className={`${caixa} w-10 h-10 rounded-lg object-cover`} />;
  }
  return (
    <span className={`${caixa} grid place-items-center w-10 h-10 rounded-full text-xs font-semibold text-muted`} aria-hidden="true">
      {s.tipo === "Pessoa" ? s.titulo.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() : "▶"}
    </span>
  );
}
