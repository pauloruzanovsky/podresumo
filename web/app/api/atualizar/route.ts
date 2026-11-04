import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * O pipeline chama aqui depois de gravar livros novos (coleta do lote,
 * capas, fusão de duplicados). As páginas ficam 1 dia em cache; isto marca
 * todas como velhas, e a próxima visita de cada uma já mostra o livro novo.
 *
 * Configurar: ATUALIZAR_SEGREDO na Vercel e no pipeline/.env (mesmo valor).
 */
export async function POST(req: Request) {
  const segredo = process.env.ATUALIZAR_SEGREDO;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // os índices em unstable_cache (busca, pessoas, menu) e as páginas
  revalidateTag("dados", { expire: 0 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
