import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

/**
 * Cartão de compartilhamento (Open Graph), 1200×630 — o que aparece quando o
 * link é colado no WhatsApp. Um layout só pras três páginas que viajam: home,
 * estante do podcast e livro.
 *
 * Limites do renderizador (satori): só flexbox, todo <div> com mais de um
 * filho precisa de `display: flex`, e as cores vão escritas aqui porque as
 * variáveis do tema não existem fora do navegador.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const FUNDO = "#f7f2e8";
const TEXTO = "#2b2521";
const APAGADO = "#6b6155";
const VERDE = "#2f6b52";

/** Título longo quebra o cartão: corta com reticências. */
function encurta(texto: string, max: number) {
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + "…" : texto;
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
          <div style={{ display: "flex", fontWeight: 700 }}>
            <span>Pod</span>
            <span style={{ color: VERDE }}>{SITE_NAME.replace(/^Pod/, "")}</span>
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
