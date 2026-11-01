import Link from "next/link";
import CapaPodcast from "./CapaPodcast";
import SeloEstante from "./SeloEstante";
import { ESTANTES, estantesDoMenu, type EstanteDoMenu } from "@/lib/podcasts";

const VISIVEL = "group-hover:visible group-hover:opacity-100 group-hover:translate-y-0";
// Teclado abre com o foco: focus-visible, porque o foco comum fica no link
// depois do clique e deixaria o menu aberto sobre a página nova.
const VISIVEL_NO_FOCO =
  "group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:translate-y-0";

/**
 * "Estantes" no menu: o link leva à lista na home, e no computador o hover
 * abre as estantes com a capa de cada podcast. No celular não há hover, então
 * o toque só segue o link. CSS puro: sem JavaScript o menu continua igual.
 */
export default async function MenuEstantes() {
  // Falha aqui não pode derrubar o site inteiro: sobra o link.
  const estantes: EstanteDoMenu[] = await estantesDoMenu().catch(() => []);

  return (
    <div className="group relative">
      <Link
        href={ESTANTES}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground group-hover:text-foreground transition-colors"
      >
        Estantes
        {estantes.length > 0 && (
          <svg
            className="hidden [@media(hover:hover)]:block w-3 h-3 transition-transform group-hover:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
          </svg>
        )}
      </Link>

      {estantes.length > 0 && (
        // pt-2 em vez de margem: sem vão, o mouse não perde o hover no caminho
        <div
          className={`absolute right-0 top-full z-50 pt-2 w-72 invisible opacity-0 translate-y-1 transition duration-150 ${VISIVEL} ${VISIVEL_NO_FOCO}`}
        >
          <ul className="p-2 bg-card border border-border rounded-2xl shadow-[0_20px_50px_-20px_rgba(43,37,33,0.45)]">
            {estantes.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/podcast/${e.slug}`}
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
        </div>
      )}
    </div>
  );
}
