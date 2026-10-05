export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="text-center mb-16">
        <div className="inline-block h-6 w-56 bg-card rounded-full mb-5" />
        <div className="h-12 w-96 bg-card rounded-xl mx-auto mb-4" />
        <div className="h-5 w-80 bg-card rounded-lg mx-auto mb-8" />
        <div className="h-12 max-w-xl mx-auto bg-card rounded-xl" />
        <div className="flex justify-center gap-8 mt-10">
          <div className="h-10 w-16 bg-card rounded-lg" />
          <div className="h-10 w-16 bg-card rounded-lg" />
          <div className="h-10 w-16 bg-card rounded-lg" />
        </div>
      </div>

      {/* Mais citados skeleton */}
      <div className="mb-14">
        <div className="h-6 w-40 bg-card rounded mb-2" />
        <div className="h-4 w-72 bg-card rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="p-5 bg-card border border-border rounded-2xl space-y-3"
            >
              <div className="h-4 w-3/4 bg-border/30 rounded" />
              <div className="h-3 w-1/2 bg-border/30 rounded" />
              <div className="h-3 w-1/3 bg-border/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
