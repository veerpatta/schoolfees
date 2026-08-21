import { Stamp } from "@/ui/primitives/stamp";
import Image from "next/image";

import { schoolProfile } from "@/platform/config/school";
import { formatInr } from "@/platform/helpers/currency";
import { formatMediumDate } from "@/platform/helpers/date";
import { englishAmountWords } from "@/platform/helpers/amount-in-words";
import { amountInWordsHindi } from "@/platform/helpers/amount-in-words-hi";
import type { ReceiptDetail } from "@/lib/receipts/types";
import { cn } from "@/platform/utils";

import { isYearCleared } from "@/lib/fees/year-clear";
import type {
  BilingualReceiptTranslator,
  ReceiptTranslator,
} from "@/platform/i18n/bilingual-receipt";

/**
 * "Ledger Calm 2.0" A4 receipt (V3).
 *
 * Structure: ink header band (serif school name, saffron rule, rotated stamp
 * box) → 4-col meta → success-soft amount hero with bilingual words inline →
 * "What this receipt paid" (Before/Paid/After) → "Year at a glance" tiles →
 * footer QR verify + signature → dashed parent stub.
 *
 * Fully bilingual like V2: every label renders English with Devanagari Hindi
 * underneath, because this is a parent-facing document. Figures and dates stay
 * in Latin digits. V2 remains available for reprints (`layout=v2`).
 */

const formatDate = (value: string) => formatMediumDate(value);

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

function biSlash(t: BilingualReceiptTranslator, k: string): string {
  const en = t.en(k);
  const hi = t.hi(k);
  return hi && hi !== en ? `${en} / ${hi}` : en;
}

function amountInWords(value: number, t: ReceiptTranslator) {
  const words = englishAmountWords(value, { style: "title" });
  if (!words) return t("rupeesZero");
  return `${words} ${t("rupeesSuffix")}`;
}

function paymentModeText(value: ReceiptDetail["paymentMode"], t: ReceiptTranslator) {
  if (value === "upi") return t("paymentModeUpi");
  if (value === "bank_transfer") return t("paymentModeBankTransfer");
  if (value === "cheque") return t("paymentModeCheque");
  if (value === "discount") return t("discount");
  return t("paymentModeCash");
}

function statusTileTone(status: "paid" | "partial" | "overdue" | "pending") {
  if (status === "paid") return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (status === "partial") return "border-warning/30 bg-warning-soft text-warning-soft-foreground";
  if (status === "overdue")
    return "border-destructive/30 bg-destructive-soft text-destructive-soft-foreground";
  return "border-border bg-surface-2 text-muted-foreground";
}

type ReceiptDocumentV3Props = {
  receipt: ReceiptDetail;
  t: BilingualReceiptTranslator;
  className?: string;
  mode?: "print" | "draft" | "saved";
  embedPageStyles?: boolean;
  /** Absolute verify URL encoded into the footer QR (e.g. https://…/r/SVP-001). */
  verifyUrl?: string | null;
  /** Pre-rendered QR SVG markup for `verifyUrl` (server-generated). */
  verifyQrSvg?: string | null;
};

export function ReceiptDocumentV3({
  receipt,
  t,
  className,
  mode = "print",
  embedPageStyles = true,
  verifyUrl = null,
  verifyQrSvg = null,
}: ReceiptDocumentV3Props) {
  const isDraft = mode === "draft";

  const rows = receipt.breakdown.map((item) => ({
    paymentId: item.paymentId,
    installmentLabel: item.installmentLabel,
    dueDate: item.dueDate,
    paid: item.amount,
    originalPaid: item.originalAmount,
    adjustmentAmount: item.adjustmentAmount,
    pendingBefore: item.pendingBeforePosting,
    pendingAfter: item.pendingAfterPosting,
  }));
  const breakdownTotal = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalPaid = breakdownTotal || receipt.totalAmount;

  // `totalPaidToDate` already counts everything applied across the session, so
  // it is the right "has anything actually been settled" signal here — this
  // receipt itself is part of it.
  const isYearClear = isYearCleared({
    outstandingAmount: receipt.currentOutstanding,
    totalPaid: receipt.totalPaidToDate,
  });

  const nextDue = receipt.installmentStatus.find(
    (row) => row.status !== "paid" && row.pending > 0,
  );

  return (
    <article
      className={`receipt-body receipt-print-page receipt-paper anim-slide-up relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border text-foreground shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none ${className ?? ""}`.trim()}
      data-receipt-layout="v3"
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

        /* Paper stock. The phone slip and this document are the same object to
           a parent — one is handed over at the counter, the other comes out of
           the printer — so they share the warm off-white the design uses for
           receipt paper rather than the app's card white. */
        .receipt-paper {
          background: #fffdf7;
        }

        /* Dotted leaders. On the phone slip these run horizontally from a
           particular to its amount, because that layout is two columns. This
           document carries four — installment, pending before, paid, balance
           after — which is more than a parent gets on the counter slip and
           worth keeping. So the leader becomes the rule BETWEEN rows: same
           dotted paper-ledger texture, without collapsing four columns into
           two to chase the mock literally. */
        .receipt-particulars tbody tr {
          border-top: 1px dotted hsl(222 12% 74%) !important;
        }
        .receipt-particulars tbody tr.receipt-total-row {
          border-top: 2px solid hsl(222 25% 14%) !important;
          border-bottom: 2px solid hsl(222 25% 14%) !important;
        }

        @media print {
          nav, aside, .no-print {
            display: none !important;
          }

          .receipt-body {
            margin: 0 auto;
          }

          /* On screen the ink band carries the hierarchy. On paper a
             full-width near-black slab per receipt is just toner — and the
             family batch reprint emits one per sibling page. Invert to paper
             with a saffron rule; the header keeps its weight without the
             flood fill. */
          .receipt-ink-band {
            background: #ffffff !important;
            color: hsl(var(--foreground)) !important;
            border-bottom: 2px solid hsl(var(--accent));
            padding-bottom: 0.5rem;
          }
          .receipt-ink-band .receipt-ink-muted {
            color: hsl(var(--muted-foreground)) !important;
          }
          /* Explicit text-nav-foreground children win over the band's
             inherited colour, so restate them for paper. */
          .receipt-ink-band .text-nav-foreground {
            color: hsl(var(--foreground)) !important;
          }
          .receipt-ink-band .receipt-ink-logo {
            border-color: hsl(var(--border)) !important;
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
          className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center text-center text-5xl font-semibold uppercase text-foreground/10 sm:flex print:flex"
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

      {/* 1. Letterhead — the design's paper receipt head.
          The ink band this replaces was a full-width near-black slab that
          printed as toner and, on a family batch reprint, once per sibling
          page. A centred letterhead over a double rule is what a fee slip
          actually looks like, and it costs nothing to print. */}
      <header className="px-4 pt-5 sm:px-6">
        <div className="flex flex-col items-center border-b-2 border-[hsl(222_25%_14%)] pb-3 text-center">
          <Image
            src="/branding/veer-patta-school-logo.jpg"
            alt={`${schoolProfile.name} logo`}
            width={96}
            height={96}
            className="mb-2 size-12 object-contain"
          />
          <h1 className="font-display text-lg font-bold leading-tight tracking-tight sm:text-xl">
            {schoolProfile.name}
          </h1>
          {schoolProfile.address || schoolProfile.phone || schoolProfile.email ? (
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {[schoolProfile.address, schoolProfile.phone, schoolProfile.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <span className="mt-2.5 inline-block border border-[hsl(222_25%_14%)] px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.16em]">
            <BiKey t={t} k="feeReceiptHeading" />
          </span>
        </div>

        {/* Number / date row — monospace between dashed rules, so the two
            things a parent quotes back to the office read as a ledger line. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[hsl(222_12%_70%)] py-2.5 font-mono text-[11px]">
          <span>
            {t.en("receiptNo")} <b className="tracking-tight">{receipt.receiptNumber}</b>
          </span>
          <span className="text-muted-foreground">
            {t.en("sessionLabelText", { session: receipt.sessionLabel })}
          </span>
          <span>{formatDate(receipt.paymentDate)}</span>
        </div>
      </header>

      <div className="p-3 sm:p-5 print:p-0 print:pt-3">
        {receipt.isVoided ? (
          <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-2.5 text-sm text-destructive-soft-foreground">
            <p className="font-semibold">
              This receipt has been reversed in full{receipt.voidReason ? ` — ${receipt.voidReason}` : "."}
            </p>
          </div>
        ) : null}

        {/* 2. Four-column meta */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="border-l-2 border-accent pl-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="studentName" />
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {receipt.studentFullName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t.en("srNo")} {receipt.admissionNo} · {receipt.classLabel}
            </p>
          </div>
          <div className="border-l border-border pl-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="fatherName" />
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {receipt.fatherName || "—"}
            </p>
            {receipt.fatherPhone ? (
              <p className="text-[11px] text-muted-foreground">{receipt.fatherPhone}</p>
            ) : null}
          </div>
          <div className="border-l border-border pl-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="paymentDate" />
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {formatDate(receipt.paymentDate)}
            </p>
            {receipt.receivedBy ? (
              <p className="text-[11px] text-muted-foreground">
                {t.en("receivedBy")}: {receipt.receivedBy}
              </p>
            ) : null}
          </div>
          <div className="border-l border-border pl-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="paymentMode" />
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {paymentModeText(receipt.paymentMode, t.en)}
            </p>
            <p className="text-[11px] text-muted-foreground" lang="hi">
              {paymentModeText(receipt.paymentMode, t.hi)}
            </p>
          </div>
        </section>

        {/* 3. Amount hero */}
        <section className="mt-4 rounded-xl border border-success/30 bg-success-soft px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-success-soft-foreground/80">
                <BiKey t={t} k="v2TotalPaid" hiClassName="text-success-soft-foreground/70" />
              </p>
              <p className="font-display-money mt-0.5 text-3xl leading-tight text-success-soft-foreground sm:text-4xl">
                {formatInr(totalPaid)}
              </p>
            </div>
            <div className="min-w-0 text-right text-[11px] leading-4 text-success-soft-foreground/90">
              <p className="font-medium">
                {t.en("amountInWords")}: {amountInWords(totalPaid, t.en)}
              </p>
              <p lang="hi">{amountInWordsHindi(totalPaid)}</p>
              {/* Where this payment leaves the year — a parent reads the
                  receipt to answer "how much of the year is done?" */}
              {receipt.totalDue > 0 ? (
                <p className="mt-1 font-semibold">
                  {Math.min(
                    100,
                    Math.round((receipt.totalPaidToDate / receipt.totalDue) * 100),
                  )}
                  % {t.en("paidSoFar").toLowerCase()} — {formatInr(receipt.totalPaidToDate)} /{" "}
                  {formatInr(receipt.totalDue)}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* 4. What this receipt paid */}
        <section className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <BiKey t={t} k="whatThisReceiptPaidHeading" />
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <table className="receipt-particulars w-full table-fixed text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2">
                    <BiKey t={t} k="installmentColumn" />
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    <BiKey t={t} k="pendingBeforeColumn" />
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    <BiKey t={t} k="v2PaidColumn" />
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    <BiKey t={t} k="balanceAfterColumn" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.paymentId} className="border-t border-border">
                    <td className="px-2.5 py-2">
                      <p className="font-medium text-foreground">{row.installmentLabel}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.en("dueDateColumn")} {formatDate(row.dueDate)}
                      </p>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                      {row.pendingBefore !== null ? formatInr(row.pendingBefore) : "—"}
                    </td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-foreground">
                      <span>{formatInr(row.paid)}</span>
                      {row.adjustmentAmount !== 0 ? (
                        <span className="block text-[9px] font-normal text-muted-foreground">
                          Corrected from {formatInr(row.originalPaid)} · adjustment{" "}
                          {row.adjustmentAmount > 0 ? "+" : "−"}
                          {formatInr(Math.abs(row.adjustmentAmount))}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                      {row.pendingAfter !== null ? formatInr(row.pendingAfter) : "—"}
                    </td>
                  </tr>
                ))}
                {/* Double rule above and below the total — the ledger
                    convention the design uses, and the line a parent's eye
                    lands on first. Overrides the dotted row rule above. */}
                <tr className="receipt-total-row border-y-2 border-[hsl(222_25%_14%)] font-semibold">
                  <td className="px-2.5 py-2 uppercase tracking-[0.08em]">
                    <BiKey t={t} k="v2TotalPaid" />
                  </td>
                  <td />
                  <td className="font-display-money px-2.5 py-2 text-right text-base tabular-nums text-foreground">
                    {formatInr(totalPaid)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                    {formatInr(Math.max(receipt.outstandingAfterReceipt, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {receipt.lateFeeAmount > 0 || receipt.lateFeeWaived > 0 || receipt.discountAmount > 0 ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {receipt.discountAmount > 0
                ? `${biSlash(t, "discount")}: −${formatInr(receipt.discountAmount)} · `
                : ""}
              {receipt.lateFeeAmount > 0
                ? `${biSlash(t, "lateFee")}: +${formatInr(receipt.lateFeeAmount)} · `
                : ""}
              {receipt.lateFeeWaived > 0
                ? `${biSlash(t, "lateFeeWaived")}: −${formatInr(receipt.lateFeeWaived)}`
                : ""}
            </p>
          ) : null}
        </section>

        {/* 4b. Conventional discount audit — same contract as V2: every
            considered policy renders, exactly one tagged Applied. */}
        {receipt.conventionalDiscountAssignments.length > 0 ? (
          <section className="mt-4 rounded-lg border border-accent/25 bg-accent-soft/40 px-3 py-2">
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

        {/* 5. Year at a glance */}
        {receipt.installmentStatus.length > 0 ? (
          <section className="mt-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="installmentStatusHeading" />
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {receipt.installmentStatus.map((row) => (
                <div
                  key={`status-${row.installmentNo}-${row.label}`}
                  className={cn("rounded-lg border px-2.5 py-2", statusTileTone(row.status))}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums">
                    {row.status === "paid"
                      ? `${t.en("paidStatus")} ✓`
                      : t.en("amountDueStatus", { amount: formatInr(row.pending) })}
                  </p>
                  <p className="text-[10px] opacity-70">{formatDate(row.dueDate)}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-surface-2/60 px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">
                {t.en("totalExpectedThisYear")}:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatInr(receipt.totalDue)}
                </span>
                {" · "}
                {t.en("paidSoFar")}:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatInr(receipt.totalPaidToDate)}
                </span>
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  receipt.currentOutstanding > 0
                    ? "text-warning-soft-foreground"
                    : "text-success-soft-foreground",
                )}
              >
                {receipt.currentOutstanding > 0
                  ? `${biSlash(t, "v2BalanceDue")}: ${formatInr(receipt.currentOutstanding)}`
                  : t.en("allDuesClearedLine")}
              </span>
            </div>
          </section>
        ) : null}

        {/* 6. Footer — QR verify + signature */}
        <footer className="mt-5 flex items-end justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            {verifyQrSvg ? (
              <span
                aria-hidden="true"
                className="block size-16 shrink-0 overflow-hidden rounded-md border border-border bg-white p-1 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: verifyQrSvg }}
              />
            ) : null}
            <div className="max-w-[260px] text-[10px] leading-4 text-muted-foreground">
              {verifyUrl ? (
                <p className="font-medium text-foreground">{verifyUrl}</p>
              ) : null}
              <p>
                <BiKey t={t} k="officialReceiptStatement" />
              </p>
            </div>
          </div>
          {/* PAID stamp — only on a receipt that is actually still valid. A
              reversed receipt already carries the VOID watermark, and stamping
              it PAID as well would be the document contradicting itself in the
              parent's hand. */}
          {!receipt.isVoided ? (
            <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex print:flex">
              <Stamp variant="paid" size="md" className="text-[13px]">
                {t.en("paidStamp")}
              </Stamp>
              {/* YEAR CLEARED — the parent asked what this receipt proves, and
                  "PAID" only ever meant "this instalment". Stamped on EVERY
                  receipt for a settled student, reprints included, so a copy
                  pulled out months later still proves the year was closed. */}
              {isYearClear ? (
                <Stamp variant="year-cleared" size="md">
                  {t.en("yearClearedStamp")}
                </Stamp>
              ) : null}
            </div>
          ) : null}

          <div className="shrink-0 text-center">
            <div className="h-10 w-40 border-b border-border-strong" aria-hidden="true" />
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <BiKey t={t} k="authorisedSignature" />
            </p>
          </div>
        </footer>

        {/* 7. Parent stub — cut along the dashes.
            The perforation strip above it is the design's tear line: a row of
            half-circles bitten out of the edge, so it is obvious the bottom
            band detaches even before anyone reads the label. */}
        <div
          aria-hidden="true"
          className="mt-5 flex h-2.5 items-start justify-between overflow-hidden px-1"
        >
          {Array.from({ length: 42 }, (_, index) => (
            <span
              key={index}
              className="-mt-1 size-2.5 shrink-0 rounded-full bg-[hsl(222_22%_14%)] opacity-15"
            />
          ))}
        </div>

        <section className="rounded-b-lg border border-dashed border-border-strong bg-[hsl(44_30%_96%)] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 text-xs">
            <span className="font-semibold text-foreground">
              {t.en("receiptNo")} {receipt.receiptNumber}
            </span>
            <span className="text-muted-foreground">
              {receipt.studentFullName} · {receipt.classLabel}
            </span>
            <span className="font-semibold tabular-nums text-success-soft-foreground">
              {t.en("v2TotalPaid")}: {formatInr(totalPaid)}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {biSlash(t, "v2BalanceDue")}: {formatInr(Math.max(receipt.currentOutstanding, 0))}
            </span>
            {nextDue ? (
              <span className="text-muted-foreground">
                {t.en("balanceDuePayBy", {
                  amount: formatInr(Math.max(receipt.currentOutstanding, 0)),
                  date: formatDate(nextDue.dueDate),
                })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            <BiKey t={t} k="keepRecordsStatement" />
          </p>
        </section>
      </div>
    </article>
  );
}
