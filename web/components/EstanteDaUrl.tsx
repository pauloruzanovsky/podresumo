"use client";

import { useSearchParams } from "next/navigation";
import EstanteFiltravel, { type LivroEstante } from "./EstanteFiltravel";

/**
 * A estante lendo o filtro da URL (?q=, ?pessoa=) no navegador.
 *
 * Ler no servidor obrigava a página inteira a ser montada a cada visita —
 * ~3 s na Vercel, sem cache nenhum. Lendo aqui, a página vira estática e
 * fica em cache; o filtro é aplicado depois que ela chega.
 *
 * A `key` remonta a estante quando os links do placar trocam o filtro, em
 * vez de manter o estado anterior.
 */
export default function EstanteDaUrl({
  livros,
  totalCitacoes,
}: {
  livros: LivroEstante[];
  totalCitacoes: number;
}) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const pessoa = params.get("pessoa") ?? "";
  return (
    <EstanteFiltravel
      key={`${q}|${pessoa}`}
      livros={livros}
      totalCitacoes={totalCitacoes}
      initialQuery={q}
      initialPessoa={pessoa}
    />
  );
}
