import { formatInr, formatRupeesPlain } from "@/platform/helpers/currency";

/**
 * The late-fee phrase that fills slot {{7}} of every v2 notice.
 *
 * Slot 7 is one free-text phrase rather than an amount and a unit, which is what
 * lets a single approved template express every charging model the office might
 * want without going back to Meta. The app composes it from **an amount plus a
 * basis** — never a free-text box, because a typo here is a number a parent will
 * hold the school to.
 *
 * Deliberately free of `server-only`: the screen renders the phrase into a live
 * preview as staff change the amount.
 *
 * **This is not the ledger's late fee.** It is a lever for getting fees paid on
 * time, set per run, and the app does not charge what it says here. That is why
 * `describeLateFeeDrift` exists: the office may deliberately quote something the
 * ledger will not charge, and the screen says so plainly rather than refusing.
 */

export type LateFeeBasis = "per_installment" | "per_day" | "flat" | "none";

export const LATE_FEE_BASES = [
  { value: "per_installment", label: "per installment" },
  { value: "per_day", label: "per day" },
  { value: "flat", label: "one flat charge" },
  { value: "none", label: "not charged" },
] as const satisfies ReadonlyArray<{ value: LateFeeBasis; label: string }>;

const BASIS_VALUES: readonly string[] = LATE_FEE_BASES.map((entry) => entry.value);

export function isLateFeeBasis(value: unknown): value is LateFeeBasis {
  return typeof value === "string" && BASIS_VALUES.includes(value);
}

export const DEFAULT_LATE_FEE_BASIS: LateFeeBasis = "per_installment";

/**
 * Compose slot {{7}}.
 *
 * The wording is fixed by the registry document, not invented here — the
 * approved bodies were reviewed against these exact four forms.
 *
 * The amount goes through `formatRupeesPlain`, so it arrives as grouped digits
 * with no symbol: the phrase supplies `रु.` / `Rs.` itself and a glyph in the
 * value would arrive doubled.
 *
 * **Never returns an empty string.** WhatsApp rejects an empty parameter, which
 * is why "not charged" has wording rather than a blank — and why a zero or
 * missing amount falls back to the same wording instead of producing `Rs. 0`.
 */
export function lateFeePhrase(
  amount: number,
  basis: LateFeeBasis,
  language: "hi" | "en",
): string {
  const hindi = language === "hi";
  const rupees = Math.max(0, Math.round(Number(amount) || 0));

  if (basis === "none" || rupees <= 0) {
    return hindi ? "इस राशि पर लागू नहीं" : "Not applicable on this amount";
  }

  const money = `${hindi ? "रु." : "Rs."} ${formatRupeesPlain(rupees)}`;
  switch (basis) {
    case "per_installment":
      return hindi ? `${money} प्रति किश्त` : `${money} per installment`;
    case "per_day":
      return hindi ? `${money} प्रति दिन` : `${money} per day`;
    case "flat":
      return money;
  }
}

/**
 * Does the phrase disagree with what the ledger will actually charge?
 *
 * Returns a sentence to show the office, or null when the two agree.
 *
 * The ledger charges a flat amount per installment from the day one passes its
 * due date, and **zero** on carry-forward rows — those are created with a
 * `late_fee_flat_amount` of 0 deliberately, and the shared late-fee rule
 * short-circuits on it.
 *
 * This never blocks a send. A message promising ₹50 a day against a receipt
 * showing ₹1,000 is an argument at the fee counter the office loses, but whether
 * to run it is the owner's call, not this function's.
 */
export function describeLateFeeDrift(args: {
  amount: number;
  basis: LateFeeBasis;
  /** What the live fee policy charges per installment. */
  ledgerAmount: number;
  /** Carry-forward never accrues a late fee, whatever the notice says. */
  isCarryForward: boolean;
  /**
   * `late_fee_applied` quotes the fee the ledger HAS charged, per family, read
   * from `v_workbook_installment_balances.late_fee_pending`.
   *
   * On every other notice the late fee is a lever the office sets and drift is
   * possible by design. Here it is a statement of account, so drift is not
   * merely discouraged — it is impossible, because the amount never comes from
   * the control. The screen disables the control and this returns the reason,
   * rather than the two silently disagreeing about which figure is live.
   */
  isLedgerQuoted?: boolean;
}): string | null {
  const { amount, basis, ledgerAmount, isCarryForward, isLedgerQuoted } = args;
  const quoted = Math.max(0, Math.round(Number(amount) || 0));

  if (isLedgerQuoted) return null;

  if (isCarryForward) {
    return basis === "none" || quoted <= 0
      ? null
      : "This notice quotes a late fee, but a carry-forward balance never accrues one in the ledger. A parent who pays late will not be charged it.";
  }

  if (basis === "none" || quoted <= 0) {
    return ledgerAmount > 0
      ? `This notice says no late fee applies, but the ledger charges ${formatInr(ledgerAmount)} per installment once a due date passes.`
      : null;
  }

  if (basis !== "per_installment") {
    return `This notice quotes a ${basis === "per_day" ? "per-day" : "one-off"} late fee, but the ledger charges ${formatInr(ledgerAmount)} per installment. The receipt will not match the message.`;
  }

  if (quoted !== ledgerAmount) {
    return `This notice quotes ${formatInr(quoted)} per installment and the ledger charges ${formatInr(ledgerAmount)}. The receipt will not match the message.`;
  }

  return null;
}
