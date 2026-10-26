import { ImageResponse } from "next/og";
import { iconeOg } from "@/lib/og";
import { COR_CREME, COR_VERDE } from "@/components/Logo";

/**
 * Ícone de quando alguém salva o site na tela inicial do celular. O iOS
 * arredonda os cantos sozinho, então aqui o fundo vai quadrado.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COR_VERDE,
        }}
      >
        {iconeOg(120, COR_CREME)}
      </div>
    ),
    size
  );
}
