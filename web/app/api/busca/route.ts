import { NextResponse } from "next/server";
import { buscarTudo, paraSugestoes } from "@/lib/busca";

/** As sugestões do campo de busca, enquanto a pessoa digita. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ sugestoes: [] });
  try {
    const sugestoes = paraSugestoes(await buscarTudo(q));
    return NextResponse.json(
      { sugestoes },
      // a mesma letra digitada por muita gente não refaz o trabalho; 1 dia porque
      // os dados só mudam com deploy, e deploy novo já zera o cache da Vercel
      { headers: { "Cache-Control": "public, s-maxage=86400" } }
    );
  } catch {
    return NextResponse.json({ sugestoes: [] }, { status: 503 });
  }
}
