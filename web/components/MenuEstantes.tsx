import Link from "next/link";
import MenuEstantesAberto from "./MenuEstantesAberto";
import { ESTANTES, estantesDoMenu, type EstanteDoMenu } from "@/lib/podcasts";

/**
 * "Estantes" no menu: abre as estantes com a capa de cada podcast, no toque
 * e no hover (MenuEstantesAberto). Aqui só se buscam os dados, no servidor.
 */
export default async function MenuEstantes() {
  // Falha aqui não pode derrubar o site inteiro: sobra o link.
  const estantes: EstanteDoMenu[] = await estantesDoMenu().catch(() => []);

  if (estantes.length === 0) {
    return (
      <Link
        href={ESTANTES}
        className="px-2 sm:px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
      >
        Estantes
      </Link>
    );
  }
  return <MenuEstantesAberto estantes={estantes} todas={ESTANTES} />;
}
