export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
          <div className="h-6 w-64 bg-surface-2 rounded anim-shimmer" />
        </div>
        <div className="h-9 w-28 bg-surface-3 rounded-md anim-shimmer" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" />
              <div className="h-5 w-24 bg-surface-2 rounded anim-shimmer" />
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-40 bg-surface-2 rounded anim-shimmer" />
              <div className="h-4 w-24 bg-surface-2 rounded anim-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
