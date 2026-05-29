import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst, formatMediumDate } from "@/lib/helpers/date";
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

// All money rendered via formatInr; all dates via the canonical helpers.
// Use formatMediumDate so the receipt date matches every other screen's date
// format. No local Intl.DateTimeFormat — clarity audit forbids it.
const formatDate = (value: string) => formatMediumDate(value);

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

  // Per-installment rows. After migration 20260527000000, every payments
  // row carries the moment-of-posting allocation context (discount, waiver,
  // pending before/after). Older rows have NULL for those — rendered as "—"
  // via the canonical Money fallback. The receipt is now point-in-time
  // truthful: a 3-month-old reprint shows exactly what the staff member saw
  // when posting.
  const installmentRows = receipt.breakdown.map((item) => ({
    paymentId: item.paymentId,
    installmentLabel: item.installmentLabel,
    dueDate: item.dueDate,
    paid: item.amount,
    discountAtPosting: item.discountAppliedAtPosting,
    waiverAtPosting: item.waiverAppliedAtPosting,
    pendingBefore: item.pendingBeforePosting,
    pendingAfter: item.pendingAfterPosting,
  }));
  const breakdownTotal = installmentRows.reduce((sum, row) => sum + row.paid, 0);
  const totalPaid = breakdownTotal || receipt.totalAmount;
  // Show the rich breakdown columns only if at least one row carries
  // post-migration snapshot data. Legacy rows render the compact 3-column
  // layout. This keeps reprints of pre-migration receipts honest.
  const hasAllocationSnapshot = installmentRows.some(
    (row) =>
      row.pendingBefore !== null ||
      row.pendingAfter !== null ||
      (row.discountAtPosting ?? 0) > 0 ||
      (row.waiverAtPosting ?? 0) > 0,
  );

  return (
    <article
      className={`receipt-body receipt-print-page anim-slide-up relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card p-3 text-foreground shadow-sm sm:p-5 print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none ${className ?? ""}`.trim()}
      data-receipt-layout="v2"
    >
      <style>{`
        ${embedPageStyles ? `@page {
          size: A4;
          margin: 12mm;
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
            margin: 0 auto;
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

        {/* 2b. Receipt context — Posted by / Received by / Created at.
            Always present so a printed reprint reads honestly: who handled the
            cash, who entered it, and when. Falls back to "—" when a field is
            blank (e.g. older receipts had no received_by). */}
        {(receipt.createdByName || receipt.receivedBy || receipt.createdAt) ? (
          <div
            className="grid gap-1 rounded-md border border-dashed border-border bg-surface-2/60 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground sm:grid-cols-3"
            data-receipt-context="v3"
          >
            <div>
              <p>Posted by</p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {receipt.createdByName ?? "—"}
              </p>
            </div>
            <div>
              <p>Received by</p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {receipt.receivedBy ?? "—"}
              </p>
            </div>
            <div>
              <p>Posted at (IST)</p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {formatDateTimeIst(receipt.createdAt)}
              </p>
            </div>
          </div>
        ) : null}

        {/* 2c. Close-out banner — non-cash write-off needs visual prominence.
            A receipt where payment_mode = 'discount' is NOT cash that changed
            hands; it's pending fees written off as a one-time courtesy. We
            elevate this from a footnote in the totals into a full banner so
            staff and parents never mistake it for a paid receipt. */}
        {receipt.paymentMode === "discount" ? (
          <div
            className="rounded-md border border-purple-300 bg-purple-50 px-3 py-2 text-xs text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-100"
            role="note"
          >
            <p className="font-semibold uppercase tracking-wide text-[11px]">
              Non-cash close-out
            </p>
            <p className="mt-0.5">
              No money was received. The pending amount was written off as a one-time
              discount. The receipt records this for the audit trail.
            </p>
          </div>
        ) : null}

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

        {/* 3b. Annual fee summary — total expected for the session and the full
            break-up. Discount, late fee, and late-fee waiver are each shown on
            their own explicitly-signed, colour-coded line so the figures read
            honestly to anyone who sees the receipt. */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Fee summary — {receipt.sessionLabel}
            </h3>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Total expected this year
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatInr(receipt.totalDue)}
              </p>
            </div>
          </div>
          <table className="mt-2 w-full text-left text-xs">
            <tbody>
              {receipt.feeSummary
                .filter((item) => item.amount > 0 && !/discount|late fee/i.test(item.label))
                .map((item) => (
                  <tr key={item.label} className="border-t border-border first:border-t-0">
                    <td className="px-2 py-1.5">{localizedFeeLabel(item.label, t)}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {formatInr(item.amount)}
                    </td>
                  </tr>
                ))}
              {receipt.discountAmount > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-success-soft-foreground">Discount</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-success-soft-foreground">
                    −{formatInr(receipt.discountAmount)}
                  </td>
                </tr>
              ) : null}
              {receipt.lateFeeAmount > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-destructive">Late fee</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-destructive">
                    +{formatInr(receipt.lateFeeAmount)}
                  </td>
                </tr>
              ) : null}
              {receipt.lateFeeWaived > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-success-soft-foreground">Late fee waived</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-success-soft-foreground">
                    −{formatInr(receipt.lateFeeWaived)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* 3c. Conventional discount audit — moved out of the old screen-only
            disclosure so it prints. Shows every active policy; the winning one
            (lowest resulting tuition) is marked Applied. */}
        {receipt.conventionalDiscountAssignments.length > 0 ? (
          <section className="rounded-md border border-accent/25 bg-accent-soft/40 px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("conventionalDiscountHeading")}
            </h3>
            <ul className="mt-2 space-y-2">
              {receipt.conventionalDiscountAssignments.map((row) => (
                <li
                  key={row.policyCode}
                  className={cn(
                    "grid gap-1 rounded-md border px-2.5 py-1.5 text-xs sm:grid-cols-[1fr_auto_auto_auto]",
                    row.isWinningPolicy
                      ? "border-accent/40 bg-card"
                      : "border-border bg-surface-2/40 opacity-80",
                  )}
                >
                  <div>
                    <p className="font-semibold text-foreground">{row.policyDisplayName}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {row.policyCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("baselineTuition")}
                    </p>
                    <p className="font-semibold text-muted-foreground line-through tabular-nums">
                      {formatInr(row.beforeTuitionAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("resultingTuition")}
                    </p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        row.isWinningPolicy ? "text-accent-soft-foreground" : "text-muted-foreground",
                      )}
                    >
                      {formatInr(row.resultingTuitionAmount)}
                    </p>
                  </div>
                  <div className="self-center">
                    {row.isWinningPolicy ? (
                      <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        Applied
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Not applied
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 3d. Payment progress — paid so far / this receipt / remaining. */}
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid so far</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {formatInr(receipt.totalPaidToDate)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">This receipt</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {formatInr(totalPaid)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p
              className={cn(
                "mt-1 text-base font-semibold tabular-nums",
                receipt.outstandingAfterReceipt === 0
                  ? "text-success-soft-foreground"
                  : "text-warning-soft-foreground",
              )}
            >
              {formatInr(receipt.outstandingAfterReceipt)}
            </p>
          </div>
        </section>

        {/* 3e. Installment status — every installment in the session with a
            green tick when fully cleared, or the amount still due when not.
            Live current standing (not a point-in-time snapshot). */}
        {receipt.installmentStatus.length > 0 ? (
          <section className="rounded-lg border border-border bg-card/95 p-3">
            <h3 className="text-sm font-semibold text-foreground">Installment status</h3>
            <table className="mt-2 w-full text-left text-[11px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Installment</th>
                  <th className="px-2 py-2 text-right">Due date</th>
                  <th className="px-2 py-2 text-right">Expected</th>
                  <th className="px-2 py-2 text-right">Paid</th>
                  <th className="px-2 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {receipt.installmentStatus.map((row) => {
                  const cleared = row.status === "paid" || row.pending <= 0;
                  return (
                    <tr key={row.installmentNo} className="border-t border-border">
                      <td className="px-2 py-2 font-medium text-foreground">{row.label}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatInr(row.expected)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatInr(row.paid)}</td>
                      <td className="px-2 py-2 text-right">
                        {cleared ? (
                          <span className="inline-flex items-center justify-end gap-1 font-medium text-success-soft-foreground">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Paid
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              row.status === "overdue"
                                ? "text-destructive"
                                : "text-warning-soft-foreground",
                            )}
                          >
                            {formatInr(row.pending)} due
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* 4. Installment table.
            With allocation snapshot present (post-migration rows): full
            breakdown — Installment / Due / Pending before / Discount /
            Waiver / Paid / Balance after.
            Legacy rows (pre-migration): compact 3-column layout. */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">What this receipt paid</h3>
          {hasAllocationSnapshot ? (
            <table className="w-full text-left text-[11px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">{t("installmentColumn")}</th>
                  <th className="px-2 py-2 text-right">{t("v2DueDateColumn")}</th>
                  <th className="px-2 py-2 text-right">Pending before</th>
                  <th className="px-2 py-2 text-right">Discount</th>
                  <th className="px-2 py-2 text-right">Waiver</th>
                  <th className="px-2 py-2 text-right">{t("v2PaidColumn")}</th>
                  <th className="px-2 py-2 text-right">Balance after</th>
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
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.pendingBefore !== null ? formatInr(row.pendingBefore) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-success-soft-foreground">
                      {row.discountAtPosting && row.discountAtPosting > 0
                        ? `−${formatInr(row.discountAtPosting)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-info-soft-foreground">
                      {row.waiverAtPosting && row.waiverAtPosting > 0
                        ? `−${formatInr(row.waiverAtPosting)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatInr(row.paid)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.pendingAfter !== null ? (
                        <span
                          className={
                            row.pendingAfter === 0
                              ? "font-medium text-success-soft-foreground"
                              : "font-medium text-warning-soft-foreground"
                          }
                        >
                          {formatInr(row.pendingAfter)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
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
          )}
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
            {/* The close-out treatment is now shown as a full banner above the
                totals block (see section 2c), so the trailing footnote here is
                no longer needed. */}
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

        {/* 5b. Previous receipts — context for anyone reading this receipt. */}
        {receipt.previousReceipts.length > 0 ? (
          <section className="rounded-lg border border-border bg-card/95 p-3 text-xs">
            <h3 className="text-sm font-semibold text-foreground">Previous receipts</h3>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {receipt.previousReceipts.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-surface-2/60 px-2 py-1 tabular-nums"
                >
                  <span className="font-medium text-foreground">{item.receiptNumber}</span>
                  <span className="text-muted-foreground">{formatDate(item.paymentDate)}</span>
                  <span className="font-semibold text-foreground">{formatInr(item.totalAmount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
      </div>
    </article>
  );
}
