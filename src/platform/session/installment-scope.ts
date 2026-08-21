import "server-only";

import { createClient } from "@/platform/supabase/server";

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

/*
 * There is deliberately no `loadSessionScopedStudentIds` here any more.
 *
 * It returned every student id in a session and callers fed that to
 * PostgREST's `.in("id", …)`, which serialises into the request URL. On the
 * live session that is 481 uuids — a ~17,800-character URL — and the fetch was
 * rejected before it left Node, which is what broke the Ledger page in
 * production ("Unable to load students for ledger: TypeError: fetch failed").
 * TEST-2026-27 has 79 students, so it worked everywhere it was tested.
 *
 * Scope students by JOINING through the installment instead, as
 * `getLedgerPageData` now does:
 *
 *     .select("…, installments!inner(id, class_ref:classes!inner(session_label))")
 *     .eq("installments.class_ref.session_label", sessionLabel)
 *
 * Same promotion-proof anchor, no id list, and the URL stays constant however
 * large the roster grows.
 */
