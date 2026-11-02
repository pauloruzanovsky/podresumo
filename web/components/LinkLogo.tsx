"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * O logo do topo. Fora da home leva pra home; na home, o link pra mesma página
 * não fazia nada, e o natural é voltar pro começo dela.
 */
export default function LinkLogo({ className, children }: { className?: string; children: React.ReactNode }) {
  const pagina = usePathname();
  return (
    <Link
      href="/"
      className={className}
      onClick={(e) => {
        if (pagina !== "/") return;
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      {children}
    </Link>
  );
}
