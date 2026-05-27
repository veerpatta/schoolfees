export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
        <div className="h-7 w-56 bg-surface-2 rounded anim-shimmer" />
      </div>

      <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center space-y-3">
        <div className="mx-auto h-10 w-10 bg-surface-2 rounded anim-shimmer" />
        <div className="mx-auto h-4 w-48 bg-surface-3 rounded anim-shimmer" />
        <div className="mx-auto h-3 w-64 bg-surface-2 rounded anim-shimmer" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="h-4 w-40 bg-surface-3 rounded anim-shimmer" />
            <div className="h-4 w-24 bg-surface-2 rounded anim-shimmer" />
            <div className="h-4 w-16 bg-surface-2 rounded anim-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
