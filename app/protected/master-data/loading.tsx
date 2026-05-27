export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
        <div className="h-7 w-48 bg-surface-2 rounded anim-shimmer" />
      </div>

      <div className="flex gap-2 border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-32 bg-surface-2 rounded-t anim-shimmer" />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="h-4 w-48 bg-surface-3 rounded anim-shimmer" />
            <div className="h-4 w-32 bg-surface-2 rounded anim-shimmer" />
            <div className="h-7 w-20 bg-surface-3 rounded-md anim-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
