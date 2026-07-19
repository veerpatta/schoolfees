import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst, formatMediumDate } from "@/lib/helpers/date";
import { amountInWordsHindi } from "@/lib/helpers/amount-in-words-hi";
import { localizedFeeLabel } from "@/lib/fees/fee-label";
import type { ReceiptDetail } from "@/lib/receipts/types";
import { cn } from "@/lib/utils";

import type {
  BilingualReceiptTranslator,
  ReceiptTranslator,
} from "@/lib/i18n/bilingual-receipt";

/**
 * Simplified, point-in-time receipt layout — now fully bilingual.
 *
 * Every label renders English with the Devanagari Hindi underneath (muted),
 * because this is a parent-facing document: a parent always sees both
 * languages, regardless of which UI locale the staff member is using. The
 * translator is locale-independent (see `createBilingualReceiptTranslator`).
 *
 * Numeric figures and dates stay in Latin digits — only labels and the
 * amount-in-words line are translated, matching how Indian fee receipts read.
 */

// All money rendered via formatInr; all dates via the canonical helpers.
const formatDate = (value: string) => formatMediumDate(value);

/**
 * Renders an English string with its Hindi translation stacked underneath in a
 * muted block. The Hindi line is suppressed when it is identical to English
 * (e.g. an untranslated dynamic fee-head label) so nothing is duplicated.
 */
function BiText({
  en,
  hi,
  hiClassName,
}: {
  en: string;
  hi: string;
  hiClassName?: string;
}) {
  return (
    <>
      {en}
      {hi && hi !== en ? (
        <span
          className={cn(
            "block font-normal normal-case tracking-normal text-muted-foreground",
            hiClassName,
          )}
          lang="hi"
        >
          {hi}
        </span>
      ) : null}
    </>
  );
}

/** Bilingual label resolved from a translator key. */
function BiKey({
  t,
  k,
  values,
  suffix,
  hiClassName,
}: {
  t: BilingualReceiptTranslator;
  k: string;
  values?: Record<string, string | number>;
  /** Appended to both languages (e.g. " — {session}"). */
  suffix?: string;
  hiClassName?: string;
}) {
  const sfx = suffix ?? "";
  return (
    <BiText
      en={`${t.en(k, values)}${sfx}`}
      hi={`${t.hi(k, values)}${sfx}`}
      hiClassName={hiClassName}
    />
  );
}

/** Compact inline "English / हिंदी" — for tight spots like status pills. */
function biSlash(t: BilingualReceiptTranslator, k: string): string {
  const en = t.en(k);
  const hi = t.hi(k);
  return hi && hi !== en ? `${en} / ${hi}` : en;
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

/** English amount-in-words. `t` is a single-locale translator (use `bt.en`). */
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

function paymentModeText(value: ReceiptDetail["paymentMode"], t: ReceiptTranslator) {
  if (value === "upi") return t("paymentModeUpi");
  if (value === "bank_transfer") return t("paymentModeBankTransfer");
  if (value === "cheque") return t("paymentModeCheque");
  if (value === "discount") return t("discount");
  return t("paymentModeCash");
}

type ReceiptDocumentV2Props = {
  receipt: ReceiptDetail;
  t: BilingualReceiptTranslator;
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
  const hasAllocationSnapshot = installmentRows.some(
    (row) =>
      row.pendingBefore !== null ||
      row.pendingAfter !== null ||
      (row.discountAtPosting ?? 0) > 0 ||
      (row.waiverAtPosting ?? 0) > 0,
  );

  // Earliest still-unpaid installment due date — anchors the "what's next" line.
  const nextDue = receipt.installmentStatus.find(
    (row) => row.status !== "paid" && row.pending > 0,
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
          {t.en("draftWatermark")}
        </div>
      ) : null}

      {receipt.isVoided ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-center text-5xl font-semibold uppercase tracking-[0.2em] text-destructive/20 print:flex"
          aria-hidden="true"
        >
          REVERSED · VOID
        </div>
      ) : null}

      <div className="relative z-10 space-y-3">
        {receipt.isVoided ? (
          <div
            role="status"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive-soft-foreground"
          >
            This receipt has been reversed in full
            {typeof receipt.reversedAmount === "number" && receipt.reversedAmount > 0
              ? ` (${formatInr(receipt.reversedAmount)})`
              : ""}
            {" — it is no longer part of the student's paid total."}
            {receipt.voidReason ? ` Reason: ${receipt.voidReason}` : ""}
          </div>
        ) : null}
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
              <p className="mt-1 text-xs font-medium text-foreground">
                {t.en("feeReceiptHeading")} · <span lang="hi">{t.hi("feeReceiptHeading")}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <BiKey t={t} k="receiptNo" />
            </p>
            <p className="text-base font-semibold text-foreground">
              {isDraft ? t.en("draftReceiptNumberPlaceholder") : receipt.receiptNumber}
            </p>
            {isDraft ? (
              <span className="mt-1 inline-flex rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                {t.en("draftLabel")}
              </span>
            ) : null}
            {isSaved ? (
              <span className="mt-1 inline-flex rounded bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                {t.en("savedLabel", { number: receipt.receiptNumber })}
              </span>
            ) : null}
          </div>
        </header>

        {/* 2. Payment date — explicit subtitle. Anchors every figure below. */}
        <div className="flex items-baseline justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {t.en("paymentDateLabel")} / <span lang="hi">{t.hi("paymentDateLabel")}</span>:
            </span>{" "}
            {formatDate(receipt.paymentDate)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t.en("sessionLabelText", { session: receipt.sessionLabel })}
          </p>
        </div>

        {/* 2b. Receipt context — Posted by / Received by / Posted at. */}
        {(receipt.createdByName || receipt.receivedBy || receipt.createdAt) ? (
          <div
            className="grid gap-1 rounded-md border border-dashed border-border bg-surface-2/60 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground sm:grid-cols-3"
            data-receipt-context="v3"
          >
            <div>
              <p><BiKey t={t} k="postedByLabel" /></p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {receipt.createdByName ?? "—"}
              </p>
            </div>
            <div>
              <p><BiKey t={t} k="receivedBy" /></p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {receipt.receivedBy ?? "—"}
              </p>
            </div>
            <div>
              <p><BiKey t={t} k="postedAtIstLabel" /></p>
              <p className="mt-0.5 text-xs normal-case font-medium text-foreground">
                {formatDateTimeIst(receipt.createdAt)}
              </p>
            </div>
          </div>
        ) : null}

        {/* 2c. Close-out banner — non-cash write-off needs visual prominence. */}
        {receipt.paymentMode === "discount" ? (
          <div
            className="rounded-md border border-purple-300 bg-purple-50 px-3 py-2 text-xs text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-100"
            role="note"
          >
            <p className="font-semibold uppercase tracking-wide text-[11px]">
              {t.en("nonCashCloseoutTitle")} · <span lang="hi">{t.hi("nonCashCloseoutTitle")}</span>
            </p>
            <p className="mt-0.5">{t.en("nonCashCloseoutBody")}</p>
            <p className="mt-0.5" lang="hi">{t.hi("nonCashCloseoutBody")}</p>
          </div>
        ) : null}

        {/* 3. Student strip — single row on A4, wraps on 80mm */}
        <section className="rounded-lg border border-border bg-card/95 p-3 text-xs">
          <div className="grid gap-1.5 sm:grid-cols-5 sm:gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="studentName" />
              </p>
              <p className="font-semibold text-foreground">{receipt.studentFullName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="srNo" />
              </p>
              <p className="font-medium">{receipt.admissionNo}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="classFieldLabel" />
              </p>
              <p className="font-medium">{receipt.classLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="fatherName" />
              </p>
              <p className="font-medium">{receipt.fatherName || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="phone" />
              </p>
              <p className="font-medium">{receipt.fatherPhone || "—"}</p>
            </div>
          </div>
        </section>

        {/* 3b. Annual fee summary — total expected + full break-up. */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              <BiKey t={t} k="feeSummaryHeading" suffix={` — ${receipt.sessionLabel}`} hiClassName="text-xs" />
            </h3>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <BiKey t={t} k="totalExpectedThisYear" />
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
                    <td className="px-2 py-1.5">
                      <BiText
                        en={localizedFeeLabel(item.label, t.en)}
                        hi={localizedFeeLabel(item.label, t.hi)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {formatInr(item.amount)}
                    </td>
                  </tr>
                ))}
              {receipt.discountAmount > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-success-soft-foreground">
                    <BiKey t={t} k="discount" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-success-soft-foreground">
                    −{formatInr(receipt.discountAmount)}
                  </td>
                </tr>
              ) : null}
              {receipt.lateFeeAmount > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-destructive">
                    <BiKey t={t} k="lateFee" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-destructive">
                    +{formatInr(receipt.lateFeeAmount)}
                  </td>
                </tr>
              ) : null}
              {receipt.lateFeeWaived > 0 ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-success-soft-foreground">
                    <BiKey t={t} k="lateFeeWaived" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-success-soft-foreground">
                    −{formatInr(receipt.lateFeeWaived)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* 3c. Conventional discount audit. */}
        {receipt.conventionalDiscountAssignments.length > 0 ? (
          <section className="rounded-md border border-accent/25 bg-accent-soft/40 px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">
              <BiKey t={t} k="conventionalDiscountHeading" hiClassName="text-xs" />
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
                      <BiKey t={t} k="baselineTuition" />
                    </p>
                    <p className="font-semibold text-muted-foreground line-through tabular-nums">
                      {formatInr(row.beforeTuitionAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <BiKey t={t} k="resultingTuition" />
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
                        {biSlash(t, "appliedStatus")}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {biSlash(t, "notAppliedStatus")}
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
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <BiKey t={t} k="paidSoFar" />
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {formatInr(receipt.totalPaidToDate)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <BiKey t={t} k="thisReceiptLabel" />
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {formatInr(totalPaid)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <BiKey t={t} k="remainingLabel" />
            </p>
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

        {/* 3e. Installment status — live current standing. */}
        {receipt.installmentStatus.length > 0 ? (
          <section className="rounded-lg border border-border bg-card/95 p-3">
            <h3 className="text-sm font-semibold text-foreground">
              <BiKey t={t} k="installmentStatusHeading" hiClassName="text-xs" />
            </h3>
            <table className="mt-2 w-full text-left text-[11px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2"><BiKey t={t} k="installmentColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2DueDateColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="expectedColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2PaidColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="statusColumn" /></th>
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
                            <CheckCircle2 className="size-3.5" aria-hidden="true" /> {biSlash(t, "paidStatus")}
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
                            {t.en("amountDueStatus", { amount: formatInr(row.pending) })}
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

        {/* 4. What this receipt paid. */}
        <section className="rounded-lg border border-border bg-card/95 p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            <BiKey t={t} k="whatThisReceiptPaidHeading" hiClassName="text-xs" />
          </h3>
          {hasAllocationSnapshot ? (
            <table className="w-full text-left text-[11px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2"><BiKey t={t} k="installmentColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2DueDateColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="pendingBefore" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="discount" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="waiverColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2PaidColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="balanceAfterColumn" /></th>
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
                  <th className="px-2 py-2"><BiKey t={t} k="installmentColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2DueDateColumn" /></th>
                  <th className="px-2 py-2 text-right"><BiKey t={t} k="v2PaidColumn" /></th>
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
              {receipt.paymentMode === "discount" ? (
                <BiKey t={t} k="v2ClosedAsDiscount" />
              ) : (
                <BiKey t={t} k="v2TotalPaid" />
              )}
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
            <span className="font-medium">
              {t.en("paymentMode")} / <span lang="hi">{t.hi("paymentMode")}</span>:
            </span>{" "}
            {paymentModeText(receipt.paymentMode, t.en)} / <span lang="hi">{paymentModeText(receipt.paymentMode, t.hi)}</span>
            {receipt.referenceNumber ? ` · ${receipt.referenceNumber}` : ""}
          </p>

          <div className="my-2 border-t border-dashed border-border" />

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <BiKey t={t} k="v2BalanceDue" />
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

          {/* Amount in words — both languages, for legal clarity. */}
          <p className="mt-3 text-xs">
            <span className="font-semibold">{t.en("amountInWords")}:</span>{" "}
            {amountInWords(totalPaid, t.en)}
          </p>
          <p className="mt-0.5 text-xs" lang="hi">
            <span className="font-semibold">{t.hi("amountInWords")}:</span>{" "}
            {amountInWordsHindi(totalPaid)}
          </p>

          {/* What's next — one plain-language bilingual line. */}
          <div className="mt-3 border-t border-dashed border-border pt-2 text-xs">
            {receipt.outstandingAfterReceipt > 0 ? (
              <>
                <p className="font-medium text-warning-soft-foreground">
                  {nextDue
                    ? t.en("balanceDuePayBy", {
                        amount: formatInr(receipt.outstandingAfterReceipt),
                        date: formatDate(nextDue.dueDate),
                      })
                    : t.en("balanceDuePayByNoDate", {
                        amount: formatInr(receipt.outstandingAfterReceipt),
                      })}
                </p>
                <p className="font-medium text-warning-soft-foreground" lang="hi">
                  {nextDue
                    ? t.hi("balanceDuePayBy", {
                        amount: formatInr(receipt.outstandingAfterReceipt),
                        date: formatDate(nextDue.dueDate),
                      })
                    : t.hi("balanceDuePayByNoDate", {
                        amount: formatInr(receipt.outstandingAfterReceipt),
                      })}
                </p>
              </>
            ) : (
              <p className="font-medium text-success-soft-foreground">
                {t.en("allDuesClearedLine")} · <span lang="hi">{t.hi("allDuesClearedLine")}</span>
              </p>
            )}
          </div>
        </section>

        {/* 5b. Previous receipts — context for anyone reading this receipt. */}
        {receipt.previousReceipts.length > 0 ? (
          <section className="rounded-lg border border-border bg-card/95 p-3 text-xs">
            <h3 className="text-sm font-semibold text-foreground">
              <BiKey t={t} k="previousReceiptsHeading" hiClassName="text-xs" />
            </h3>
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
            <p className="font-medium text-foreground">{t.en("officialReceiptStatement")}</p>
            <p className="font-medium text-foreground" lang="hi">{t.hi("officialReceiptStatement")}</p>
            <p>{t.en("keepRecordsStatement")}</p>
            <p lang="hi">{t.hi("keepRecordsStatement")}</p>
          </div>
          <div className="min-w-48 border-t border-border-strong pt-2 text-center">
            <BiKey t={t} k="authorisedSignature" />
          </div>
        </footer>
      </div>
    </article>
  );
}
