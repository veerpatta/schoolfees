import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

/**
 * Translator function used by ReceiptDocument. Compatible with both
 * `getTranslations("Receipts")` (server) and `useTranslations("Receipts")`
 * (client) — both return a callable with this shape.
 */
export type ReceiptTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function paymentModeLabel(value: ReceiptDetail["paymentMode"], t: ReceiptTranslator) {
  if (value === "upi") {
    return t("paymentModeUpi");
  }

  if (value === "bank_transfer") {
    return t("paymentModeBankTransfer");
  }

  if (value === "cheque") {
    return t("paymentModeCheque");
  }

  return t("paymentModeCash");
}

function wordsBelowThousand(value: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const parts: string[] = [];

  if (value >= 100) {
    parts.push(`${ones[Math.floor(value / 100)]} Hundred`);
    value %= 100;
  }

  if (value >= 20) {
    parts.push(tens[Math.floor(value / 10)]);
    value %= 10;
  }

  if (value > 0) {
    parts.push(ones[value]);
  }

  return parts.join(" ");
}

function amountInWords(value: number, t: ReceiptTranslator) {
  const amount = Math.max(Math.round(value), 0);

  if (amount === 0) {
    return t("rupeesZero");
  }

  const groups: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [1, ""],
  ];
  const parts: string[] = [];
  let remaining = amount;

  groups.forEach(([size, label]) => {
    const groupValue = Math.floor(remaining / size);

    if (groupValue > 0) {
      parts.push(`${wordsBelowThousand(groupValue)}${label ? ` ${label}` : ""}`);
      remaining %= size;
    }
  });

  return `${parts.join(" ")} ${t("rupeesSuffix")}`;
}

function localizedFeeLabel(rawLabel: string, t: ReceiptTranslator) {
  const normalized = rawLabel.toLowerCase();

  if (normalized.includes("tuition")) return t("feeLabelTuition");
  if (normalized.includes("transport")) return t("feeLabelTransport");
  if (normalized.includes("academic")) return t("feeLabelAcademic");
  if (normalized.includes("late")) return t("feeLabelLate");
  if (normalized.includes("discount") || normalized.includes("waiver")) {
    return t("feeLabelDiscount");
  }
  if (normalized.includes("book")) return t("feeLabelBooks");
  if (normalized === "other fees") return t("feeLabelOther");

  return rawLabel;
}

type ReceiptDocumentProps = {
  receipt: ReceiptDetail;
  /** Translator scoped to the Receipts namespace. Required. */
  t: ReceiptTranslator;
  className?: string;
  mode?: ReceiptDocumentMode;
  /**
   * Accepted for backwards compatibility with call sites that haven't been
   * scrubbed yet. Has no effect — the receipt always renders the full
   * (formerly "full") layout.
   */
  density?: "full" | "compact";
  /**
   * When false, the per-receipt `@page` size rule is omitted so the surrounding
   * page can control pagination (e.g. batch reprint of family receipts on A4
   * with one receipt per page).
   */
  embedPageStyles?: boolean;
};

type ReceiptDocumentMode = "print" | "draft" | "saved";

/**
 * Legacy bilingual label kept for backwards compatibility. New receipt code
 * should resolve a single localized string from the Receipts namespace
 * instead of rendering English + Hindi together.
 */
export function BilingualLabel({ english, hindi }: { english: string; hindi: string }) {
  return (
    <span className="block text-[10px] font-medium text-muted-foreground">
      {english} / {hindi}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-[10px] font-medium text-muted-foreground">{children}</span>;
}

function ConventionalDiscountBlock({
  assignments,
  t,
}: {
  assignments: ReceiptDetail["conventionalDiscountAssignments"];
  t: ReceiptTranslator;
}) {
  if (assignments.length === 0) {
    return null;
  }

  // Per school rule, only one policy actually applies — the row marked
  // isWinningPolicy. Other rows stay in the assignments array for audit, but
  // their `savings` are superseded and must not be re-displayed (otherwise
  // staff perceive discounts as doubled).
  const winningIndex = assignments.findIndex((row) => row.isWinningPolicy);
  const winning =
    winningIndex >= 0 ? assignments[winningIndex] : assignments[0];
  const superseded =
    winningIndex >= 0
      ? assignments.filter((_, index) => index !== winningIndex)
      : assignments.slice(1);

  return (
    <section className="rounded-lg border border-accent/25 bg-accent-soft/70 p-4 print-compact">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("conventionalDiscountHeading")}
          </h2>
          <p className="mt-1 text-xs text-accent-soft-foreground">
            {t("conventionalDiscountTagline")}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {winning ? (
          <div
            key={winning.assignmentId}
            className="grid gap-2 rounded-md border border-accent/20 bg-card/90 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <p className="font-semibold text-foreground">{winning.policyDisplayName}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{winning.policyCode}</p>
            </div>
            <div>
              <FieldLabel>{t("baselineTuition")}</FieldLabel>
              <p className="font-semibold text-muted-foreground line-through">
                {formatInr(winning.beforeTuitionAmount)}
              </p>
            </div>
            <div>
              <FieldLabel>{t("resultingTuition")}</FieldLabel>
              <p className="font-semibold text-accent-soft-foreground">
                {formatInr(winning.resultingTuitionAmount)}
              </p>
              <p className="mt-0.5 text-[10px] text-accent-soft-foreground">
                {t("youSaveOnTuition", {
                  amount: formatInr(
                    Math.max(winning.beforeTuitionAmount - winning.resultingTuitionAmount, 0),
                  ),
                })}
              </p>
            </div>
          </div>
        ) : null}
        {superseded.length > 0 ? (
          <div className="rounded-md border border-dashed border-accent/15 bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">{t("otherAssignedPolicies")}</p>
            <ul className="mt-1 list-disc pl-4">
              {superseded.map((row) => (
                <li key={row.assignmentId}>
                  {t("supersededPolicyItem", { name: row.policyDisplayName, code: row.policyCode })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ReceiptDocument({
  receipt,
  t,
  className,
  mode = "print",
  embedPageStyles = true,
}: ReceiptDocumentProps) {
  const breakdownTotal = receipt.breakdown.reduce((sum, item) => sum + item.amount, 0);
  const isDraft = mode === "draft";
  const isSaved = mode === "saved";

  return (
    <article
      className={`receipt-body receipt-print-page anim-slide-up relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card p-3 text-foreground shadow-sm sm:p-5 print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none ${className ?? ""}`.trim()}
    >
      <style>{`
        ${embedPageStyles ? `@page {
          size: 80mm auto;
          margin: 4mm;
        }` : ""}

        .receipt-print-page {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .receipt-print-page table {
          border-collapse: collapse;
        }

        @media print {
          nav, aside, .no-print {
            display: none !important;
          }

          * {
            box-shadow: none !important;
            border-color: #000 !important;
          }

          .receipt-body {
            max-width: 80mm;
            margin: 0 auto;
            font-size: 11px;
            line-height: 1.4;
          }

          .receipt-print-page {
            break-inside: avoid;
            page-break-inside: avoid;
            width: 80mm;
            max-width: 80mm;
            overflow: visible;
            margin: 0 auto;
          }

          .receipt-print-page * {
            animation: none !important;
            transition: none !important;
          }

          .receipt-print-page section,
          .receipt-print-page table,
          .receipt-print-page tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .receipt-print-page .print-compact {
            padding-top: 0.34rem;
            padding-bottom: 0.34rem;
          }

          .receipt-print-page th,
          .receipt-print-page td {
            padding-top: 0.2rem;
            padding-bottom: 0.2rem;
          }
        }
      `}</style>

      {isDraft ? (
        <div
          className="pointer-events-none absolute inset-0 hidden items-center justify-center text-center text-5xl font-semibold uppercase text-foreground/10 sm:flex print:flex"
          aria-hidden="true"
        >
          {t("draftWatermark")}
        </div>
      ) : null}

      <div className="relative z-10 space-y-3">
        <header className="rounded-lg border border-border bg-card p-3 sm:p-4 print-compact">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <Image
                  src="/branding/veer-patta-school-logo.jpg"
                  alt={`${schoolProfile.name} logo`}
                  fill
                  sizes="56px"
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div>
                <p className="text-lg font-semibold uppercase text-foreground">{schoolProfile.name}</p>
                <p className="text-xs font-medium text-muted-foreground">{t("feeReceiptHeading")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("academicYearLabel")}: {receipt.sessionLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-left sm:text-right">
              <FieldLabel>{t("receiptNo")}</FieldLabel>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {isDraft ? t("draftReceiptNumberPlaceholder") : receipt.receiptNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(receipt.paymentDate)}</p>
              {isDraft ? (
                <span className="mt-2 inline-flex rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                  {t("draftLabel")}
                </span>
              ) : null}
              {isSaved ? (
                <span className="mt-2 inline-flex rounded bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                  {t("savedLabel", { number: receipt.receiptNumber })}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 print-compact">
            <FieldLabel>{t("totalFeeDue")}</FieldLabel>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatInr(receipt.totalDue)}</p>
          </div>
          <div className="rounded-lg border bg-info-soft px-3 py-3 print-compact">
            <FieldLabel>{t("paidTillDate")}</FieldLabel>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatInr(receipt.totalPaidToDate)}</p>
          </div>
          <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-3 print-compact">
            <FieldLabel>{t("paidToday")}</FieldLabel>
            <p className="mt-1 text-2xl font-semibold text-accent-soft-foreground">{formatInr(receipt.totalAmount)}</p>
          </div>
           <div
             className={cn(
               "rounded-lg border px-3 py-3 print-compact",
               receipt.outstandingAfterReceipt === 0 ? "bg-success-soft" : "bg-warning-soft",
             )}
           >
             <FieldLabel>{t("balanceDue")}</FieldLabel>
             <p className="mt-1 text-lg font-semibold">{formatInr(receipt.outstandingAfterReceipt)}</p>
             <p className="mt-1 text-[10px] text-warning-soft-foreground">{t("balanceAfterThisReceipt")}</p>
             <p className="mt-1 text-[10px] text-warning-soft-foreground">
               {t("currentOutstandingNow", { amount: formatInr(receipt.currentOutstanding) })}
             </p>
           </div>
        </section>

        <section className="grid gap-3 md:grid-cols-[1fr_0.82fr]">
          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">{t("studentDetails")}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <FieldLabel>{t("studentName")}</FieldLabel>
                <p className="font-semibold text-foreground">{receipt.studentFullName}</p>
              </div>
              <div>
                <FieldLabel>{t("srNo")}</FieldLabel>
                <p className="font-medium">{receipt.admissionNo}</p>
              </div>
              <div>
                <FieldLabel>{t("classFieldLabel")}</FieldLabel>
                <p className="font-medium">{receipt.classLabel}</p>
              </div>
              <div>
                <FieldLabel>{t("fatherName")}</FieldLabel>
                <p className="font-medium">{receipt.fatherName || "-"}</p>
              </div>
              <div>
                <FieldLabel>{t("phone")}</FieldLabel>
                <p className="font-medium">{receipt.fatherPhone || "-"}</p>
              </div>
              <div>
                <FieldLabel>{t("route")}</FieldLabel>
                <p className="font-medium">{receipt.transportRouteLabel}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">{t("paymentDetails")}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <FieldLabel>{t("paymentDate")}</FieldLabel>
                <p className="font-medium">{formatDate(receipt.paymentDate)}</p>
              </div>
              <div>
                <FieldLabel>{t("paymentMode")}</FieldLabel>
                <p className="font-medium">{paymentModeLabel(receipt.paymentMode, t)}</p>
              </div>
              <div>
                <FieldLabel>{t("referenceNumber")}</FieldLabel>
                <p className="font-medium">{receipt.referenceNumber || "-"}</p>
              </div>
              <div>
                <FieldLabel>{t("receivedBy")}</FieldLabel>
                <p className="font-medium">{receipt.receivedBy || "-"}</p>
              </div>
            </div>
          </div>
        </section>

        <ConventionalDiscountBlock assignments={receipt.conventionalDiscountAssignments} t={t} />

        <section className="rounded-lg border border-border bg-card/95 p-4 print-compact">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t("installmentDetailsHeading")}</h2>
            <p className="text-xs text-muted-foreground">{t("paidTodayRows")}</p>
          </div>
          <div data-mobile-installment-stack className="space-y-2 sm:hidden print:hidden">
            {receipt.breakdown.map((item) => (
              <div key={`mobile-${item.paymentId}`} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.installmentLabel}</p>
                    <p className="text-xs text-muted-foreground">{t("dueShortPrefix", { date: formatDate(item.dueDate) })}</p>
                  </div>
                  <p className="text-base font-bold text-accent">{formatInr(item.amount)}</p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>{t("pendingBefore")}</span>
                  <span className="text-right font-medium text-foreground">{formatInr(item.amount)}</span>
                  <span>{t("allocated")}</span>
                  <span className="text-right font-medium text-foreground">{formatInr(item.amount)}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm font-semibold">
              <span>{t("paidTodayTotal")}</span>
              <span>{formatInr(breakdownTotal)}</span>
            </div>
          </div>
          <div data-print-installment-table className="hidden sm:block print:block overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">{t("installmentColumn")}</th>
                  <th className="px-2 py-2">{t("dueDateColumn")}</th>
                  <th className="px-2 py-2 text-right">{t("pendingBeforeColumn")}</th>
                  <th className="px-2 py-2 text-right">{t("allocatedColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {receipt.breakdown.map((item) => (
                  <tr key={item.paymentId} className="border-t border-border">
                    <td className="px-2 py-2 font-medium text-foreground">{item.installmentLabel}</td>
                    <td className="px-2 py-2">{formatDate(item.dueDate)}</td>
                    <td className="px-2 py-2 text-right">{formatInr(item.amount)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-2">
                  <td colSpan={3} className="px-2 py-2 text-right font-semibold">{t("paidTodayTotal")}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatInr(breakdownTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">{t("feeBreakup")}</h2>
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <tbody>
                  {receipt.feeSummary.map((item) => (
                    <tr key={item.label} className="border-t border-border first:border-t-0">
                      <td className="px-2 py-1.5">{localizedFeeLabel(item.label, t)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{formatInr(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm print-compact">
            <p>
              <span className="font-semibold">{t("amountInWords")}:</span>{" "}
              {amountInWords(receipt.totalAmount, t)}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p><span className="font-semibold">{t("discount")}:</span> {formatInr(receipt.discountAmount)}</p>
              <p><span className="font-semibold">{t("lateFee")}:</span> {formatInr(receipt.lateFeeAmount)}</p>
              <p><span className="font-semibold">{t("lateFeeWaived")}:</span> {formatInr(receipt.lateFeeWaived)}</p>
              <p><span className="font-semibold">{t("paidBefore")}:</span> {formatInr(receipt.totalPaidBeforeReceipt)}</p>
            </div>
            {receipt.notes ? (
              <p className="mt-2 text-foreground">
                <span className="font-semibold">{t("remarks")}:</span> {receipt.notes}
              </p>
            ) : null}
          </div>
        </section>

        <footer className="flex items-end justify-between gap-4 pt-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">{t("officialReceiptStatement")}</p>
            <p>{t("keepRecordsStatement")}</p>
          </div>
          <div className="min-w-48 border-t border-border-strong pt-2 text-center">
            {t("authorisedSignature")}
          </div>
        </footer>
      </div>
    </article>
  );
}
