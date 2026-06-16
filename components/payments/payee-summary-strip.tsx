"use client";

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/admin/status-badge";
import { OldBalanceChip } from "@/components/shared/old-balance-chip";
import { TrustBadge } from "@/components/trust/trust-badge";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

type PayeeSummaryStripProps = {
  student: {
    fullName: string;
    admissionNo: string;
    classLabel: string;
    fatherName: string | null;
    fatherPhone: string | null;
    studentStatusLabel: string;
    totalPending: number;
    overdueAmount: number;
    creditBalance: number;
    /** Pending previous-year carry-forward balance (allocated first). 0 when none. */
    oldBalanceAmount: number;
    nextDueDate: string | null;
    nextDueAmount: number | null;
  };
  latestReceiptToday: {
    receiptNumber: string;
    totalAmount: number;
  } | null;
  className?: string;
};

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";

  return `${first}${last}`.toUpperCase() || "VP";
}

export function PayeeSummaryStrip({
  student,
  latestReceiptToday,
  className,
}: PayeeSummaryStripProps) {
  const t = useTranslations("Payments");
  const hasRiskPills =
    student.overdueAmount > 0 ||
    student.creditBalance > 0 ||
    student.oldBalanceAmount > 0 ||
    latestReceiptToday !== null;

  return (
    <div className={cn("sticky top-0 z-10 bg-background pt-1 pb-2", className)}>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
            {getInitials(student.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold text-foreground">
                    {student.fullName}
                  </p>
                  <StatusBadge label={student.studentStatusLabel} tone="neutral" />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {student.admissionNo} · {student.classLabel}
                </p>
                {student.nextDueDate && student.nextDueAmount !== null ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("payeeNextDuePrefix")} {student.nextDueDate} · {formatInr(student.nextDueAmount)}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-right">
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    student.totalPending > 0
                      ? "text-destructive"
                      : "text-success-soft-foreground",
                  )}
                >
                  {formatInr(student.totalPending)}
                </p>
                <p className="mt-0.5 flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                  {t("payeePendingLabel")}
                  <TrustBadge source="Workbook v1" />
                </p>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              <p>
                {t("payeeFatherPrefix")} {student.fatherName || t("payeeFatherMissing")}
              </p>
              {student.fatherPhone ? (
                <a
                  href={`tel:${student.fatherPhone}`}
                  className="mt-1 inline-flex text-accent underline-offset-4 hover:underline"
                >
                  📞 {student.fatherPhone}
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {hasRiskPills ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <OldBalanceChip
              amount={student.oldBalanceAmount}
              label={t("payeeOldBalanceLabel")}
            />
            {student.overdueAmount > 0 ? (
              <StatusBadge
                label={t("payeeOverdueBadge", { amount: formatInr(student.overdueAmount) })}
                tone="warning"
              />
            ) : null}
            {student.creditBalance > 0 ? (
              <StatusBadge
                label={t("payeeCreditBadge", { amount: formatInr(student.creditBalance) })}
                tone="info"
              />
            ) : null}
            {latestReceiptToday ? (
              <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-soft-foreground">
                {t("payeePaidTodayBadge", {
                  amount: formatInr(latestReceiptToday.totalAmount),
                  receiptNumber: latestReceiptToday.receiptNumber,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
