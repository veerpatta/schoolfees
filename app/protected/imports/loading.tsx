import { Skeleton } from "@/components/ui/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <Skeleton className="h-7 w-56" />
      </div>

      <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center space-y-3">
        <Skeleton className="mx-auto h-10 w-10" />
        <Skeleton className="mx-auto h-4 w-48 bg-surface-3" />
        <Skeleton className="mx-auto h-3 w-64" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-40 bg-surface-3" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
