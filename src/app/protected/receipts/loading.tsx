import { ReceiptsListSkeleton } from "@/modules/receipts/ui/receipts-list-skeleton";
import { Skeleton } from "@/ui/primitives/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-surface-3" />
        <Skeleton className="h-7 w-48" />
      </div>

      <ReceiptsListSkeleton />
    </div>
  );
}
