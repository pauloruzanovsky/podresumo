export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="text-center mb-14">
        <div className="inline-block h-6 w-48 bg-card rounded-full mb-5" />
        <div className="h-12 w-80 bg-card rounded-xl mx-auto mb-4" />
        <div className="h-5 w-96 bg-card rounded-lg mx-auto" />
        <div className="flex justify-center gap-8 mt-8">
          <div className="h-10 w-16 bg-card rounded-lg" />
          <div className="h-10 w-16 bg-card rounded-lg" />
          <div className="h-10 w-16 bg-card rounded-lg" />
        </div>
      </div>

      {/* Search bar skeleton */}
      <div className="h-12 bg-card rounded-xl mb-5" />

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="h-44 bg-border/30" />
            <div className="p-5 space-y-3">
              <div className="h-3 w-32 bg-border/30 rounded" />
              <div className="h-5 w-full bg-border/30 rounded" />
              <div className="h-4 w-3/4 bg-border/30 rounded" />
              <div className="h-16 bg-border/20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
