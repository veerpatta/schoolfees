import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";
import { cn } from "@/lib/utils";

import type { ReceiptTranslator } from "@/components/receipts/receipt-document";

/**
 * Simplified, point-in-time receipt layout.
 *
 * Hierarchy:
 *   1. School header (logo + name + address / phone / email + receipt number)
 *   2. Payment date subtitle (anchors every figure on the receipt)
 *   3. Student strip (name / SR / class / father / phone)
 *   4. Installment table (Installment / Due date / Paid — that's it)
 *   5. Totals block (Total Paid / mode line / Balance Due / In words)
 *   6. Signature line
 *   7. (Screen only) Fee detail disclosure — not printed
 *
 * Label policy: every figure references the receipt's payment date, not
 * the current calendar day. No "Today" / "Paid Today" wording. A reprinted
 * receipt from 3 months ago reads honestly without any new translator
 * branch — the labels are time-neutral.
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

  // Per-installment rows. Pending Before / Balance After columns are gone:
  // they were synthesized at render time (the schema doesn't snapshot
  // pre-allocation balances per row), so they were never true data. The
  // receipt now shows what was actually paid against each installment —
  // that's all parents need and all the data we genuinely have.
  const installmentRows = receipt.breakdown.map((item) => ({
    paymentId: item.paymentId,
    installmentLabel: item.installmentLabel,
    dueDate: item.dueDate,
    paid: item.amount,
  }));
  const breakdownTotal = installmentRows.reduce((sum, row) => sum + row.paid, 0);
  const totalPaid = breakdownTotal || receipt.totalAmount;

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

          /* Fee detail disclosure is screen-only; never printed. */
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
        {/* 1. School header — logo, name, address / phone / email, receipt # */}
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
            <div className="min-w-0">
              <p className="text-base font-semibold uppercase text-foreground">{schoolProfile.name}</p>
              {schoolProfile.address ? (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {schoolProfile.address}
                </p>
              ) : null}
              {(schoolProfile.phone || schoolProfile.email) ? (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {schoolProfile.phone}
                  {schoolProfile.phone && schoolProfile.email ? " · " : ""}
                  {schoolProfile.email}
                </p>
              ) : null}
              <p className="mt-1 text-xs font-medium text-foreground">{t("feeReceiptHeading")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("receiptNo")}</p>
            <p className="text-base font-semibold text-foreground">
              {isDraft ? t("draftReceiptNumberPlaceholder") : receipt.receiptNumber}
            </p>
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

        {/* 2. Payment date — explicit subtitle. Anchors every figure below. */}
        <div className="flex items-baseline justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t("paymentDateLabel")}:</span>{" "}
            {formatDate(receipt.paymentDate)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("sessionLabelText", { session: receipt.sessionLabel })}
          </p>
        </div>

        {/* 3. Student strip — single row on A4, wraps on 80mm */}
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

        {/* 4. Installment table — 3 columns, no synthesized data */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-2 py-2">{t("installmentColumn")}</th>
                <th className="px-2 py-2 text-right">{t("v2DueDateColumn")}</th>
                <th className="px-2 py-2 text-right">{t("v2PaidColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {installmentRows.map((row) => (
                <tr key={row.paymentId} className="border-t border-border">
                  <td className="px-2 py-2 font-medium text-foreground">
                    {row.installmentLabel}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                    {formatDate(row.dueDate)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {formatInr(row.paid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5. Totals block — single column, dense, scannable. */}
        <section className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {receipt.paymentMode === "discount"
                ? t("v2ClosedAsDiscount")
                : t("v2TotalPaid")}
            </p>
            <p
              className={cn(
                "text-xl font-semibold tabular-nums",
                receipt.paymentMode === "discount"
                  ? "text-purple-900 dark:text-purple-100"
                  : "text-foreground",
              )}
            >
              {formatInr(totalPaid)}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("paymentMode")}: {paymentModeLabel(receipt.paymentMode, t)}
            {receipt.referenceNumber ? ` · ${receipt.referenceNumber}` : ""}
            {receipt.paymentMode === "discount" ? (
              <span className="ml-1 font-medium text-purple-800 dark:text-purple-200">
                · non-cash, written off
              </span>
            ) : null}
          </p>

          <div className="my-2 border-t border-dashed border-border" />

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("v2BalanceDue")}
            </p>
            <p
              className={cn(
                "font-semibold tabular-nums",
                receipt.outstandingAfterReceipt === 0
                  ? "text-success-soft-foreground"
                  : "text-warning-soft-foreground",
              )}
            >
              {formatInr(receipt.outstandingAfterReceipt)}
            </p>
          </div>

          <p className="mt-3 text-xs">
            <span className="font-semibold">{t("amountInWords")}:</span>{" "}
            {amountInWords(totalPaid, t)}
          </p>
        </section>

        {/* 6. Signature */}
        <footer className="flex items-end justify-between gap-4 pt-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">{t("officialReceiptStatement")}</p>
            <p>{t("keepRecordsStatement")}</p>
          </div>
          <div className="min-w-48 border-t border-border-strong pt-2 text-center">
            {t("authorisedSignature")}
          </div>
        </footer>

        {/* 7. Fee detail disclosure — screen-only, never printed. Office
            staff who need the full fee breakup can expand on screen. */}
        <details
          className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2 text-xs"
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
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatInr(item.amount)}</td>
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
