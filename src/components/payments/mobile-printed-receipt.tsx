"use client";

import { CountUp } from "@/ui/primitives/count-up";
import { amountInWordsEnglish } from "@/platform/helpers/amount-in-words";
import { amountInWordsHindi } from "@/platform/helpers/amount-in-words-hi";
import { formatInr } from "@/platform/helpers/currency";
import { schoolProfile } from "@/platform/config/school";
import { Stamp } from "@/ui/primitives/stamp";
import { isYearCleared } from "@/lib/fees/year-clear";
import { cn } from "@/platform/utils";

/**
 * The paper receipt, on the phone (mobile app v2, Collect step 5).
 *
 * A counter clerk hands a parent a printed slip a hundred times a week. When
 * the screen after "save" looks like that slip — paper stock, dotted leaders,
 * a monospace ledger, double rules under the total, a PAID stamp and a
 * tear-off parent stub — the clerk can check it against the thing in their
 * hand without translating between two visual languages.
 *
 * Print fidelity lives in receipt-document-v3 (A4, bilingual). This is a
 * confirmation surface, not a printable document: it stays on screen and is
 * marked `print:hidden` so it never competes with the real receipt.
 */

export type PrintedReceiptLine = {
  label: string;
  amount: number;
};

export function MobilePrintedReceipt({
  receiptNumber,
  studentFullName,
  fatherName,
  admissionNo,
  classLabel,
  amountReceived,
  lines,
  paymentDate,
  paymentModeLabel,
  referenceNumber,
  receivedBy,
  remainingBalance,
  isYearClear,
  isVoided = false,
  countUpTotal = false,
  className,
}: {
  receiptNumber: string;
  studentFullName: string;
  fatherName?: string | null;
  admissionNo: string;
  classLabel: string;
  amountReceived: number;
  /** Particulars. Falls back to a single "Fee received" line. */
  lines?: PrintedReceiptLine[];
  paymentDate: string;
  paymentModeLabel: string;
  referenceNumber?: string;
  receivedBy: string;
  remainingBalance: number;
  /**
   * Whether the whole year is settled. Supplied by callers that hold the full
   * picture (cash paid to date plus any discount close-out); when omitted it is
   * derived from this receipt alone, which is correct for the common case of a
   * final payment clearing the balance.
   */
  isYearClear?: boolean;
  /**
   * Reversed in full. The A4 document has carried a REVERSED · VOID watermark
   * since v2, but it is `hidden md:block` — so a phone reprint of a reversed
   * receipt showed nothing at all and read as valid. A clerk could hand that
   * to a parent.
   */
  isVoided?: boolean;
  /**
   * Count the total up from zero as the slip feeds out. Opt-in, and only the
   * just-posted success sheet opts in: on a reprint the figure is history, and
   * a number that climbs would suggest something is being recalculated. The
   * desktop sheet has had a count-up since the redesign; the phone — the only
   * surface a clerk actually uses — had none, which is why "payment saved"
   * read as static there.
   */
  countUpTotal?: boolean;
  className?: string;
}) {
  const yearClear =
    isYearClear ??
    isYearCleared({ outstandingAmount: remainingBalance, totalPaid: amountReceived });

  const particulars: PrintedReceiptLine[] =
    lines && lines.length > 0 ? lines : [{ label: "Fee received", amount: amountReceived }];

  return (
    <div className={cn("print:hidden", className)}>
      {/* Printer slot — the paper appears to feed out of it. */}
      <div
        aria-hidden="true"
        className="h-[9px] rounded-[3px] bg-nav-surface shadow-[inset_0_-2px_3px_hsl(var(--scrim)/0.6)]"
      />

      <div className="overflow-hidden rounded-b">
        <div className="anim-print-out relative bg-[#fffdf7] px-4 pt-4 text-[hsl(222_25%_11%)] shadow-lg">
          {isVoided ? (
            <div
              className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
              aria-hidden="true"
            >
              <span className="-rotate-[14deg] text-3xl font-extrabold uppercase tracking-[0.2em] text-destructive/25">
                REVERSED
              </span>
            </div>
          ) : null}
          {/* ── Letterhead ─────────────────────────────────────────── */}
          <div className="border-b-2 border-[hsl(222_25%_14%)] pb-2.5 text-center">
            <p className="font-display-money text-[17px] font-bold leading-tight tracking-tight">
              {schoolProfile.name}
            </p>
            {schoolProfile.address || schoolProfile.phone ? (
              <p className="mt-1 text-[9px] text-[hsl(222_9%_46%)]">
                {[schoolProfile.address, schoolProfile.phone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <span className="mt-2 inline-block border border-[hsl(222_25%_14%)] px-3 py-0.5 text-[10px] font-extrabold tracking-[0.16em]">
              शुल्क रसीद / FEE RECEIPT
            </span>
          </div>

          {/* ── Number + date ──────────────────────────────────────── */}
          <div className="flex justify-between border-b border-dashed border-[hsl(222_12%_70%)] py-2.5 font-mono text-[10.5px]">
            <span>
              No. <b>{receiptNumber}</b>
            </span>
            <span>{paymentDate}</span>
          </div>

          {/* ── Who ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1 border-b border-dashed border-[hsl(222_12%_70%)] py-2.5 text-[11px]">
            {[
              { label: "Student", value: studentFullName },
              { label: "Father", value: fatherName || "—" },
              { label: "Class", value: `${classLabel} · SR ${admissionNo}` },
            ].map((row) => (
              <div key={row.label} className="flex gap-1.5">
                <span className="w-[74px] shrink-0 text-[hsl(222_9%_46%)]">{row.label}</span>
                <b className="min-w-0 flex-1 break-words">{row.value}</b>
              </div>
            ))}
          </div>

          {/* ── Ledger ─────────────────────────────────────────────── */}
          <div className="pt-2.5 font-mono text-[11px]">
            <div className="flex justify-between border-b border-[hsl(222_12%_78%)] pb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[hsl(222_9%_46%)]">
              <span>Particulars</span>
              <span>Amount</span>
            </div>
            {particulars.map((line) => (
              <div key={line.label} className="flex items-baseline gap-1.5 py-1.5">
                <span>{line.label}</span>
                {/* Dotted leader — the thing that makes a slip read as a slip. */}
                <span
                  aria-hidden="true"
                  className="-translate-y-[3px] flex-1 border-b border-dotted border-[hsl(222_12%_74%)]"
                />
                <b>{formatInr(line.amount)}</b>
              </div>
            ))}

            <div className="mt-1.5 flex items-center justify-between border-y-2 border-[hsl(222_25%_14%)] py-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]">
                Total received
              </span>
              <b className="font-display-money text-xl">
                {countUpTotal ? (
                  <CountUp value={amountReceived} format="inr" duration={520} />
                ) : (
                  formatInr(amountReceived)
                )}
              </b>
            </div>

            <p className="pt-1.5 text-[9.5px] leading-relaxed text-[hsl(222_9%_40%)]">
              {amountInWordsEnglish(amountReceived)}
              <br />
              <span lang="hi">{amountInWordsHindi(amountReceived)}</span>
              <br />
              Mode: {paymentModeLabel}
              {referenceNumber ? ` · Ref: ${referenceNumber}` : ""} · Received by:{" "}
              {receivedBy || "—"}
            </p>
          </div>

          {/* ── Stamp row ──────────────────────────────────────────── */}
          <div className="flex items-end justify-between gap-2.5 pb-3.5 pt-2.5">
            <div className="grid size-[52px] place-items-center bg-[hsl(222_25%_14%)] text-center text-[7.5px] font-extrabold leading-tight text-white">
              QR
              <br />
              VERIFY
            </div>
            <div className="flex-1 text-center">
              {/* No PAID stamp on a reversed receipt — the slip would be
                  contradicting its own watermark in the parent's hand. */}
              {isVoided ? null : (
                <div className="flex flex-col items-center gap-1">
                  <Stamp
                    variant="paid"
                    className="anim-stamp-in text-[13px] [animation-delay:750ms]"
                  >
                    PAID
                  </Stamp>
                  {/* The phone slip is what most parents actually get handed, and
                      it was the one receipt surface with no YEAR CLEARED mark —
                      so the proof that the year is settled was missing from the
                      copy most likely to be kept. */}
                  {yearClear ? (
                    <Stamp
                      variant="year-cleared"
                      size="sm"
                      className="anim-stamp-in [animation-delay:900ms]"
                    >
                      YEAR CLEARED
                    </Stamp>
                  ) : null}
                </div>
              )}
            </div>
            <div className="text-right text-[8.5px] text-[hsl(222_9%_46%)]">
              <div className="h-[22px] w-[82px] border-b border-[hsl(222_12%_50%)]" />
              Authorised signatory
            </div>
          </div>

          {/* ── Tear-off parent stub ───────────────────────────────── */}
          <div className="-mx-4 flex items-center justify-between border-t border-dashed border-[hsl(222_12%_60%)] bg-[hsl(44_30%_96%)] px-4 py-2 text-[9.5px]">
            <span className="text-[hsl(222_9%_40%)]">Parent copy · {receiptNumber}</span>
            <b className={remainingBalance > 0 ? "text-destructive" : "text-success"}>
              Balance now {formatInr(remainingBalance)}
            </b>
          </div>

          {/* Perforation — half-circles bitten out of the bottom edge. */}
          <div aria-hidden="true" className="-mx-4 flex h-2.5 overflow-hidden">
            {Array.from({ length: 26 }, (_, index) => (
              <span
                key={index}
                className="-mt-1 size-3.5 shrink-0 rounded-full bg-nav"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
