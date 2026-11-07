"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * A capa clicada "voa" até o topo da página do livro (View Transitions API).
 *
 * Feito à mão em vez do <ViewTransition> do React porque o mesmo livro aparece
 * mais de uma vez na mesma tela (o mural repete as capas pra correr sem
 * emenda, rankings e estante se cruzam) e nome repetido cancela a transição.
 * Aqui só a capa tocada ganha o nome, na hora do clique.
 *
 * A troca espera a capa de destino existir, até TETO_MS: sem isso, quando a
 * página ainda não veio, a capa voaria pro esqueleto do loading.tsx. Enquanto
 * espera a tela fica parada, por isso o teto é curto (com 800 ms, livro ainda
 * fora do cache congelava mais de 1 s); passou dele, vira um fade pro
 * esqueleto, como era antes. Navegador
 * sem a API, clique com Ctrl/Cmd ou quem pediu menos movimento segue o
 * caminho normal do <Link>.
 */
const NOME = "capa-livro";
const TETO_MS = 300;

function esperarDestino(caminho: string): Promise<void> {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const olhar = () => {
      const chegou =
        window.location.pathname === caminho && document.querySelector("[data-capa-destino]");
      if (chegou || Date.now() - inicio > TETO_MS) resolve();
      else setTimeout(olhar, 16);
    };
    olhar();
  });
}

export default function TransicaoCapa() {
  const router = useRouter();

  useEffect(() => {
    if (!("startViewTransition" in document)) return;
    const poucoMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (poucoMovimento.matches) return;
      const link = (e.target as Element | null)?.closest?.("a[href^='/livro/']");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      const capa = link.querySelector<HTMLElement>("[data-capa]");
      if (!capa) return;
      const url = new URL(link.href);
      if (url.pathname === window.location.pathname) return;

      // capturado antes do onClick do <Link>, que vê o preventDefault e não navega
      e.preventDefault();

      // Na página de um livro, a capa do topo já tem o nome: tira, senão são
      // duas com o mesmo nome e o navegador desiste da transição.
      const atual = document.querySelector<HTMLElement>("[data-capa-destino]");
      if (atual) atual.style.viewTransitionName = "none";
      capa.style.viewTransitionName = NOME;

      document.startViewTransition(async () => {
        capa.style.viewTransitionName = "";
        router.push(url.pathname + url.search + url.hash);
        await esperarDestino(url.pathname);
      });
    }

    // O <Link> só pré-carrega até o loading.tsx nas páginas de livro (não são
    // montadas no build). Buscar a página inteira quando o dedo encosta ou o
    // mouse passa ganha o tempo até o clique e encurta a espera acima.
    const jaBuscados = new Set<string>();
    function adiantar(e: PointerEvent) {
      const link = (e.target as Element | null)?.closest?.("a[href^='/livro/']");
      if (!(link instanceof HTMLAnchorElement) || !link.querySelector("[data-capa]")) return;
      const caminho = new URL(link.href).pathname;
      if (jaBuscados.has(caminho)) return;
      jaBuscados.add(caminho);
      router.prefetch(caminho, { kind: "full" as never });
    }

    document.addEventListener("click", aoClicar, true);
    document.addEventListener("pointerdown", adiantar, true);
    document.addEventListener("pointerover", adiantar, true);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("pointerdown", adiantar, true);
      document.removeEventListener("pointerover", adiantar, true);
    };
  }, [router]);

  return null;
}
