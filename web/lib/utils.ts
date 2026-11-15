/** Junta classes do Tailwind, ignorando vazias (usado pelos componentes da Magic UI). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
