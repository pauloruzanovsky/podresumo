import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";
import { COR_CREME, COR_OURO, COR_VERDE, LIVRO_D, ONDAS } from "@/components/Logo";

/**
 * Cartão de compartilhamento (Open Graph), 1200×630 — o que aparece quando o
 * link é colado no WhatsApp. `cartaoOg` serve home, estante do podcast e
 * livro; `cartaoComCapas`, a fala e o episódio.
 *
 * Limites do renderizador (satori): só flexbox, todo <div> com mais de um
 * filho precisa de `display: flex`, e as cores vão escritas aqui porque as
 * variáveis do tema não existem fora do navegador.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const FUNDO = COR_CREME;
const TEXTO = "#2b2521";
const APAGADO = "#6b6155";
const VERDE = COR_VERDE;

/** O ícone da marca em SVG puro (o satori não lê componentes com className). */
export function iconeOg(largura: number, ondas: string = COR_VERDE) {
  return (
    <svg width={largura} height={(largura * 76) / 100} viewBox="0 0 100 76">
      {ONDAS.map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width={6.4} height={h} rx={3.2} fill={ondas} />
      ))}
      <path fill={COR_OURO} d={LIVRO_D} />
    </svg>
  );
}

/** Título longo quebra o cartão: corta com reticências. */
function encurta(texto: string, max: number) {
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + "…" : texto;
}

/**
 * Baixa a capa e devolve como data URL. O satori derruba o cartão inteiro se a
 * imagem falhar ou vier em formato que ele não lê (webp), e a capa que falta
 * no Open Library volta como gif de 1px: nesses casos o cartão sai sem ela.
 */
export async function capaOg(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !/image\/(jpe?g|png)/.test(tipo)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Cartão da fala e do episódio: o texto é o destaque, com capas à direita. */
export function cartaoComCapas({
  rotulo,
  texto,
  linha,
  capas,
  rodape,
}: {
  rotulo: string;
  texto: string;
  /** Linha menor abaixo do texto ("sobre O Investidor de Bom Senso"). */
  linha?: string;
  /** Data URLs de capaOg; a primeira fica na frente. */
  capas: string[];
  rodape?: string;
}) {
  const tamanhoTexto = texto.length > 150 ? 42 : texto.length > 90 ? 50 : 60;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: FUNDO,
          color: TEXTO,
          padding: "56px 64px",
          borderLeft: `20px solid ${VERDE}`,
        }}
      >
        <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: APAGADO,
                marginBottom: 22,
              }}
            >
              {encurta(rotulo, 40)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: tamanhoTexto,
                fontWeight: 700,
                lineHeight: 1.18,
                letterSpacing: -1,
              }}
            >
              {encurta(texto, 230)}
            </div>
            {linha && (
              <div style={{ display: "flex", fontSize: 30, color: APAGADO, marginTop: 22 }}>
                {encurta(linha, 60)}
              </div>
            )}
          </div>

          {capas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "row-reverse", flexShrink: 0 }}>
              {[...capas].reverse().map((capa, i) => (
                <img
                  key={i}
                  src={capa}
                  width={230}
                  height={345}
                  style={{
                    objectFit: "contain",
                    marginRight: i === 0 ? 0 : -150,
                    boxShadow: "0 18px 36px rgba(43,37,33,0.35)",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontWeight: 700, color: VERDE }}>
            {iconeOg(56)}
            <span>{SITE_NAME}</span>
          </div>
          {rodape && <div style={{ display: "flex", color: APAGADO }}>{rodape}</div>}
        </div>
      </div>
    ),
    OG_SIZE
  );
}

export function cartaoOg({
  rotulo,
  titulo,
  subtitulo,
  citacao,
  rodape,
}: {
  /** Linha pequena acima do título ("A estante de"). */
  rotulo?: string;
  titulo: string;
  subtitulo?: string;
  /** Fala de quem citou; quando existe, vira o destaque do cartão. */
  citacao?: { texto: string; quem?: string | null };
  /** Linha de baixo, ao lado do nome do site. */
  rodape?: string;
}) {
  const tamanhoTitulo = titulo.length > 38 ? 64 : titulo.length > 22 ? 78 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: FUNDO,
          color: TEXTO,
          padding: "64px 72px",
          borderLeft: `20px solid ${VERDE}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rotulo && (
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: APAGADO,
                marginBottom: 18,
              }}
            >
              {rotulo}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: tamanhoTitulo,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            {encurta(titulo, 70)}
          </div>
          {subtitulo && (
            <div
              style={{
                display: "flex",
                fontSize: 36,
                color: APAGADO,
                marginTop: 20,
                lineHeight: 1.3,
              }}
            >
              {encurta(subtitulo, 90)}
            </div>
          )}
        </div>

        {citacao && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderLeft: `6px solid ${VERDE}`,
              paddingLeft: 28,
            }}
          >
            <div style={{ display: "flex", fontSize: 34, lineHeight: 1.35 }}>
              “{encurta(citacao.texto, 190)}”
            </div>
            {citacao.quem && (
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 700,
                  marginTop: 14,
                }}
              >
                — {citacao.quem}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontWeight: 700, color: VERDE }}>
            {iconeOg(56)}
            <span>{SITE_NAME}</span>
          </div>
          {rodape && (
            <div style={{ display: "flex", color: APAGADO }}>{rodape}</div>
          )}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
