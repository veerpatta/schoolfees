/**
 * How a payment mode is spelled on screen.
 *
 * Its own module, and not part of `domain/summary`, for a bundle reason worth
 * stating: `fee-breakdown-panel.tsx` is a client component and this was the one
 * value it imported from `summary.ts`. That single import pulled the whole
 * dashboard summary module — and everything it imports — into the browser for a
 * five-case switch. Splitting it out takes `summary.ts` out of the client graph
 * entirely.
 */

/**
 * `discount` is a WRITE-OFF, not a payment mode a parent chose.
 *
 * It reached the default branch and rendered the raw column value, "discount",
 * which reads on screen as a concession the school granted. The same fall-through
 * in `buildCollectionRows` was worse still: there the chain ended in "Cash", so a
 * written-off balance was reported as cash in the drawer.
 */
export function formatPaymentModeLabel(value: string) {
  switch (value) {
    case "upi":
      return "UPI";
    case "bank_transfer":
      return "Bank transfer";
    case "cheque":
      return "Cheque";
    case "cash":
      return "Cash";
    case "discount":
      return "Written off";
    default:
      return value || "Unknown";
  }
}
