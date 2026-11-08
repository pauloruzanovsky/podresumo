import { carregarEmComum } from "@/lib/emComum";
import { capaOg, cartaoComCapas, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Os livros que todo mundo cita nos podcasts";
// cartão só muda com deploy novo (ver lib/dados.ts)
export const revalidate = false;

/** "Os livros que todo mundo cita", com as capas dos três primeiros. */
export default async function Image() {
  const { livros, podcasts } = await carregarEmComum();
  const emTodos = livros.filter((l) => l.falas.length === podcasts);
  const capas = (
    await Promise.all(livros.slice(0, 3).map((l) => (l.capaUrl ? capaOg(l.capaUrl) : null)))
  ).filter((c): c is string => Boolean(c));
  return cartaoComCapas({
    rotulo: `Os ${podcasts} podcasts, cruzados`,
    texto: "Os livros que todo mundo cita",
    linha: `${emTodos.length} em todos os ${podcasts}, ${livros.length} em mais de um`,
    capas,
    rodape: "Com a fala de cada programa e o minuto exato",
  });
}
