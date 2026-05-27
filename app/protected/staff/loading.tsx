export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
        <div className="h-7 w-56 bg-surface-2 rounded anim-shimmer" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-surface-2 px-4 py-3 border-b border-border/40 flex justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-20 bg-surface-3 rounded anim-shimmer" />
          ))}
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-9 w-9 rounded-full bg-surface-3 anim-shimmer" />
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-surface-3 rounded anim-shimmer" />
                  <div className="h-3 w-32 bg-surface-2 rounded anim-shimmer" />
                </div>
              </div>
              <div className="h-7 w-24 bg-surface-3 rounded-md anim-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
