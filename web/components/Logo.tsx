/**
 * Ícone do Podlibris: livro aberto dourado com cinco ondas de som saindo dele.
 * Mesmas medidas de brand/gera_marca.py (a fonte da verdade da marca); se
 * mudar lá, mude aqui.
 */

export const COR_VERDE = "#0F2E24";
export const COR_CREME = "#F7F2E7";
export const COR_OURO = "#C9A06B";

export const LIVRO_D =
  "M0 20 L10.7 22.9 V49.3 Q32 52 50 72.9 Q68 52 89.3 49.3 V22.9 L100 20 V61.8 Q72 63 50 75.7 Q28 63 0 61.8 Z";

/** [x, y, altura] de cada onda, largura 6.4 */
export const ONDAS: [number, number, number][] = [
  [18.2, 17.9, 27.1],
  [32.5, 10.7, 36.8],
  [46.8, 0, 59.3],
  [61.1, 10.7, 36.8],
  [75.4, 17.9, 27.1],
];

export function IconePodlibris({
  className,
  ondas = COR_VERDE,
}: {
  className?: string;
  /** Verde sobre fundo claro, creme sobre fundo escuro. O livro é sempre dourado. */
  ondas?: string;
}) {
  return (
    <svg viewBox="0 0 100 76" className={className} aria-hidden="true">
      <g fill={ondas}>
        {ONDAS.map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width={6.4} height={h} rx={3.2} />
        ))}
      </g>
      <path fill={COR_OURO} d={LIVRO_D} />
    </svg>
  );
}
