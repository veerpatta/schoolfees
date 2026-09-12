/**
 * A write-off is not collection.
 *
 * `closeDueAsDiscountAction` clears an uncollectable balance by posting a
 * receipt with `payment_mode = 'discount'`. No cash moves: the receipt exists
 * so the write-off has an audit trail, and `v_workbook_installment_balances`
 * deliberately keeps it in `discount_closeout_amount` rather than
 * `applied_amount`. Every dashboard RPC has carried `payment_mode <> 'discount'`
 * since `20260526120000` for exactly this reason, and
 * `MONEY_GLOSSARY.todayCollection` states the rule in words.
 *
 * Five TypeScript reads queried `receipts` directly and forgot it, so a
 * write-off was counted rupee for rupee as money taken: the sidebar's "Day so
 * far", the Payment Desk's today card, Transactions' "Collection today" — which
 * additionally reported it as **Cash**, because 'discount' fell off the end of a
 * mode ternary — and Office Home. Same shape as the reversed-receipt bug that
 * `src/modules/receipts/data/reversals.ts` was written for, and pinned by the
 * same test, `tests/unit/reversals-excluded-from-totals.test.ts`.
 *
 * It lives in `platform/money` rather than beside `isReceiptReversed` because
 * this is a pure string comparison and one of its callers is
 * `src/modules/dashboard/domain/summary.ts` — a `domain/` file, which may not
 * import a `server-only` module. It is vocabulary, so it sits with the glossary.
 */

/** The payment mode a write-off is posted under. */
export const DISCOUNT_CLOSEOUT_MODE = "discount" as const;

/** True for a write-off receipt — a row that must never reach a collection total. */
export function isDiscountCloseout(paymentMode: string | null | undefined): boolean {
  return paymentMode === DISCOUNT_CLOSEOUT_MODE;
}
