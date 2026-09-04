import { LoadingBlock, Skeleton } from "@/ui/primitives/loading-skeleton";

/**
 * What the call queue looks like before it arrives.
 *
 * The page streams: its header, notice and filters paint as soon as auth and
 * the session resolve, and the queue -- the heavy read, a full scan of the
 * session's installments -- fills this slot when it lands. The phone opens on
 * the family being called, so this carries the same `max-md:order-2` as the
 * workspace it stands in for; a fallback that sat in a different place would
 * make the screen re-arrange itself on load.
 */
export function DefaultersQueueSkeleton() {
  return (
    <div className="max-md:order-2" aria-busy="true" aria-live="polite">
      {/* The phone header: title, sub, calls-logged count, progress bar. */}
      <div className="space-y-2 pb-3 md:hidden">
        <Skeleton className="h-6 w-40 bg-surface-3" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingBlock key={index} />
        ))}
      </div>
    </div>
  );
}
