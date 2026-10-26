"use client";

import { useState } from "react";
import BookCover from "@/components/BookCover";

interface CapaRecente {
  id: string;
  titulo: string;
  autor: string | null;
  capaUrl: string | null;
}

/**
 * Inscrição na newsletter semanal (os livros novos citados na semana).
 *
 * "cartao": bloco com título, no meio do conteúdo (estante, livro).
 * "hero": faixa compacta logo abaixo da busca da home, com as capas dos
 *         livros mais recentes — mostra o que chega no e-mail.
 * "rodape": versão compacta, presente em todas as páginas.
 */
export default function Newsletter({
  variante = "cartao",
  capas = [],
}: {
  variante?: "cartao" | "hero" | "rodape";
  capas?: CapaRecente[];
}) {
  const [email, setEmail] = useState("");
  const [site, setSite] = useState(""); // armadilha pra robô
  const [estado, setEstado] = useState<"livre" | "enviando" | "ok" | "erro">("livre");
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro("");
    try {
      const r = await fetch("/api/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, site }),
      });
      const dados = await r.json().catch(() => ({}));
      if (r.ok && dados.ok) {
        setEstado("ok");
      } else {
        setEstado("erro");
        setErro(dados.erro ?? "Não deu pra inscrever agora. Tente de novo.");
      }
    } catch {
      setEstado("erro");
      setErro("Sem conexão. Tente de novo.");
    }
  }

  const rodape = variante === "rodape";
  const hero = variante === "hero";

  if (estado === "ok") {
    return (
      <div
        className={
          rodape
            ? "text-xs"
            : hero
              ? "bg-card border border-border rounded-2xl p-4 sm:p-5 text-left"
              : "bg-card border border-border rounded-2xl p-6 sm:p-7"
        }
      >
        <p
          className={
            rodape
              ? "text-foreground"
              : hero
                ? "font-serif text-lg font-semibold"
                : "font-serif text-xl font-semibold"
          }
        >
          Quase lá — confira seu e-mail.
        </p>
        <p className={`text-muted ${rodape ? "" : "text-sm mt-1"}`}>
          Mandamos um link de confirmação. A inscrição só vale depois do clique.
        </p>
      </div>
    );
  }

  const formulario = (
    // na faixa da home, sempre numa linha: a faixa precisa caber na primeira tela
    <form onSubmit={enviar} className={`flex ${hero ? "flex-row" : "flex-col sm:flex-row"} gap-2`}>
      <label className="sr-only" htmlFor={`email-${variante}`}>
        Seu e-mail
      </label>
      <input
        id={`email-${variante}`}
        type="email"
        required
        autoComplete="email"
        placeholder="seu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`flex-1 min-w-0 px-4 ${rodape ? "py-2 text-xs" : "py-2.5 text-sm"} bg-card border border-border rounded-full outline-none focus:border-foreground/30 placeholder:text-muted/50`}
      />
      {/* fora da tela: só robô preenche */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={site}
        onChange={(e) => setSite(e.target.value)}
        className="absolute -left-[9999px] w-px h-px"
      />
      <button
        type="submit"
        disabled={estado === "enviando"}
        className={`${rodape ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-sm"} bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-full transition-colors disabled:opacity-60 whitespace-nowrap`}
      >
        {estado === "enviando" ? "Enviando…" : "Quero receber"}
      </button>
    </form>
  );

  if (hero) {
    return (
      <section
        aria-label="Newsletter semanal"
        className="bg-card border border-border rounded-2xl p-4 sm:p-5 text-left"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 md:flex-1">
            {capas.length > 0 && (
              // capas sobrepostas, como livros recém-chegados na mesa
              <div className="flex shrink-0 -space-x-3" aria-hidden="true">
                {capas.slice(0, 3).map((l, i) => (
                  <BookCover
                    key={l.id}
                    titulo={l.titulo}
                    autor={l.autor}
                    capaUrl={l.capaUrl}
                    className={`w-9 sm:w-10 shadow-md ring-2 ring-card ${
                      i === 1 ? "-translate-y-1" : ""
                    }`}
                  />
                ))}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold leading-tight md:whitespace-nowrap">
                Os livros novos, toda semana
              </h2>
              <p className="text-xs sm:text-sm text-muted mt-0.5 leading-snug">
                Um e-mail por semana, com a fala de quem citou e o minuto pra ouvir.
              </p>
            </div>
          </div>
          <div className="md:w-80 shrink-0">{formulario}</div>
        </div>
        {estado === "erro" && <p className="text-sm text-erro mt-2" role="alert">{erro}</p>}
      </section>
    );
  }

  if (rodape) {
    return (
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold text-foreground mb-2">Os livros novos, toda semana</p>
        {formulario}
        {estado === "erro" && <p className="text-xs text-erro mt-1.5" role="alert">{erro}</p>}
      </div>
    );
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 my-12 sm:my-16">
      <div className="max-w-xl">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          Os livros novos, toda semana
        </h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Um e-mail por semana com os livros citados nos episódios novos — a fala
          de quem citou e o minuto pra ouvir. Sem spam; dá pra sair quando quiser.
        </p>
        <div className="mt-5">{formulario}</div>
        {estado === "erro" && <p className="text-sm text-erro mt-2" role="alert">{erro}</p>}
        <p className="text-[11px] text-muted mt-3">
          Ao se inscrever, você aceita receber esse e-mail semanal. Seu endereço
          não é compartilhado.
        </p>
      </div>
    </section>
  );
}
