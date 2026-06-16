// Canonical constants for the previous-year (2025-26) dues carry-forward.
// Kept in one place so the parser, matcher, dry-run script, apply path, and
// tests all agree on the exact label / sentinel / dates.

/**
 * The installment_label that uniquely identifies a carry-forward line. This is
 * the human-readable key; `installments.is_carry_forward = true` is the machine
 * key the Fee Setup regeneration sweep tests against. Idempotency is detected
 * by `(student_id, CARRY_FORWARD_LABEL)`.
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

/** Rollback predicate (scoped to a batch via prev_year_import_rows). */
export const CARRY_FORWARD_ROLLBACK_HINT =
  `delete from public.installments where is_carry_forward = true and installment_label = '${CARRY_FORWARD_LABEL}'`;
