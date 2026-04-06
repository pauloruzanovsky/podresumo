export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="text-center mb-14">
        <div className="inline-block h-6 w-32 bg-card rounded-full mb-5" />
        <div className="h-12 w-64 bg-card rounded-xl mx-auto mb-4" />
        <div className="h-5 w-96 bg-card rounded-lg mx-auto" />
      </div>

      {/* Feed skeleton */}
      <div className="flex flex-col gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="h-3 w-40 bg-border/30 rounded" />
            <div className="h-5 w-3/4 bg-border/30 rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-24 bg-border/20 rounded-xl" />
              <div className="h-24 bg-border/20 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
