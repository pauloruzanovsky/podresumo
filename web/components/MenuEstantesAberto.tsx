"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CapaPodcast from "./CapaPodcast";
import SeloEstante from "./SeloEstante";
import type { EstanteDoMenu } from "@/lib/podcasts";

const VISIVEL = "visible opacity-100 translate-y-0";
// No computador o hover continua abrindo; o toque abre e fecha pelo estado.
const VISIVEL_NO_HOVER =
  "[@media(hover:hover)]:group-hover:visible [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0";

/**
 * O "Estantes" do menu abre a lista de podcasts, no toque e no hover. Antes
 * era só um link pra /#estantes, que no celular não fazia nada na home
 * quando o endereço já terminava em #estantes: pro Next era o mesmo lugar.
 */
export default function MenuEstantesAberto({
  estantes,
  todas,
}: {
  estantes: EstanteDoMenu[];
  todas: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // De outra página, o Next rola até a âncora antes de a home lenta chegar
  // (acontece com o cache frio); quando ela chega, rola daqui.
  const rolarNaHome = useRef(false);

  // página nova fecha o menu
  useEffect(() => {
    setAberto(false);
    if (!rolarNaHome.current || pathname !== "/") return;
    rolarNaHome.current = false;
    // o endereço muda antes, ainda na tela de carregamento: espera a seção
    let tentativas = 0;
    const espera = setInterval(() => {
      const alvo = document.getElementById(todas.split("#")[1]);
      if (alvo) alvo.scrollIntoView({ block: "start" });
      if (alvo || ++tentativas > 100) clearInterval(espera);
    }, 100);
    return () => clearInterval(espera);
  }, [pathname, todas]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function irPraLista(e: React.MouseEvent) {
    setAberto(false);
    // na home o Next não rola até a âncora se o endereço não muda
    const alvo = pathname === "/" && document.getElementById(todas.split("#")[1]);
    if (alvo) {
      e.preventDefault();
      alvo.scrollIntoView({ block: "start" });
      history.replaceState(null, "", todas);
    } else {
      rolarNaHome.current = true;
    }
  }

  return (
    // No celular o painel se ancora no header (sem `relative` aqui) e ocupa
    // a largura da tela; do sm pra cima, fica preso ao botão.
    <div ref={raiz} className="group sm:relative">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="menu-estantes"
        onClick={() => setAberto((a) => !a)}
        className={`inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[13px] font-medium hover:text-foreground [@media(hover:hover)]:group-hover:text-foreground transition-colors ${aberto ? "text-foreground" : "text-muted"}`}
      >
        Estantes
        <svg
          className={`w-3 h-3 transition-transform [@media(hover:hover)]:group-hover:rotate-180 ${aberto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* pt-2 em vez de margem: sem vão, o mouse não perde o hover no caminho */}
      <div
        id="menu-estantes"
        className={`absolute inset-x-4 sm:inset-x-auto sm:right-0 top-full z-50 pt-2 sm:w-72 transition duration-150 ${aberto ? VISIVEL : `invisible opacity-0 translate-y-1 ${VISIVEL_NO_HOVER}`}`}
      >
        <div className="p-2 bg-card border border-border rounded-2xl shadow-[0_20px_50px_-20px_rgba(43,37,33,0.45)]">
          <ul>
            {estantes.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/podcast/${e.slug}`}
                  onClick={() => setAberto(false)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-card-hover transition-colors"
                >
                  <CapaPodcast capa={e.capa} className="w-11 rounded-lg shadow-sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{e.nome}</span>
                    <SeloEstante estante={e} className="mt-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={todas}
            onClick={irPraLista}
            className="block mt-1 pt-2.5 pb-1.5 border-t border-border text-center text-xs font-medium text-muted hover:text-foreground transition-colors"
          >
            Ver todas na página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
