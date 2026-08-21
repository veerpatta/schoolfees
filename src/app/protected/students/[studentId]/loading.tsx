import { Skeleton } from "@/ui/primitives/loading-skeleton";

// Streams the student profile shell while the workspace + family + share
// links resolve. The real page now parallelizes those loaders (see
// `app/protected/students/[studentId]/page.tsx`); this shell gives the user
// instant visual feedback during the network round trip.
export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Sticky identity strip */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full bg-surface-3" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48 bg-surface-3" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-9 w-32 bg-surface-3 rounded-md" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-3 w-20 bg-surface-3" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-24 bg-surface-3" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-32 bg-surface-3" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-32 bg-surface-3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-32 bg-surface-3" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
