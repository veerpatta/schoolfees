/**
 * Payment-behavior classification — pure, no IO, unit-testable.
 *
 * Sorts each defaulter parent into a temperament bucket so the worklist can be
 * filtered by *how* a parent pays, not just how much they owe:
 *
 *   - reliable        → pays, mostly on time. Currently owes only because an
 *                       installment just came due.
 *   - delays_but_pays → does pay, but typically after the due date.
 *   - chronic         → repeatedly / deeply overdue; needs the most attention.
 *   - non_responsive  → not answering calls (the user's explicit "move them to
 *                       a separate bucket — they take time" case).
 *   - new             → no payment history yet this session; can't judge timing.
 *
 * Basis (per the product decision): within-session installment timing +
 * call responsiveness. There is only one live academic session so far, so this
 * is a single-cycle judgment that will sharpen automatically across future
 * terms as more history accrues. Constants below are intentionally tunable.
 */

export type PaymentBehavior =
  | "reliable"
  | "delays_but_pays"
  | "chronic"
  | "non_responsive"
  | "new";

export type BehaviorInput = {
  /** Installments fully paid on or before their due date, this session. */
  installmentsPaidOnTime: number;
  /** Installments fully paid, but after their due date, this session. */
  installmentsPaidLate: number;
  /** Installments currently overdue and still unpaid/partial. */
  overdueInstallmentCount: number;
  /** Days past the oldest unpaid due date (>= 0). */
  daysOverdue: number;
  /** Trailing run of no-answer call outcomes (from the contact log). */
  noAnswerStreak: number;
  /** True when the parent's last payment promise lapsed unpaid. */
  brokenPromise?: boolean;
};

/** Tunable thresholds. */
export const NON_RESPONSIVE_STREAK = 3;
export const CHRONIC_DAYS = 90;
export const CHRONIC_DAYS_NO_HISTORY = 60;
export const LATE_SHARE_THRESHOLD = 0.5;

export function classifyPaymentBehavior(input: BehaviorInput): PaymentBehavior {
  const paidTotal = input.installmentsPaidOnTime + input.installmentsPaidLate;
  const noAnswerStreak = input.noAnswerStreak ?? 0;

  // Calls dominate: a parent who won't pick up goes to their own bucket
  // regardless of payment record — they take time and need a different play.
  if (noAnswerStreak >= NON_RESPONSIVE_STREAK) return "non_responsive";

  // No payment history yet → timing is unknowable. Brand chronic only when
  // they're already deep in arrears with nothing paid; otherwise "new".
  if (paidTotal === 0) {
    return input.overdueInstallmentCount >= 2 || input.daysOverdue >= CHRONIC_DAYS_NO_HISTORY
      ? "chronic"
      : "new";
  }

  // Repeatedly or deeply overdue despite having some history.
  if (input.overdueInstallmentCount >= 2 || input.daysOverdue >= CHRONIC_DAYS) {
    return "chronic";
  }

  // Pays, but the majority of paid installments landed late.
  if (input.installmentsPaidLate / paidTotal > LATE_SHARE_THRESHOLD) {
    return "delays_but_pays";
  }

  // A broken promise stops us calling an otherwise-clean payer "reliable" —
  // they've shown they don't always honour a committed date.
  if (input.brokenPromise) {
    return "delays_but_pays";
  }

  return "reliable";
}

export const PAYMENT_BEHAVIORS: readonly PaymentBehavior[] = [
  "reliable",
  "delays_but_pays",
  "chronic",
  "non_responsive",
  "new",
];
