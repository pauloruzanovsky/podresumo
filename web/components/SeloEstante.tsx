import type { EstanteDoMenu } from "@/lib/podcasts";

/**
 * O estado da estante, pra quem vê poucos episódios não achar que falta
 * alguma coisa: atualizada toda semana ou uma seleção. O ponto colorido é só
 * das que acompanham o programa.
 */
export default function SeloEstante({
  estante,
  className = "",
}: {
  estante?: Pick<EstanteDoMenu, "selo" | "acompanhada">;
  className?: string;
}) {
  if (!estante) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted ${className}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${estante.acompanhada ? "bg-selo" : "bg-muted/40"}`}
        aria-hidden="true"
      />
      {estante.selo}
    </span>
  );
}
