"use client";

import { createContext, useContext, useState } from "react";

/**
 * O filtro da estante (busca, quem citou, categoria), compartilhado com a
 * linha do tempo, que fica fora dela, em largura inteira acima. A estante
 * continua dona do estado e publica aqui; a linha do tempo só lê.
 */
export interface Filtro {
  busca: string;
  pessoa: string;
  tema: string;
}

const VAZIO: Filtro = { busca: "", pessoa: "", tema: "" };

const Contexto = createContext<{ filtro: Filtro; publicar: (f: Filtro) => void }>({
  filtro: VAZIO,
  publicar: () => {},
});

export function FiltroProvider({ children }: { children: React.ReactNode }) {
  const [filtro, publicar] = useState<Filtro>(VAZIO);
  return <Contexto.Provider value={{ filtro, publicar }}>{children}</Contexto.Provider>;
}

export const useFiltro = () => useContext(Contexto);

/** O livro bate com a busca (título ou autor) e com a categoria. */
export function livroBate(
  l: { titulo: string; autor: string | null; temas: string[] },
  f: Pick<Filtro, "busca" | "tema">
) {
  const q = f.busca.trim().toLowerCase();
  return (
    (!q || l.titulo.toLowerCase().includes(q) || (l.autor?.toLowerCase().includes(q) ?? false)) &&
    (!f.tema || l.temas.includes(f.tema))
  );
}

export const filtrando = (f: Filtro) => Boolean(f.busca.trim() || f.pessoa || f.tema);
