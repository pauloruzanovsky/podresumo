import { ImageResponse } from "next/og";
import { COR_CREME, COR_VERDE } from "@/components/Logo";
import { iconeOg } from "@/lib/og";

/**
 * A figura do topo da newsletter, em PNG porque e-mail não mostra SVG. Em
 * 1200px de largura, o dobro do que aparece, pra ficar nítida em tela de
 * celular. Ícone e letras são desenhados aqui: nada de imagem ampliada.
 */
const TAMANHO = { width: 1200, height: 440 };

const TEMAS: Record<string, { fundo: string; texto: string }> = {
  verde: { fundo: COR_VERDE, texto: COR_CREME },
  creme: { fundo: COR_CREME, texto: COR_VERDE },
};

/** Pede ao Google só as letras do nome, em TTF: é o formato que o satori lê. */
async function fonteDoNome() {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=DM+Serif+Display&text=Podlibris"
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error("fonte do nome indisponível");
  return fetch(url).then((r) => r.arrayBuffer());
}

export async function GET(_req: Request, { params }: { params: Promise<{ tema: string }> }) {
  const tema = TEMAS[(await params).tema];
  if (!tema) return new Response("tema desconhecido", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: tema.fundo,
          color: tema.texto,
        }}
      >
        {iconeOg(190, tema.texto)}
        <div style={{ display: "flex", fontFamily: "Nome", fontSize: 128, lineHeight: 1.05, marginTop: 8 }}>
          Podlibris
        </div>
      </div>
    ),
    {
      ...TAMANHO,
      fonts: [{ name: "Nome", data: await fonteDoNome(), style: "normal", weight: 400 }],
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }
  );
}
