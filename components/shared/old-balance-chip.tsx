import { History } from "lucide-react";

import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

type OldBalanceChipProps = {
  /** Pending previous-year (carry-forward) balance. Chip hides when <= 0. */
  amount: number;
  /**
   * Leading label. Defaults to English so the chip can render inside
   * server components that don't load translations (e.g. the student detail
   * page). i18n callers pass a translated label (e.g. t("oldBalanceLabel")).
   */
  label?: string;
  className?: string;
};

/**
 * Surfaces a student's pending previous-year carry-forward balance as a small
 * chip across the daily collection pages (Defaulters, Payment Desk, Student
 * detail). Hook-free so it is safe in both server and client components.
 */
export function OldBalanceChip({ amount, label = "Old balance", className }: OldBalanceChipProps) {
  if (!amount || amount <= 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "border-accent-soft-foreground/30 bg-accent-soft text-accent-soft-foreground",
        className,
      )}
      title="Carried forward from the previous academic year (2025-26). Allocated first at the Payment Desk."
    >
      <History className="size-3" aria-hidden="true" />
      {label} {formatInr(amount)}
    </span>
  );
}
