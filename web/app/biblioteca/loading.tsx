export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="text-center mb-14">
        <div className="h-12 w-72 bg-card rounded-xl mx-auto mb-4" />
        <div className="h-5 w-96 bg-card rounded-lg mx-auto" />
        <div className="flex justify-center gap-8 mt-8">
          <div className="h-10 w-16 bg-card rounded-lg" />
          <div className="h-10 w-16 bg-card rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="h-10 bg-card" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3 border-t border-border">
            <div className="h-4 w-48 bg-border/30 rounded" />
            <div className="h-4 w-32 bg-border/30 rounded" />
            <div className="h-4 w-8 bg-border/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
