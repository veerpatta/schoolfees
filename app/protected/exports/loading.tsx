export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
        <div className="h-7 w-48 bg-surface-2 rounded anim-shimmer" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
            <div className="h-3 w-full bg-surface-2 rounded anim-shimmer" />
            <div className="h-3 w-3/4 bg-surface-2 rounded anim-shimmer" />
            <div className="h-9 w-28 bg-surface-3 rounded-md anim-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
