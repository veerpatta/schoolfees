import { registerDimension } from "../lib/coverage";

import { SCENARIO_STUDENTS, type ScenarioKey } from "../lib/discovery";

/**
 * The Payment Desk, by equivalence class rather than by cartesian product.
 *
 * date x amount x mode x discount x waiver x duplicate is about 2,600
 * combinations and almost all of them are the same code path with a different
 * number in it. These 18 are the ones where the path itself differs, chosen
 * from what the desk actually branches on and from what has broken before:
 *
 *  - **Late fee is date-aware**, so the payment date changes the price. Three
 *    dates, not one.
 *  - **Posting allocates against `total_pending`**, fees + late fee. The
 *    late-fee-only student is the case that proves it: fees are ₹0, so an
 *    allocation that used `pending_amount` would refuse a payment the ledger is
 *    still asking for.
 *  - **The waiver is applied BEFORE the post**, by a separate RPC, so the
 *    posting RPC's own guards never see it. `docs/maps/danger-zones.md` records
 *    that as a real bypass for EMI students once, which is why the EMI student
 *    gets a case of their own and why `verify-late-fee-health.mjs` runs after
 *    the suite.
 *  - **Idempotency is a `clientRequestId`**, and a near-duplicate is a hard
 *    10-minute block that only `payments:adjust` may override.
 *
 * `posts: false` cases are the more valuable half: they assert a refusal, and a
 * refusal that stops working is silent.
 */

export type PaymentCase = {
  id: string;
  /** Which documented student this case needs. */
  subject: ScenarioKey;
  amount: string;
  mode: "cash" | "upi" | "bank_transfer" | "cheque";
  /** relative days from today; late fee is priced at the payment date. */
  dateOffsetDays: number;
  /** Whether a receipt should exist afterwards. */
  posts: boolean;
  requiresPermission?: string;
  note: string;
};

export const PAYMENT_CASES: readonly PaymentCase[] = [
  // ── amount validation: no row is created, so these are free to run ───────
  {
    id: "amount-zero",
    subject: "neverPaidFullInfo",
    amount: "0",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "parsePaymentAmount demands a whole number greater than zero.",
  },
  {
    id: "amount-negative",
    subject: "neverPaidFullInfo",
    amount: "-100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "A negative collection is a refund, and refunds do not happen here.",
  },
  {
    id: "amount-decimal",
    subject: "neverPaidFullInfo",
    amount: "100.50",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "Paise are not collected at this counter; the field takes rupees.",
  },
  {
    id: "amount-non-numeric",
    subject: "neverPaidFullInfo",
    amount: "abc",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "Text in the amount field.",
  },
  {
    id: "amount-absurd",
    subject: "neverPaidFullInfo",
    amount: "999999999",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note:
      "Far above anything owed. Whether this is refused or lands as credit is " +
      "a decision the desk must make visibly, not silently.",
  },

  // ── preview only: the allocation is read, nothing is written ─────────────
  {
    id: "preview-back-dated",
    subject: "twoLateFees",
    amount: "1000",
    mode: "cash",
    dateOffsetDays: -30,
    posts: false,
    note: "A back-dated payment must re-price the late fee downward.",
  },
  {
    id: "preview-today",
    subject: "twoLateFees",
    amount: "1000",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "The baseline the other two dates are compared against.",
  },
  {
    id: "preview-future-dated",
    subject: "twoLateFees",
    amount: "1000",
    mode: "cash",
    dateOffsetDays: 30,
    posts: false,
    note: "A future date must not invent a late fee that has not accrued.",
  },
  {
    id: "preview-late-fee-only",
    subject: "lateFeeOnly",
    amount: "1000",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note:
      "₹0 fees, ₹1,000 late fee. The preview must offer the ₹1,000 — allocating " +
      "against pending_amount instead of total_pending refuses it.",
  },
  {
    id: "preview-emi-student",
    subject: "partialWaiverOnEmi",
    amount: "500",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "An on-track EMI family is not asked for the full balance.",
  },
  {
    id: "preview-in-credit",
    subject: "inCredit",
    amount: "100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "Already paid more than due; the preview shows credit, not dues.",
  },
  {
    id: "preview-graduated-clear",
    subject: "graduatedClear",
    amount: "100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: false,
    note: "Nothing owed and no longer on the roll.",
  },

  // ── real posts: six receipts, and every one of them is idempotent ────────
  {
    id: "post-cash-partial",
    subject: "neverPaidFullInfo",
    amount: "100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note: "The plain case: ₹100 cash against a student with real dues.",
  },
  {
    id: "post-upi",
    subject: "neverPaidFullInfo",
    amount: "100",
    mode: "upi",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note: "UPI takes no reference number since 20260602042112.",
  },
  {
    id: "post-bank-transfer",
    subject: "partlyPaid",
    amount: "100",
    mode: "bank_transfer",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note: "Bank transfer, also reference-optional.",
  },
  {
    id: "post-cheque",
    subject: "partlyPaid",
    amount: "100",
    mode: "cheque",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note: "The fourth accepted mode; modes come from the active fee policy.",
  },
  {
    id: "post-idempotent-retry",
    subject: "neverPaidFullInfo",
    amount: "100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note:
      "Same clientRequestId as post-cash-partial. Must resolve to the EXISTING " +
      "receipt and create no second row — the property the footprint check proves.",
  },
  {
    id: "post-late-fee-only-student",
    subject: "lateFeeOnly",
    amount: "100",
    mode: "cash",
    dateOffsetDays: 0,
    posts: true,
    requiresPermission: "payments:write",
    note:
      "Collecting against a student whose only debt is a late fee. Afterwards " +
      "they must still not be a defaulter.",
  },
];

export const POSTING_CASES = PAYMENT_CASES.filter((entry) => entry.posts);
export const PREVIEW_ONLY_CASES = PAYMENT_CASES.filter((entry) => !entry.posts);

/** Sanity: every case names a student the discovery catalogue knows about. */
for (const entry of PAYMENT_CASES) {
  if (!(entry.subject in SCENARIO_STUDENTS)) {
    throw new Error(`Payment case "${entry.id}" names unknown scenario "${entry.subject}".`);
  }
}

export const PAYMENT_CASE_DIMENSION = registerDimension({
  id: "write.payment-case",
  label: "Payment Desk scenarios",
  domain: PAYMENT_CASES.map((entry) => entry.id),
  strategy: "targeted-scenarios",
  note:
    "Chosen by equivalence class from date x amount x mode x discount x waiver x " +
    "duplicate (~2,600 combinations); the full product is not covered.",
});
