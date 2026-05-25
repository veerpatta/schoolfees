import { CheckCircle2, AlertTriangle, Clock, Wallet } from "lucide-react";

import { Section } from "@/components/ui/section";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { cn } from "@/lib/utils";

type FeeHeadRow = { label: string; amount: number };

type InstallmentSnapshot = {
  installmentId: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  pendingAmount: number;
  paidAmount: number;
  finalLateFee: number;
  waiverApplied: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
};

export type StudentFinanceGlanceProps = {
  annualHeads: FeeHeadRow[];
  discountAmount: number;
  discountLabels: string[];
  totalAnnual: number;
  totalPaid: number;
  totalPending: number;
  overdueAmount: number;
  pendingLateFeeAmount: number;
  lateFeeWaivedTotal: number;
  creditBalance: number;
  installments: InstallmentSnapshot[];
  nextDueDate: string | null;
  nextDueLabel: string | null;
  nextDueAmount: number | null;
};

export function StudentFinanceGlance({
  annualHeads,
  discountAmount,
  discountLabels,
  totalAnnual,
  totalPaid,
  totalPending,
  overdueAmount,
  pendingLateFeeAmount,
  lateFeeWaivedTotal,
  creditBalance,
  installments,
  nextDueDate,
  nextDueLabel,
  nextDueAmount,
}: StudentFinanceGlanceProps) {
  const isYearClear = totalPending <= 0 && totalPaid > 0;
  const discountSuffix = discountLabels.length > 0 ? ` (${discountLabels.join(" + ")})` : "";

  return (
    <Section
      title="Fee snapshot"
      description="Everything for this session at a glance — heads, paid, pending, late fee, and per-installment status."
      variant="card"
      padding="tight"
    >
      <div className="space-y-3">
        {isYearClear ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-success-soft px-3 py-2.5 text-sm font-semibold text-success-soft-foreground">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Year Clear · all dues settled
            </span>
            <span className="text-xs opacity-80">Paid {formatInr(totalPaid)}</span>
          </div>
        ) : creditBalance > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-info-soft px-3 py-2.5 text-sm font-semibold text-info-soft-foreground">
            <span className="inline-flex items-center gap-2">
              <Wallet className="size-4" aria-hidden="true" />
              Credit balance available
            </span>
            <span className="text-xs opacity-80">{formatInr(creditBalance)}</span>
          </div>
        ) : overdueAmount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Overdue
            </span>
            <span className="text-xs">
              {formatInr(overdueAmount)}
              {pendingLateFeeAmount > 0 ? (
                <span className="ml-1 rounded-full border border-destructive/30 bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold">
                  + {formatInr(pendingLateFeeAmount)} late fee
                </span>
              ) : null}
            </span>
          </div>
        ) : nextDueDate ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-warning-soft px-3 py-2.5 text-sm font-semibold text-warning-soft-foreground">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" aria-hidden="true" />
              Next due {nextDueLabel ?? "installment"} on {formatShortDate(nextDueDate)}
            </span>
            <span className="text-xs">{nextDueAmount !== null ? formatInr(nextDueAmount) : ""}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Annual fee heads
            </p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {annualHeads.map((head) => (
                <li key={head.label} className="flex justify-between">
                  <span className="text-muted-foreground">{head.label}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {formatInr(head.amount)}
                  </span>
                </li>
              ))}
              {discountAmount > 0 ? (
                <li className="flex justify-between border-t border-border pt-1">
                  <span className="text-muted-foreground">Discount{discountSuffix}</span>
                  <span className="font-mono font-semibold text-success-soft-foreground tabular-nums">
                    −{formatInr(discountAmount)}
                  </span>
                </li>
              ) : null}
              <li className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total annual</span>
                <span className="font-mono tabular-nums">{formatInr(totalAnnual)}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Collection so far
            </p>
            <ul className="mt-1.5 space-y-1 text-sm">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Paid till now</span>
                <span className="font-mono font-semibold text-success-soft-foreground tabular-nums">
                  {formatInr(totalPaid)}
                </span>
              </li>
              {pendingLateFeeAmount > 0 ? (
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Late fee pending</span>
                  <span className="font-mono font-semibold text-destructive tabular-nums">
                    {formatInr(pendingLateFeeAmount)}
                  </span>
                </li>
              ) : null}
              {lateFeeWaivedTotal > 0 ? (
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Late fee waived</span>
                  <span className="font-mono font-semibold text-success-soft-foreground tabular-nums">
                    −{formatInr(lateFeeWaivedTotal)}
                  </span>
                </li>
              ) : null}
              <li className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Balance</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    totalPending <= 0
                      ? "text-success-soft-foreground"
                      : overdueAmount > 0
                        ? "text-destructive"
                        : "text-foreground",
                  )}
                >
                  {totalPending <= 0 ? "₹0 ✓" : formatInr(totalPending)}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {installments.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Installments
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {installments.map((item) => {
                const isPaid = item.pendingAmount <= 0 && item.paidAmount > 0;
                const isOverdue = item.balanceStatus === "overdue";
                const isPartial = item.paidAmount > 0 && item.pendingAmount > 0;
                const cls = isPaid
                  ? "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground"
                  : isOverdue
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : isPartial
                      ? "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground"
                      : "border-border bg-card text-muted-foreground";
                return (
                  <div
                    key={item.installmentId}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-xs",
                      cls,
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold">Inst {item.installmentNo}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {isPaid ? "✓ Paid" : isOverdue ? "Overdue" : isPartial ? "Partial" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] opacity-80">
                      Due {formatShortDate(item.dueDate)}
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {isPaid
                        ? formatInr(item.paidAmount)
                        : formatInr(item.pendingAmount)}
                    </p>
                    {item.finalLateFee > 0 ? (
                      <p className="text-[10px] font-medium">+ {formatInr(item.finalLateFee)} late fee</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
