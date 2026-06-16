"use client";

import { StatusBadge } from "@/components/admin/status-badge";
import { Money } from "@/components/ui/money";
import { MoneyWithDefinition } from "@/components/ui/money-with-definition";
import { calculateDaysOverdue } from "@/lib/fees/due-amounts";
import { formatShortDate } from "@/lib/helpers/date";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

/**
 * The one canonical "Fee Status" block. Dropped into Payment Desk, the student
 * profile, and the Defaulters drawer so all three read identically.
 *
 * The model (verified against v_workbook_student_financials):
 *   Pending (total owed) = Fees pending (base) + Late fee (fine)
 * Only Fees pending drives Due now / Overdue / defaulter status — an unpaid late
 * fee never makes a student a defaulter. Late fee is always its own line.
 */
export type FeeStatusSummaryProps = {
  /** Total owed incl. late fee — `outstanding_amount`. */
  pending: number;
  /** Base owed, late fee excluded — `base_outstanding_amount`. */
  feesPending: number;
  /** Late-fee remainder — `late_fee_outstanding_amount`. */
  lateFeePending: number;
  /** Previous-year carry-forward (subset of pending). Hidden when 0. */
  oldBalance?: number;
  /** Surplus paid over due. Hidden when 0. */
  creditBalance?: number;
  /** Oldest unpaid (base) installment due date — `next_due_date`. */
  nextDueDate?: string | null;
  /** Base amount of that installment — `next_due_amount`. */
  nextDueAmount?: number | null;
  /** Days overdue. Defaults to computed from `nextDueDate` (oldest unpaid base). */
  daysOverdue?: number;
  /** Late fee waived so far on this student. Shown as a settled note when > 0. */
  lateFeeWaived?: number;
  /** Drop the outer card chrome so the block can nest inside another card. */
  bare?: boolean;
  /** Hide the big "Pending (total owed)" headline (e.g. when the host already shows it). */
  showHeadline?: boolean;
  className?: string;
};

function overdueLabel(days: number) {
  if (days <= 0) return null;
  if (days >= 90) return `Overdue ${days}d · chronic`;
  return `Overdue ${days}d`;
}

export function FeeStatusSummary({
  pending,
  feesPending,
  lateFeePending,
  oldBalance = 0,
  creditBalance = 0,
  nextDueDate,
  nextDueAmount,
  daysOverdue,
  lateFeeWaived = 0,
  bare = false,
  showHeadline = true,
  className,
}: FeeStatusSummaryProps) {
  const resolvedDaysOverdue = daysOverdue ?? calculateDaysOverdue(nextDueDate ?? null);
  const isOverdue = resolvedDaysOverdue > 0 && feesPending > 0;
  const cleared = pending <= 0;
  const overdueText = overdueLabel(resolvedDaysOverdue);

  if (cleared) {
    return (
      <div
        className={cn(
          bare
            ? "rounded-lg bg-success-soft px-3 py-2"
            : "rounded-xl border border-success/30 bg-success-soft px-4 py-3",
          className,
        )}
        data-fee-status="cleared"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-success-soft-foreground">
          <span aria-hidden="true">✓</span> All fees cleared
        </p>
        {creditBalance > 0 ? (
          <div className="mt-2">
            <MoneyWithDefinition
              termKey="creditBalance"
              value={creditBalance}
              tone="success"
              size="sm"
              layout="row"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(bare ? "" : "rounded-xl border border-border bg-card p-4", className)}
      data-fee-status="pending"
    >
      {/* Headline: total owed, with the base + late-fee breakdown spelled out. */}
      {showHeadline ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <MoneyWithDefinition
              termKey="pending"
              label="Pending (total owed)"
              value={pending}
              tone="danger"
              size="lg"
              layout="column"
            />
            {overdueText ? <StatusBadge label={overdueText} tone="danger" /> : null}
          </div>
          {lateFeePending > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              = Fees pending {formatInr(feesPending)} + Late fee {formatInr(lateFeePending)}
            </p>
          ) : null}
        </>
      ) : null}

      <div
        className={cn(
          "space-y-2",
          showHeadline ? "mt-3 border-t border-border pt-3" : "",
        )}
      >
        {!showHeadline && overdueText ? (
          <div className="flex justify-end">
            <StatusBadge label={overdueText} tone="danger" />
          </div>
        ) : null}
        {/* Fees pending (base) — the figure that drives overdue / collection. */}
        <div className="flex items-center justify-between gap-3">
          <MoneyWithDefinition
            termKey="feesPending"
            value={feesPending}
            tone={isOverdue ? "danger" : "warning"}
            size="sm"
            layout="row"
            className="flex-1"
          />
        </div>

        {/* Late fee — always its own line, flagged as a separate fine. */}
        {lateFeePending > 0 ? (
          <div>
            <MoneyWithDefinition
              termKey="lateFeePending"
              label="Late fee (separate fine)"
              value={lateFeePending}
              tone="warning"
              size="sm"
              layout="row"
            />
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              A flat fine for paying after an installment&apos;s due date — separate from fees, and
              it never makes a student a defaulter on its own.
            </p>
          </div>
        ) : null}

        {/* Previous-year carry-forward, when present. */}
        {oldBalance > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Old balance
            </span>
            <Money value={oldBalance} size="sm" tone="warning" />
          </div>
        ) : null}

        {creditBalance > 0 ? (
          <MoneyWithDefinition
            termKey="creditBalance"
            value={creditBalance}
            tone="success"
            size="sm"
            layout="row"
          />
        ) : null}
      </div>

      {/* Footer: next due date / amount, and any waiver already applied. */}
      {(nextDueDate && (nextDueAmount ?? 0) > 0) || lateFeeWaived > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {nextDueDate && (nextDueAmount ?? 0) > 0 ? (
            <span>
              Next due {formatShortDate(nextDueDate)} · {formatInr(nextDueAmount ?? 0)}
            </span>
          ) : (
            <span />
          )}
          {lateFeeWaived > 0 ? (
            <span className="text-success-soft-foreground">
              Late fee waived: {formatInr(lateFeeWaived)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
