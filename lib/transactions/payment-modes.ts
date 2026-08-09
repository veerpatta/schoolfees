import type { PaymentMode } from "@/lib/db/types";

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
export function normalizePaymentModeFilter(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return ALLOWED.has(normalized) ? normalized : "";
}
