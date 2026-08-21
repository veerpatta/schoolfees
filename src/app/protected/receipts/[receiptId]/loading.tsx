import { Skeleton } from "@/ui/primitives/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 bg-surface-3" />
          <Skeleton className="h-6 w-64" />
        </div>
        <Skeleton className="h-9 w-28 bg-surface-3 rounded-md" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20 bg-surface-3" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
