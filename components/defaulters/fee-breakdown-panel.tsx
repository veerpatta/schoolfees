"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  Circle,
  Clock,
  Loader2,
  Receipt,
  Tag,
} from "lucide-react";

import { Money } from "@/components/ui/money";
import { InstallmentRowDetail } from "@/components/fees/installment-row-detail";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { formatPaymentModeLabel } from "@/lib/dashboard/summary";
import {
  getDisplayInstallmentLabel,
  isCarryForwardInstallment,
} from "@/lib/prev-year-dues/display";
import type { FeeBreakdown, FeeBreakdownInstallment } from "@/lib/defaulters/fee-breakdown";

type Props = {
  studentId: string;
  sessionLabel: string;
  /** Show a compact one-line summary on top (set false when the drawer header already shows it). */
  showHeadlineSummary?: boolean;
};

type StatusKey = FeeBreakdownInstallment["balanceStatus"];

const STATUS_STYLE: Record<
  StatusKey,
  { wrap: string; pill: string; icon: typeof Check; labelKey: string }
> = {
  paid: {
    wrap: "border-success/40 bg-success-soft text-success-soft-foreground",
    pill: "bg-success text-success-foreground",
    icon: Check,
    labelKey: "feeStatusPaid",
  },
  waived: {
    wrap: "border-info-soft bg-info-soft text-info-soft-foreground",
    pill: "bg-info-soft text-info-soft-foreground",
    icon: Tag,
    labelKey: "feeStatusWaived",
  },
  partial: {
    wrap: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
    pill: "bg-warning/40 text-warning-soft-foreground",
    icon: Clock,
    labelKey: "feeStatusPartial",
  },
  overdue: {
    wrap: "border-destructive/40 bg-destructive/10 text-destructive",
    pill: "bg-destructive text-destructive-foreground",
    icon: AlertTriangle,
    labelKey: "feeStatusOverdue",
  },
  pending: {
    wrap: "border-border bg-surface-2 text-muted-foreground",
    pill: "bg-muted text-muted-foreground",
    icon: Circle,
    labelKey: "feeStatusPending",
  },
};

export function FeeBreakdownPanel({
  studentId,
  sessionLabel,
  showHeadlineSummary = false,
}: Props) {
  const t = useTranslations("Defaulters");
  const [data, setData] = useState<FeeBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNo, setExpandedNo] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    setExpandedNo(null);
    fetch(
      `/protected/defaulters/fee-breakdown?studentId=${encodeURIComponent(studentId)}&sessionLabel=${encodeURIComponent(sessionLabel)}`,
      { headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t("feeLoadStatus", { status: response.status }));
        }
        return (await response.json()) as { breakdown: FeeBreakdown | null };
      })
      .then((body) => {
        if (cancelled) return;
        setData(body.breakdown);
      })
      .catch((caught: Error) => {
        if (cancelled) return;
        setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, sessionLabel, t]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("feeLoading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-4 text-center text-sm text-muted-foreground">
        {t("feeEmpty")}
      </p>
    );
  }

  const { headline, installments, recentPayments } = data;
  const hasAdjustments = headline.discountApplied > 0 || headline.lateFeeWaived > 0;

  return (
    <div className="space-y-4">
      {/* Headline strip — optional, the drawer header already shows outstanding */}
      {showHeadlineSummary ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-3">
          <Cell label={t("feeTotalDue")} value={formatInr(headline.totalDue)} />
          <Cell label={t("feePaid")} value={formatInr(headline.totalPaid)} tone="success" />
          <Cell label={t("feePending")} value={formatInr(headline.outstanding)} tone="warning" />
        </div>
      ) : null}

      {/* Installment strip — 4 chips for Q1-Q4 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("feeInstallmentsHeading")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("feeInstallmentsProgress", {
              paid: headline.paidInstallments,
              total: installments.length || 4,
            })}
          </p>
        </div>

        {installments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-3 text-xs text-muted-foreground">
            {t("feeInstallmentsEmpty")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {installments.map((inst) => {
                const style = STATUS_STYLE[inst.balanceStatus];
                const Icon = style.icon;
                const isExpanded = expandedNo === inst.installmentNo;
                return (
                  <button
                    key={inst.installmentNo}
                    type="button"
                    onClick={() =>
                      setExpandedNo(isExpanded ? null : inst.installmentNo)
                    }
                    className={cn(
                      "rounded-lg border p-2 text-left text-xs transition",
                      style.wrap,
                      isExpanded && "ring-2 ring-accent",
                    )}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold">
                        {isCarryForwardInstallment(inst) ? "Old balance" : `Q${inst.installmentNo}`}
                      </span>
                      <Icon className="size-3" aria-hidden="true" />
                    </div>
                    <p className="mt-1 font-semibold tabular-nums leading-tight">
                      {formatInr(inst.pendingAmount > 0 ? inst.pendingAmount : inst.paidAmount)}
                    </p>
                    <p className="truncate text-[10px] opacity-80">
                      {t(style.labelKey)}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Expanded installment detail */}
            {expandedNo !== null ? (
              <InstallmentDetail
                installment={installments.find((i) => i.installmentNo === expandedNo)!}
              />
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">
                {t("feeTapInstallment")}
              </p>
            )}
          </>
        )}
      </section>

      {/* Late fee total + adjustments callout */}
      {headline.lateFeeTotal > 0 || hasAdjustments ? (
        <section className="grid gap-2 sm:grid-cols-2">
          {headline.lateFeeTotal > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-destructive">
                {t("feeLateFee")}
              </p>
              <div className="mt-1">
                <Money value={headline.lateFeeTotal} size="md" tone="danger" />
              </div>
              {headline.lateFeeWaived > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("feeWaivedAmount", { amount: formatInr(headline.lateFeeWaived) })}
                </p>
              ) : null}
            </div>
          ) : null}
          {headline.discountApplied > 0 ? (
            <div className="rounded-lg border border-success/30 bg-success-soft p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-success-soft-foreground">
                {t("feeDiscount")}
              </p>
              <div className="mt-1">
                <Money value={headline.discountApplied} size="md" tone="success" />
              </div>
              <p className="mt-1 text-[11px] text-success-soft-foreground">
                {t("feeDiscountHint")}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Recent payments */}
      <section className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Receipt className="size-3.5" aria-hidden="true" /> {t("feeRecentPayments")}
        </p>
        {recentPayments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-3 text-center text-xs text-muted-foreground">
            {t("feeNoPayments")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentPayments.map((tx) => (
              <li key={tx.receiptId}>
                <Link
                  href={appendSessionParam(
                    `/protected/receipts/${tx.receiptId}`,
                    sessionLabel,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {tx.receiptNumber}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {formatPaymentModeLabel(tx.paymentMode)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{formatShortDate(tx.paymentDate)}</p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatInr(tx.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function InstallmentDetail({ installment }: { installment: FeeBreakdownInstallment }) {
  // Render the canonical shared component so this surface stays in lock-step
  // with the student profile and any future installment view.
  return (
    <InstallmentRowDetail
      installmentNo={installment.installmentNo}
      installmentLabel={getDisplayInstallmentLabel(installment)}
      dueDate={installment.dueDate}
      baseCharge={installment.baseCharge}
      rawLateFee={installment.rawLateFee ?? installment.finalLateFee}
      waiverApplied={installment.waiverApplied ?? 0}
      finalLateFee={installment.finalLateFee}
      paidAmount={installment.paidAmount}
      adjustmentAmount={installment.adjustmentAmount ?? 0}
      pendingAmount={installment.pendingAmount}
      status={installment.balanceStatus}
      lastPaymentDate={installment.lastPaymentDate}
    />
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const valueCls =
    tone === "warning"
      ? "text-warning-soft-foreground"
      : tone === "success"
        ? "text-success-soft-foreground"
        : "text-foreground";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-base font-semibold tabular-nums", valueCls)}>{value}</p>
    </div>
  );
}
