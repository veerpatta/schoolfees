import { Skeleton } from "@/components/ui/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <Skeleton className="h-7 w-48" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-surface-2 px-4 py-3 border-b border-border/40 flex justify-between gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20 bg-surface-3" />
          ))}
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-24 bg-surface-3" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-7 w-20 bg-surface-3 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
