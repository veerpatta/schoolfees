// Legacy constants for the first previous-year (2025-26) dues carry-forward.
// New code should prefer carry-forward metadata (`is_carry_forward`,
// `student_carry_forward_balances`, source/target sessions, and fee bucket).

/**
 * Legacy installment_label used by the first 2025-26 import. Kept only for
 * backwards-compatible display and migration fallback; it is not the future
 * identity key for carry-forward dues.
 */
export const CARRY_FORWARD_LABEL = "Previous year tuition balance (2025-26)";

/**
 * Sentinel installment number. Real installments are 1–4; carry-forward lines
 * use >= 90 so they never collide and always sort after real dues *by number*
 * (allocation/next-due sort by due_date first, so the early due_date below
 * still surfaces them first).
 */
export const CARRY_FORWARD_INSTALLMENT_NO_BASE = 99;
export const CARRY_FORWARD_INSTALLMENT_NO_MIN = 90;

/**
 * Due date earlier than the current-year first installment (20-04-2026) so
 * Payment Desk allocation (sorted by due_date) consumes the old balance first.
 */
export const CARRY_FORWARD_DUE_DATE = "2026-04-01";

/** Hard rule: prior-year dues never carry a late fee. */
export const CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT = 0;

/** Legacy rollback hint. Prefer `student_carry_forward_balances` batch links. */
export const CARRY_FORWARD_ROLLBACK_HINT =
  `delete from public.installments where is_carry_forward = true and installment_label = '${CARRY_FORWARD_LABEL}'`;
