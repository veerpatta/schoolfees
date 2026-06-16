"use client";

import { calculateDaysOverdue } from "@/lib/fees/due-amounts";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate, formatIsoDateIst } from "@/lib/helpers/date";
import { cn } from "@/lib/utils";

export type TimelineInstallment = {
  installmentId: string;
  installmentNo: number;
  dueDate: string;
  isCarryForward?: boolean;
  paidAmount: number;
  pendingAmount: number;
  finalLateFee: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
};

type InstallmentTimelineProps = {
  installments: TimelineInstallment[];
  /** Currently expanded installment number (controlled). */
  selectedNo?: number | null;
  /** Tap handler — omit to render a read-only timeline. */
  onSelect?: (installmentNo: number | null) => void;
  /** IST today (YYYY-MM-DD). Defaults to the current IST date. */
  todayIso?: string;
  /** Days-ahead window that counts as "Due soon". */
  dueSoonDays?: number;
  className?: string;
};

type Derived = {
  key: "paid" | "overdue" | "partial" | "dueSoon" | "upcoming";
  label: string;
  daysOverdue: number;
};

function deriveState(
  item: TimelineInstallment,
  today: string,
  dueSoonDays: number,
): Derived {
  if (item.pendingAmount <= 0 && (item.paidAmount > 0 || item.balanceStatus === "waived")) {
    return { key: "paid", label: "Paid", daysOverdue: 0 };
  }
  if (item.balanceStatus === "overdue") {
    const days = calculateDaysOverdue(item.dueDate, today);
    return {
      key: "overdue",
      label: days > 0 ? `Overdue ${days}d` : "Overdue",
      daysOverdue: days,
    };
  }
  if (item.paidAmount > 0 && item.pendingAmount > 0) {
    return { key: "partial", label: "Partial", daysOverdue: 0 };
  }
  // Not overdue, still unpaid — is it due soon?
  if (today && item.dueDate >= today) {
    const due = new Date(`${item.dueDate}T00:00:00+05:30`).getTime();
    const now = new Date(`${today}T00:00:00+05:30`).getTime();
    const daysUntil = Math.round((due - now) / 86_400_000);
    if (daysUntil <= dueSoonDays) {
      return { key: "dueSoon", label: "Due soon", daysOverdue: 0 };
    }
  }
  return { key: "upcoming", label: "Upcoming", daysOverdue: 0 };
}

const stateClasses: Record<Derived["key"], string> = {
  paid: "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
  partial: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
  dueSoon: "border-warning-soft-foreground/30 bg-warning-soft/60 text-warning-soft-foreground",
  upcoming: "border-border bg-card text-muted-foreground",
};

const dotClasses: Record<Derived["key"], string> = {
  paid: "bg-success-soft-foreground",
  overdue: "bg-destructive",
  partial: "bg-warning-soft-foreground",
  dueSoon: "bg-warning-soft-foreground/70",
  upcoming: "bg-border-strong",
};

/**
 * A compact, at-a-glance installment timeline: one pill per installment in due
 * order, each showing its status (Paid / Partial / Overdue Nd / Due soon /
 * Upcoming), due date, amount, and any late fee. Pills are tappable when
 * `onSelect` is provided so a caller can expand the full breakdown below.
 */
export function InstallmentTimeline({
  installments,
  selectedNo = null,
  onSelect,
  todayIso,
  dueSoonDays = 14,
  className,
}: InstallmentTimelineProps) {
  const today = todayIso ?? formatIsoDateIst(new Date()) ?? "";
  const interactive = typeof onSelect === "function";

  return (
    <ol className={cn("flex gap-1.5 overflow-x-auto pb-1", className)} data-installment-timeline="">
      {installments.map((item) => {
        const state = deriveState(item, today, dueSoonDays);
        const isExpanded = selectedNo === item.installmentNo;
        const amount =
          state.key === "paid" ? item.paidAmount : item.pendingAmount;
        const title = item.isCarryForward ? "Old balance" : `Inst ${item.installmentNo}`;

        const body = (
          <>
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1 font-semibold">
                <span className={cn("size-1.5 rounded-full", dotClasses[state.key])} aria-hidden="true" />
                {title}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide">{state.label}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] opacity-80">Due {formatShortDate(item.dueDate)}</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatInr(amount)}</p>
            {item.finalLateFee > 0 ? (
              <p className="text-[10px] font-medium">+ {formatInr(item.finalLateFee)} late fee</p>
            ) : null}
          </>
        );

        const baseCls = cn(
          "min-w-[8.5rem] flex-1 rounded-lg border px-2.5 py-2 text-left text-xs transition",
          stateClasses[state.key],
          isExpanded && "ring-2 ring-accent",
        );

        return (
          <li key={item.installmentId} className="flex-1">
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect?.(isExpanded ? null : item.installmentNo)}
                aria-expanded={isExpanded}
                className={cn(
                  baseCls,
                  "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {body}
              </button>
            ) : (
              <div className={baseCls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
