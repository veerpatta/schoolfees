import type { StudentStatus } from "@/lib/db/types";

/**
 * Every student population this app queries, NAMED.
 *
 * Five different status predicates were in use inline, and nothing said which
 * were deliberate and which were drift:
 *
 *   active                          headcount, generators, quality reports
 *   active OR total_paid > 0        every money figure ("collectable")
 *   active OR exists(payment)       get_dashboard_fee_split's SQL variant
 *   ["active","left"]               the defaulter call list
 *   ["active","inactive"]           promotion, ledger picker
 *
 * Each one that survives here is deliberate and documented; a predicate that
 * is not worth documenting is not worth having. New code imports a name from
 * this module instead of re-spelling a status list — the source-assertion test
 * in tests/unit/student-populations.test.ts fails on a new inline spelling.
 *
 * The two canonical rules (docs: CLAUDE.md hard rule 8b, scope.mjs):
 *   headcount -> status = 'active'
 *   money     -> status = 'active' OR total_paid > 0
 * The money rule lives in SQL/PostgREST (lib/workbook/data.ts, the MCP's
 * scope.mjs, the dashboard RPCs) because `total_paid` is a view column, not a
 * `students` column — it cannot be expressed as a status list at all, which is
 * exactly why a status list must never be passed off as the money rule.
 */

/** The roll. What "how many students do we have" means. */
export const ON_ROLL_STATUSES = ["active"] as const satisfies readonly StudentStatus[];

/**
 * The defaulter call list: currently enrolled, plus leavers — a family that
 * paid part of the year and then left is still chased for the rest. Not the
 * money rule: `inactive` and `graduated` debtors are deliberately excluded
 * here because they belong to Recovery, not to the daily call list.
 */
export const DEFAULTER_CALL_LIST_STATUSES = [
  "active",
  "left",
] as const satisfies readonly StudentStatus[];

/**
 * Recovery: the non-active complement. Dues still owed by students who are no
 * longer enrolled. Mirrored by lib/recovery/types.ts, which narrows the same
 * three from StudentStatus.
 */
export const RECOVERY_STATUSES = [
  "left",
  "graduated",
  "inactive",
] as const satisfies readonly StudentStatus[];

/**
 * Promotion: who can be carried into the next session. `left` and `graduated`
 * are excluded by definition — a student who has left is NEVER rolled over
 * (school rule, 2026-08-18). `inactive` rides along so a temporarily lapsed
 * enrolment is not silently dropped at year end.
 */
export const PROMOTABLE_STATUSES = [
  "active",
  "inactive",
] as const satisfies readonly StudentStatus[];

/**
 * Students the office still administers fees for: enrolled now, or temporarily
 * lapsed (`inactive`) — but never `left` or `graduated`. This is the picker
 * population for the ledger, the fee-policy resolver's assignment list, and
 * the setup counts: surfaces where a between-states student must stay
 * reachable, while a leaver appears only through recovery.
 *
 * Same VALUES as PROMOTABLE_STATUSES, deliberately a separate name: the two
 * answer different questions and are allowed to diverge.
 */
export const FEE_ADMINISTERED_STATUSES = [
  "active",
  "inactive",
] as const satisfies readonly StudentStatus[];
