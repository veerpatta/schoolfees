import { Skeleton } from "@/ui/primitives/loading-skeleton";

/**
 * The filter bar and the roll, before they arrive.
 *
 * Shared by the route's loading.tsx (a cold navigation) and the page's own
 * Suspense boundary (the header has painted, the directory is still reading),
 * so the two waits look identical and the screen does not re-arrange itself
 * between them.
 */
export function StudentsListSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <div className="grid gap-3 md:grid-cols-4">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-surface-2 px-6 py-3 border-b border-border/40 flex justify-between">
          <Skeleton className="h-3 w-16 bg-surface-3" />
          <Skeleton className="h-3 w-32 bg-surface-3" />
          <Skeleton className="h-3 w-20 bg-surface-3" />
          <Skeleton className="h-3 w-20 bg-surface-3" />
          <Skeleton className="h-3 w-24 bg-surface-3" />
        </div>
        <div className="divide-y divide-border/40">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
            <div key={row} className="px-6 py-4 flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40 bg-surface-3" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex gap-8 items-center">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-20 bg-surface-3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
