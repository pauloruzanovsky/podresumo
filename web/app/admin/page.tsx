import AdminPanel from "@/components/AdminPanel";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const adminKey = process.env.ADMIN_KEY;

  if (!key || key !== adminKey) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted text-sm">404 — Página não encontrada.</p>
      </div>
    );
  }

  return <AdminPanel />;
}
