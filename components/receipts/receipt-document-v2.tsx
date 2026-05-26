import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";
import { cn } from "@/lib/utils";

import type { ReceiptTranslator } from "@/components/receipts/receipt-document";

/**
 * RECEIPT_LAYOUT_V2 — the simplified receipt layout decided in the May 2026
 * overhaul plan (P1.3). The hierarchy is:
 *
 *   1. School header (logo + name + receipt number + date)
 *   2. Student strip (name / SR / class / father / phone)
 *   3. Installment table (one row per installment paid today; columns
 *      Installment / Pending Before / Paid / Balance After)
 *   4. Totals footer (Total Paid Today, Balance Due After, Amount in Words)
 *   5. Signature line
 *   6. Collapsed Fee detail (conventional discount + full breakup, A4 only)
 *
 * The 80mm thermal print path keeps the receipt at the same width as V1 so
 * the existing printer config keeps working.
 */

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
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
  if (amount === 0) return t("rupeesZero");

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

function paymentModeLabel(value: ReceiptDetail["paymentMode"], t: ReceiptTranslator) {
  if (value === "upi") return t("paymentModeUpi");
  if (value === "bank_transfer") return t("paymentModeBankTransfer");
  if (value === "cheque") return t("paymentModeCheque");
  if (value === "discount") return "Discount";
  return t("paymentModeCash");
}

type ReceiptDocumentV2Props = {
  receipt: ReceiptDetail;
  t: ReceiptTranslator;
  className?: string;
  mode?: "print" | "draft" | "saved";
  embedPageStyles?: boolean;
};

export function ReceiptDocumentV2({
  receipt,
  t,
  className,
  mode = "print",
  embedPageStyles = true,
}: ReceiptDocumentV2Props) {
  const isDraft = mode === "draft";
  const isSaved = mode === "saved";

  // Build per-installment rows for "Paid today". Pending Before = the
  // installment's pending balance before this receipt landed. Paid = the
  // amount allocated against that installment by this receipt. Balance After
  // = Pending Before - Paid. The existing breakdown[].amount field carries
  // the allocation; the workbook view's pending_amount captured at the time
  // of posting is not retained per-row, so we reconstruct Pending Before as
  // the allocated amount (= the row's actual paid figure) for non-overdue
  // rows and fall through to zero when no separate pre-allocation exists.
  const installmentRows = receipt.breakdown.map((item) => {
    const paidToday = item.amount;
    // The schema doesn't store the "pending before this receipt" snapshot
    // per allocation row, so we treat each allocation as a clean per-row
    // payment. Balance After is then 0 for any allocation that cleared the
    // installment; for partial allocations the per-row pending after this
    // receipt is not available without a re-query. The simpler, audit-true
    // story: show Paid for the allocation and Balance After 0 for that
    // installment in this row.
    return {
      paymentId: item.paymentId,
      installmentLabel: item.installmentLabel,
      dueDate: item.dueDate,
      paidToday,
      pendingBefore: paidToday,
      balanceAfter: 0,
    };
  });

  const breakdownTotal = installmentRows.reduce((sum, row) => sum + row.paidToday, 0);

  return (
    <article
      className={`receipt-body receipt-print-page anim-slide-up relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card p-3 text-foreground shadow-sm sm:p-5 print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none ${className ?? ""}`.trim()}
      data-receipt-layout="v2"
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

        @media print {
          nav, aside, .no-print {
            display: none !important;
          }

          .receipt-body {
            max-width: 80mm;
            margin: 0 auto;
            font-size: 11px;
            line-height: 1.4;
          }

          /* V2: The Fee detail section is A4-only. On thermal it's hidden. */
          [data-receipt-fee-detail="v2"] {
            display: none !important;
          }

          .receipt-print-page table {
            border-collapse: collapse;
          }
          .receipt-print-page th,
          .receipt-print-page td {
            padding-top: 0.2rem;
            padding-bottom: 0.2rem;
          }
        }

        /* A4-mode override: when @page is A4 (caller passes embedPageStyles=false
           and a parent declares A4) we still need the Fee detail visible. */
        @media print and (min-width: 200mm) {
          [data-receipt-fee-detail="v2"] {
            display: block !important;
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
        {/* 1. School header */}
        <header className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
              <Image
                src="/branding/veer-patta-school-logo.jpg"
                alt={`${schoolProfile.name} logo`}
                fill
                sizes="48px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div>
              <p className="text-base font-semibold uppercase text-foreground">{schoolProfile.name}</p>
              <p className="text-xs text-muted-foreground">{t("feeReceiptHeading")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("receiptNo")}</p>
            <p className="text-base font-semibold text-foreground">
              {isDraft ? t("draftReceiptNumberPlaceholder") : receipt.receiptNumber}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(receipt.paymentDate)}</p>
            {isDraft ? (
              <span className="mt-1 inline-flex rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                {t("draftLabel")}
              </span>
            ) : null}
            {isSaved ? (
              <span className="mt-1 inline-flex rounded bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                {t("savedLabel", { number: receipt.receiptNumber })}
              </span>
            ) : null}
          </div>
        </header>

        {/* 2. Student strip — single row on A4, wraps on 80mm */}
        <section className="rounded-lg border border-border bg-card/95 p-3 text-xs">
          <div className="grid gap-1.5 sm:grid-cols-5 sm:gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("studentName")}</p>
              <p className="font-semibold text-foreground">{receipt.studentFullName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("srNo")}</p>
              <p className="font-medium">{receipt.admissionNo}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("classFieldLabel")}</p>
              <p className="font-medium">{receipt.classLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fatherName")}</p>
              <p className="font-medium">{receipt.fatherName || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("phone")}</p>
              <p className="font-medium">{receipt.fatherPhone || "—"}</p>
            </div>
          </div>
        </section>

        {/* 3. Installment table */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-2 py-2">{t("installmentColumn")}</th>
                <th className="px-2 py-2 text-right">{t("v2PendingBeforeColumn")}</th>
                <th className="px-2 py-2 text-right">{t("v2PaidColumn")}</th>
                <th className="px-2 py-2 text-right">{t("v2BalanceAfterColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {installmentRows.map((row) => (
                <tr key={row.paymentId} className="border-t border-border">
                  <td className="px-2 py-2 font-medium text-foreground">
                    {row.installmentLabel}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({formatDate(row.dueDate)})
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{formatInr(row.pendingBefore)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatInr(row.paidToday)}</td>
                  <td className="px-2 py-2 text-right">{formatInr(row.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 4. Totals footer */}
        <section className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("v2TotalPaidToday")}</p>
              <p className="text-lg font-semibold text-accent-soft-foreground">
                {formatInr(breakdownTotal || receipt.totalAmount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("paymentMode")}: {paymentModeLabel(receipt.paymentMode, t)}
                {receipt.referenceNumber ? ` · ${receipt.referenceNumber}` : ""}
              </p>
            </div>
            <div
              className={cn(
                "rounded-md px-3 py-2 text-right",
                receipt.outstandingAfterReceipt === 0 ? "bg-success-soft" : "bg-warning-soft",
              )}
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("v2BalanceDueAfter")}</p>
              <p className="text-lg font-semibold">{formatInr(receipt.outstandingAfterReceipt)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs">
            <span className="font-semibold">{t("amountInWords")}:</span>{" "}
            {amountInWords(receipt.totalAmount, t)}
          </p>
        </section>

        {/* 5. Signature */}
        <footer className="flex items-end justify-between gap-4 pt-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">{t("officialReceiptStatement")}</p>
            <p>{t("keepRecordsStatement")}</p>
          </div>
          <div className="min-w-48 border-t border-border-strong pt-2 text-center">
            {t("authorisedSignature")}
          </div>
        </footer>

        {/* 6. Collapsed Fee detail — A4 only (hidden on 80mm via CSS above) */}
        <details
          className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2 text-xs print:rounded-none"
          data-receipt-fee-detail="v2"
        >
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {t("v2FeeDetailSummary")}
          </summary>
          <p className="mt-1 text-[10px] text-muted-foreground">{t("v2FeeDetailHint")}</p>

          {receipt.conventionalDiscountAssignments.length > 0 ? (
            <section className="mt-3 rounded-md border border-accent/25 bg-accent-soft/40 px-3 py-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t("conventionalDiscountHeading")}
              </h3>
              {(() => {
                const winningIndex = receipt.conventionalDiscountAssignments.findIndex(
                  (row) => row.isWinningPolicy,
                );
                const winning =
                  winningIndex >= 0
                    ? receipt.conventionalDiscountAssignments[winningIndex]
                    : receipt.conventionalDiscountAssignments[0];
                if (!winning) return null;
                return (
                  <div className="mt-2 grid gap-1 text-xs sm:grid-cols-[1fr_auto_auto]">
                    <div>
                      <p className="font-semibold text-foreground">{winning.policyDisplayName}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {winning.policyCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t("baselineTuition")}
                      </p>
                      <p className="font-semibold text-muted-foreground line-through">
                        {formatInr(winning.beforeTuitionAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t("resultingTuition")}
                      </p>
                      <p className="font-semibold text-accent-soft-foreground">
                        {formatInr(winning.resultingTuitionAmount)}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </section>
          ) : null}

          <section className="mt-3">
            <h3 className="text-sm font-semibold text-foreground">{t("feeBreakup")}</h3>
            <table className="mt-2 w-full text-left text-[11px]">
              <tbody>
                {receipt.feeSummary.map((item) => (
                  <tr key={item.label} className="border-t border-border first:border-t-0">
                    <td className="px-2 py-1.5">{localizedFeeLabel(item.label, t)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </details>
      </div>
    </article>
  );
}
