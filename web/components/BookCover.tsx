/**
 * Capa tipográfica gerada a partir do título.
 *
 * Open Library só tem capa pra ~metade do acervo (erra quase todo título em
 * português), e um grid com um terço dos cards vazios parece quebrado. Aqui
 * todo livro tem capa, o resultado é determinístico (o mesmo livro sempre
 * ganha a mesma cor) e não depende de rede.
 */

// Paleta fechada em vez de hue aleatório: seis tons que convivem com o verde
// da marca. Rainbow por hash fica com cara de placeholder.
const PALETA = [
  { de: "#1f5f4a", para: "#2f8a6a" }, // verde
  { de: "#2b4a6f", para: "#3f6d99" }, // azul
  { de: "#6b3a5c", para: "#94547f" }, // vinho
  { de: "#7a4a24", para: "#a86f3c" }, // âmbar
  { de: "#3d4152", para: "#5b6076" }, // ardósia
  { de: "#5c5330", para: "#87794a" }, // oliva
];

function hash(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h << 5) - h + texto.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const IGNORAR = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "um", "uma",
  "the", "of", "and", "a", "an", "to", "for", "on", "in",
]);

/** Até duas iniciais das palavras que carregam sentido no título. */
function monograma(titulo: string) {
  const palavras = titulo
    .split(/[\s:—–-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((p) => p && !IGNORAR.has(p.toLowerCase()));
  const base = palavras.length ? palavras : [titulo.trim()];
  return base.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function BookCover({
  titulo,
  autor,
  capaUrl,
  size = "sm",
  className = "",
}: {
  titulo: string;
  autor?: string | null;
  /** Capa do Open Library, quando existe. A gerada fica atrás como fundo, o
   *  que também cobre o caso de a imagem não carregar. */
  capaUrl?: string | null;
  /** "sm" na grade (só monograma — título de 10px em 40px de largura vira
   *  mancha); "lg" na página do livro, onde há espaço pro título inteiro. */
  size?: "sm" | "lg";
  className?: string;
}) {
  const cor = PALETA[hash(titulo) % PALETA.length];

  // Capa real: o Open Library padroniza a largura (180px no M) mas não a
  // proporção — medido, varia de 0,56 a 1,00. Duas tentativas anteriores
  // falharam: `object-cover` num box 2/3 cortava as laterais; deixar a imagem
  // definir a altura não cortava, mas o container ficava com altura zero até
  // a imagem carregar, e a grade refluía durante o scroll.
  //
  // `object-contain` num box de proporção fixa resolve os dois: o espaço é
  // reservado antes do download (zero reflow), nada é cortado, e as linhas da
  // grade ficam alinhadas. A sobra aparece como o gradiente do próprio livro,
  // o que lê como capa sobre fundo colorido em vez de erro.
  if (capaUrl) {
    return (
      <div
        className={`relative aspect-[2/3] rounded-lg overflow-hidden ${className}`}
        style={{ background: `linear-gradient(150deg, ${cor.de}, ${cor.para})` }}
      >
        {/* alt vazio de propósito: se a imagem falhar ela some e sobra o
            gradiente, em vez de um ícone de imagem quebrada. */}
        <img
          src={capaUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-[2/3] rounded-lg overflow-hidden ${className}`}
      style={{ background: `linear-gradient(150deg, ${cor.de}, ${cor.para})` }}
      aria-hidden="true"
    >
      {/* Lombada */}
      <div className="absolute inset-y-0 left-0 w-[6px] bg-black/25" />
      <div className="absolute inset-y-0 left-[6px] w-px bg-white/20" />

      {size === "sm" ? (
        <div className="absolute inset-0 flex items-center justify-center pl-[6px]">
          <span
            className="text-lg font-semibold text-white/85 tracking-wide"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {monograma(titulo)}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-4 pl-5">
          <p
            className="text-base font-semibold leading-tight text-white/95 line-clamp-6"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {titulo}
          </p>
          {autor && (
            <p className="text-[10px] uppercase tracking-wider text-white/60 line-clamp-2">
              {autor}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
