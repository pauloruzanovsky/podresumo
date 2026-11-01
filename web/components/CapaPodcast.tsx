/**
 * A arte do podcast (flows/capas_podcasts), quadrada como nos aplicativos.
 * Sem capa no banco, não ocupa espaço.
 */
export default function CapaPodcast({
  capa,
  className = "",
}: {
  capa: string | null;
  className?: string;
}) {
  if (!capa) return null;
  return (
    // alt vazio: o nome do podcast sempre vem escrito ao lado
    <img src={capa} alt="" loading="lazy" className={`aspect-square object-cover ${className}`} />
  );
}
