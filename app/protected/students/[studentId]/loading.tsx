// Streams the student profile shell while the workspace + family + share
// links resolve. The real page now parallelizes those loaders (see
// `app/protected/students/[studentId]/page.tsx`); this shell gives the user
// instant visual feedback during the network round trip.
export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Sticky identity strip */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-surface-3 anim-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-32 bg-surface-2 rounded anim-shimmer" />
        </div>
        <div className="h-9 w-32 bg-surface-3 rounded-md anim-shimmer" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" />
            <div className="h-7 w-28 bg-surface-2 rounded anim-shimmer" />
            <div className="h-3 w-24 bg-surface-3 rounded anim-shimmer" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="h-5 w-32 bg-surface-3 rounded anim-shimmer" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-2 rounded anim-shimmer" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
            <div className="h-3 w-full bg-surface-2 rounded anim-shimmer" />
            <div className="h-3 w-3/4 bg-surface-2 rounded anim-shimmer" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="h-4 w-32 bg-surface-3 rounded anim-shimmer" />
            <div className="h-10 bg-surface-2 rounded anim-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
