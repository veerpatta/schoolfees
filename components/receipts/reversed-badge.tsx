import { cn } from "@/lib/utils";

/**
 * Red "REVERSED" pill shown next to any receipt that has been cancelled in
 * full by reversal adjustments (undo / refund / duplicate correction).
 * Receipts are append-only, so a cancelled receipt stays visible in lists —
 * this badge is what makes that state unmistakable everywhere.
 */
export function ReversedBadge({ className }: { className?: string }) {
  return (
    <span
      data-reversed-badge
      className={cn(
        "inline-flex items-center rounded-full bg-destructive-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-soft-foreground",
        className,
      )}
    >
      Reversed
    </span>
  );
}
