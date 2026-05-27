import { AlertTriangle, Check, CircleDashed, Clock, Tag } from "lucide-react";

import { Money } from "@/components/ui/money";
import { MoneyWithDefinition } from "@/components/ui/money-with-definition";
import { formatShortDate } from "@/lib/helpers/date";
import { cn } from "@/lib/utils";

export type InstallmentRowStatus = "paid" | "partial" | "overdue" | "pending" | "waived";

export type InstallmentRowDetailProps = {
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  /** Base principal allocated to this installment, after any annual discount. */
  baseCharge: number;
  /** Late fee CHARGED on this installment (before waiver). */
  rawLateFee: number;
  /** Late fee waived on this installment. */
  waiverApplied: number;
  /** Late fee actually owed (raw − waiver). */
  finalLateFee: number;
  /** All payments allocated to this installment, summed. */
  paidAmount: number;
  /** Net adjustments on this installment (positive reduces due). */
  adjustmentAmount?: number;
  /** Pending after paid + adjustments + waiver. */
  pendingAmount: number;
  status: InstallmentRowStatus;
  /** Most recent payment date allocated to this installment. */
  lastPaymentDate?: string | null;
  /** Optional payment list for the timeline disclosure. */
  paymentTimeline?: ReadonlyArray<{
    receiptId: string;
    receiptNumber: string;
    paymentDate: string;
    amount: number;
    paymentMode: string;
    postedByName?: string | null;
  }>;
  /** When true, renders the dense print-friendly variant. */
  dense?: boolean;
  className?: string;
};

const STATUS_META: Record<
  InstallmentRowStatus,
  { label: string; chip: string; icon: typeof Check; wrap: string }
> = {
  paid: {
    label: "Paid",
    chip: "bg-success text-success-foreground",
    icon: Check,
    wrap: "border-success/40 bg-success-soft text-success-soft-foreground",
  },
  waived: {
    label: "Waived",
    chip: "bg-info-soft text-info-soft-foreground",
    icon: Tag,
    wrap: "border-info-soft bg-info-soft text-info-soft-foreground",
  },
  partial: {
    label: "Partial",
    chip: "bg-warning/40 text-warning-soft-foreground",
    icon: Clock,
    wrap: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
  },
  overdue: {
    label: "Overdue",
    chip: "bg-destructive text-destructive-foreground",
    icon: AlertTriangle,
    wrap: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  pending: {
    label: "Pending",
    chip: "bg-muted text-muted-foreground",
    icon: CircleDashed,
    wrap: "border-border bg-surface-2 text-muted-foreground",
  },
};

/**
 * Canonical per-installment breakdown card. Every screen that shows an
 * installment's money trail (defaulters drawer, student profile, payment
 * desk, receipt fee-detail) renders THIS component so the same labels,
 * the same order, and the same glossary anchors appear everywhere.
 *
 * Lines shown — explicit, no math hidden:
 *   1. Base charge          — Installment principal (after annual discount).
 *   2. Late fee (charged)   — Only when rawLateFee > 0.
 *   3. Late fee waived      — Only when waiverApplied > 0.
 *   4. Net adjustments      — Only when adjustmentAmount != 0.
 *   5. Paid on installment  — Total received against this installment.
 *   6. Pending now          — Final outstanding (the big number).
 *
 * Each label is a `<MoneyWithDefinition>` button — taps open the glossary
 * anchored to the matching term.
 */
export function InstallmentRowDetail({
  installmentNo,
  installmentLabel,
  dueDate,
  baseCharge,
  rawLateFee,
  waiverApplied,
  finalLateFee,
  paidAmount,
  adjustmentAmount = 0,
  pendingAmount,
  status,
  lastPaymentDate,
  paymentTimeline,
  dense = false,
  className,
}: InstallmentRowDetailProps) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;

  return (
    <article
      data-installment-row={installmentNo}
      className={cn("rounded-lg border p-3 text-sm anim-fade-in", meta.wrap, className)}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">
            Inst {installmentNo}
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {installmentLabel || `Installment ${installmentNo}`}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Due {formatShortDate(dueDate)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            meta.chip,
          )}
        >
          <StatusIcon className="size-3" aria-hidden="true" />
          {meta.label}
        </span>
      </header>

      <dl className={cn("mt-3 grid gap-y-1 text-xs", dense ? "gap-x-2" : "gap-x-3")}>
        <MoneyWithDefinition
          termKey="baseCharge"
          label="Base charge"
          value={baseCharge}
          layout="row"
          size="sm"
        />

        {rawLateFee > 0 ? (
          <MoneyWithDefinition
            termKey="lateFeeCharged"
            label="Late fee charged"
            value={rawLateFee}
            layout="row"
            size="sm"
            tone="warning"
          />
        ) : null}

        {waiverApplied > 0 ? (
          <MoneyWithDefinition
            termKey="lateFeeWaived"
            label="Late fee waived"
            value={-waiverApplied}
            layout="row"
            size="sm"
            tone="success"
          />
        ) : null}

        {adjustmentAmount !== 0 ? (
          <MoneyWithDefinition
            termKey="adjustmentNet"
            label="Net adjustments"
            value={adjustmentAmount}
            layout="row"
            size="sm"
            tone={adjustmentAmount > 0 ? "success" : "danger"}
            signed
          />
        ) : null}

        <MoneyWithDefinition
          termKey="amountPaidOnInstallment"
          label="Paid on installment"
          value={paidAmount}
          layout="row"
          size="sm"
          tone={paidAmount > 0 ? "success" : "muted"}
        />

        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border/60 pt-1.5">
          <MoneyWithDefinition
            termKey="pendingOnInstallment"
            label="Pending now"
            layout="inline"
            size="sm"
          />
          <Money
            value={pendingAmount}
            size="lg"
            tone={pendingAmount > 0 ? (status === "overdue" ? "danger" : "warning") : "success"}
          />
        </div>

        {lastPaymentDate ? (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Last payment on this installment: {formatShortDate(lastPaymentDate)}
          </p>
        ) : null}

        {finalLateFee > 0 && waiverApplied === 0 ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            (Late fee {finalLateFee === rawLateFee ? "stands" : "after partial waiver"})
          </p>
        ) : null}
      </dl>

      {paymentTimeline && paymentTimeline.length > 0 ? (
        <details className="mt-3 rounded-md border border-dashed border-border/60 bg-card/60 px-2.5 py-1.5 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            Payments funding this installment ({paymentTimeline.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {paymentTimeline.map((p) => (
              <li
                key={p.receiptId}
                className="flex items-baseline justify-between gap-2 border-t border-border/40 pt-1 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-foreground">{p.receiptNumber}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {formatShortDate(p.paymentDate)} · {p.paymentMode}
                    {p.postedByName ? ` · by ${p.postedByName}` : ""}
                  </p>
                </div>
                <Money value={p.amount} size="sm" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
