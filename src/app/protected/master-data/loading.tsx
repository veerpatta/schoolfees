import { Skeleton } from "@/ui/primitives/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <Skeleton className="h-7 w-48" />
      </div>

      <div className="flex gap-2 border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-t" />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-48 bg-surface-3" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-7 w-20 bg-surface-3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
