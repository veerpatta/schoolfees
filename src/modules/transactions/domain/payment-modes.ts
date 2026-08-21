import type { PaymentMode } from "@/platform/db/types";

/**
 * The one allowlist for the Transactions payment-mode filter.
 *
 * There were three, hand-written, and all three read
 * `["cash", "upi", "bank_transfer", "cheque"]` — every mode except
 * `discount`. The Transactions UI styles a discount row and the ledger posts
 * them, so selecting "Discount" in the filter silently fell through to "" and
 * returned every payment of every mode. Deriving the list from `PaymentMode`
 * means a new mode cannot be added to the type without appearing here.
 */
export const PAYMENT_MODE_FILTER_VALUES: readonly PaymentMode[] = [
  "cash",
  "upi",
  "bank_transfer",
  "cheque",
  "discount",
];

const ALLOWED = new Set<string>(PAYMENT_MODE_FILTER_VALUES);

/** Returns the mode, or "" for "no payment-mode filter". */
export function normalizePaymentModeFilter(
  // `string[]` because a repeated `?paymentMode=` arrives as an array, and
  // `(value ?? "").trim()` threw out of a Server Component. First value wins,
  // matching every other switcher in the app.
  value: string | string[] | null | undefined,
): string {
  const first = Array.isArray(value) ? value[0] : value;
  const normalized = (first ?? "").trim();
  return ALLOWED.has(normalized) ? normalized : "";
}
