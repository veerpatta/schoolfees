import { buildFeeBreakupDisplayRows, type FeeBreakupDisplayRow } from "@/lib/fees/display-breakdown";
import type { ResolvedFeeBreakdown } from "@/lib/fees/types";

/**
 * The canonical fee vocabulary used across the app. Every surface that shows
 * money for a student should read these fields so the numbers never drift:
 *
 *   Expected (gross)  fees before any discount
 *   − Discounts       conventional (RTE / Staff Child / 3rd Child) + manual
 *   = Expected (net)  what the family actually owes for the year
 *   − Paid            cash receipts only (never includes discounts)
 *   = Pending         outstanding balance
 *
 * Two write-offs are tracked SEPARATELY and never counted as cash "Paid":
 *   Late-fee waiver       a forgiven late fee (distinct from discounts)
 *   Closed as discount    a pending balance written off via a discount-mode
 *                         receipt (close-balance-as-discount)
 *
 * Discounts reduce Expected; they are not payments. Late-fee waivers are kept
 * apart from discounts so each can be reported on its own.
 */
export type FeeBreakdownSummary = {
  /** Charge rows (tuition shown before conventional discount) + discount rows. */
  rows: FeeBreakupDisplayRow[];
  expectedGross: number;
  conventionalDiscount: number;
  manualDiscount: number;
  /** conventional + manual — the total reduction to Expected. */
  totalDiscount: number;
  /** Expected after discounts (excludes late fees). */
  expectedNet: number;
  lateFeeCharged: number;
  lateFeeWaiver: number;
  /** Pending balance closed via a discount-mode receipt (a write-off, not cash). */
  discountCloseouts: number;
  /** Cash receipts only. */
  paid: number;
  pending: number;
};

type BreakdownInput = {
  resolvedBreakdown: Pick<
    ResolvedFeeBreakdown,
    | "coreHeads"
    | "customHeads"
    | "tuitionBeforeConventionalDiscount"
    | "conventionalDiscountApplied"
    | "conventionalDiscountLabels"
    | "discountApplied"
    | "annualTotal"
  >;
  installmentBalances: ReadonlyArray<{
    paidAmount: number;
    pendingAmount: number;
    waiverApplied: number;
    finalLateFee: number;
  }>;
  /** Sum of discount-mode (close-out) receipts for the session. */
  discountCloseouts?: number;
};

/**
 * Build the canonical breakdown from the same resolved-breakdown rows the Fee
 * plan tab uses (via {@link buildFeeBreakupDisplayRows}), so the on-screen
 * figures, the shared PDF, and any export all agree.
 */
export function buildFeeBreakdownSummary({
  resolvedBreakdown,
  installmentBalances,
  discountCloseouts = 0,
}: BreakdownInput): FeeBreakdownSummary {
  const rows = buildFeeBreakupDisplayRows(resolvedBreakdown);

  const conventionalDiscount = Math.max(0, resolvedBreakdown.conventionalDiscountApplied);
  const manualDiscount = Math.max(0, resolvedBreakdown.discountApplied);
  const totalDiscount = conventionalDiscount + manualDiscount;
  const expectedNet = Math.max(0, resolvedBreakdown.annualTotal);
  const expectedGross = expectedNet + totalDiscount;

  const paid = installmentBalances.reduce((sum, b) => sum + b.paidAmount, 0);
  const pending = installmentBalances.reduce((sum, b) => sum + b.pendingAmount, 0);
  const lateFeeWaiver = installmentBalances.reduce((sum, b) => sum + b.waiverApplied, 0);
  const lateFeeCharged = installmentBalances.reduce((sum, b) => sum + b.finalLateFee, 0);

  return {
    rows,
    expectedGross,
    conventionalDiscount,
    manualDiscount,
    totalDiscount,
    expectedNet,
    lateFeeCharged,
    lateFeeWaiver,
    discountCloseouts: Math.max(0, discountCloseouts),
    paid,
    pending,
  };
}
