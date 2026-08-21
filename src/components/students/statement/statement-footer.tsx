import { amountInWordsEnglishFormal } from "@/platform/helpers/amount-in-words";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";

/**
 * The signed foot of the sheet: the payable figure in words, what falls due
 * next, and who issued it.
 *
 * `mt-auto` pins it to the bottom of the page box — the sheet is a flex column,
 * so a short statement still signs off at the foot of the paper.
 *
 * The late-fee figure comes from the active policy rather than a typed ₹1,000,
 * so the sentence cannot drift from what the engine actually charges.
 */
export function StatementFooter({
  stillPayable,
  lateFeeFlatAmount,
  nextDueLabel,
  nextDueDate,
  nextDueAmount,
  identifier,
  closingNote,
  showLateFeePolicy = true,
}: {
  stillPayable: number;
  lateFeeFlatAmount: number;
  nextDueLabel?: string | null;
  nextDueDate?: string | null;
  nextDueAmount?: number | null;
  identifier: string;
  closingNote?: string;
  /** Off where the sheet already states the policy in its own right (family page 2). */
  showLateFeePolicy?: boolean;
}) {
  const nextDue =
    nextDueDate && nextDueLabel
      ? `${nextDueLabel} on ${formatShortDate(nextDueDate)}${
          nextDueAmount ? ` · ${formatInr(nextDueAmount)}` : ""
        }`
      : null;

  return (
    <div className="mt-auto grid grid-cols-[1.5fr_1fr] items-end gap-4 border-t border-border-strong pt-2.5">
      <div>
        <p className="text-[12.5px] leading-[1.55]">
          <strong>Amount still payable: {amountInWordsEnglishFormal(stillPayable)}</strong>
        </p>
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          {nextDue ? `Next due: ${nextDue}. ` : ""}
          {showLateFeePolicy ? (
            <>
              A flat late fee of {formatInr(lateFeeFlatAmount)} applies to each installment that
              passes its due date.{" "}
            </>
          ) : null}
          Payments are accepted only at the school fee counter, against a printed receipt.
          {closingNote ? ` ${closingNote}` : ""}
        </p>
      </div>

      <div className="text-right">
        <div className="h-[30px]" />
        <p className="border-t border-border-strong pt-1.5 text-[12px] font-semibold">
          Fee office · authorised signatory
        </p>
        <p className="mt-[3px] text-[11px] text-muted-foreground">
          Computer-generated statement · {identifier}
        </p>
      </div>
    </div>
  );
}
