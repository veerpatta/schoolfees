import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Money/history views must scope to the session frozen on the payment's
 * installment, NOT the student's current class. Installments are generated
 * per session and never re-pointed, so `payment → installments.class_id →
 * classes.session_label` is the promotion-proof anchor: after a year-end
 * promotion a student's current class belongs to the NEW session, but their
 * prior-year receipts/ledger rows stay attributed to the session their
 * installments were frozen in.
 *
 * `receipts` has no `session_label` column, so the receipt scope is derived
 * through `payments.installment_id`.
 *
 * Roster views (students, defaulters, Payment Desk, dashboard) intentionally
 * stay on current-class scoping — those answer "who is in this session now".
 */

// One school-year of payments/installments for VPPS sits in the low thousands
// (single tenant). A 20k ceiling is comfortably above any realistic
// single-session volume while still bounding the scan; raise it only if the
// tenant's per-session volume ever approaches it.
const SESSION_SCOPE_ROW_LIMIT = 20000;

/**
 * Receipt ids whose payments settled an installment frozen to `sessionLabel`.
 * A receipt belongs to a session if ANY of its payments hit a session-scoped
 * installment.
 */
export async function loadSessionScopedReceiptIds(sessionLabel: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("receipt_id, installment_ref:installments!inner(class_ref:classes!inner(session_label))")
    .eq("installment_ref.class_ref.session_label", sessionLabel)
    .limit(SESSION_SCOPE_ROW_LIMIT);

  if (error) {
    throw new Error(`Unable to scope receipts to session: ${error.message}`);
  }

  return [
    ...new Set(
      ((data ?? []) as Array<{ receipt_id: string | null }>)
        .map((row) => row.receipt_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

/**
 * Student ids that have at least one installment frozen to `sessionLabel`.
 * Used to scope money/history pickers (e.g. the ledger student selector) so a
 * promoted student still appears under the session they had activity in.
 */
export async function loadSessionScopedStudentIds(sessionLabel: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("installments")
    .select("student_id, class_ref:classes!inner(session_label)")
    .eq("class_ref.session_label", sessionLabel)
    .limit(SESSION_SCOPE_ROW_LIMIT);

  if (error) {
    throw new Error(`Unable to scope students to session: ${error.message}`);
  }

  return [
    ...new Set(
      ((data ?? []) as Array<{ student_id: string | null }>)
        .map((row) => row.student_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}
