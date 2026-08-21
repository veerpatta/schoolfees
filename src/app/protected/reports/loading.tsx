import { Skeleton } from "@/ui/primitives/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <Skeleton className="h-7 w-56" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-32 bg-surface-3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-28 bg-surface-3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
