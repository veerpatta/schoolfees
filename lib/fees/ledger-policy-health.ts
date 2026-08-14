import "server-only";

import { getCacheSafeClient } from "@/lib/supabase/cache-safe";

/**
 * "Does every student's ledger charge what the fee policy says?"
 *
 * The identity `gross_base_before_discount - discount_amount = base_charge_total`
 * is documented on `v_workbook_student_financials` and was never enforced. It
 * broke in the direction nobody notices: a bus route added mid-year to a student
 * who had already paid could not be written to any installment, so the rise was
 * dropped and the ledger asked for less than the policy. Eight students carried
 * Rs 54,225 of unbilled transport for three months before a hand audit found it.
 *
 * The definition lives in `public.v_ledger_policy_drift` rather than here, so
 * the Settings panel, `scripts/verify-ledger-policy-health.mjs` and the repair
 * route cannot drift apart in what they mean by "drifted" — which is exactly
 * what happened the last time this was written twice, producing 104 false
 * positives against 31 real ones over carry-forward rows.
 */
export type LedgerPolicyHealth = {
  sessionLabel: string;
  activeStudents: number;
  /** Ledger charges LESS than policy. The school is under-billing. */
  underBilledStudents: number;
  underBilledAmount: number;
  /** Ledger charges MORE than policy — a discount that was decided but never landed. */
  overBilledStudents: number;
  overBilledAmount: number;
  /** Active students in this session with no installments at all. */
  studentsWithoutLedger: number;
  /** Installments filed under a class the student has left. Regeneration fixes these. */
  studentsWithStaleLedgerClass: number;
  /** Same, on carry-forward / EMI rows — which every regeneration sweep skips. */
  studentsWithStaleLockedClass: number;
  healthy: boolean;
  /** Set when the check itself could not run, so the UI can say so honestly. */
  unavailableReason: string | null;
};

type DriftRow = {
  drift: number | string | null;
  has_ledger: boolean | null;
  stale_class_rows: number | null;
  stale_class_locked_rows: number | null;
};

function emptyHealth(sessionLabel: string, unavailableReason: string | null): LedgerPolicyHealth {
  return {
    sessionLabel,
    activeStudents: 0,
    underBilledStudents: 0,
    underBilledAmount: 0,
    overBilledStudents: 0,
    overBilledAmount: 0,
    studentsWithoutLedger: 0,
    studentsWithStaleLedgerClass: 0,
    studentsWithStaleLockedClass: 0,
    healthy: unavailableReason === null,
    unavailableReason,
  };
}

export async function getLedgerPolicyHealth(sessionLabel: string): Promise<LedgerPolicyHealth> {
  const trimmed = sessionLabel.trim();

  if (!trimmed) {
    return emptyHealth(sessionLabel, "No academic session selected.");
  }

  try {
    const supabase = await getCacheSafeClient();
    const { data, error } = await supabase
      .from("v_ledger_policy_drift")
      .select("drift, has_ledger, stale_class_rows, stale_class_locked_rows")
      .eq("session_label", trimmed);

    if (error) {
      // A missing view (a database behind the code) must not take the whole
      // Settings page down — it is the page people open when something is
      // already wrong.
      return emptyHealth(trimmed, error.message);
    }

    const rows = (data ?? []) as DriftRow[];
    const health = emptyHealth(trimmed, null);
    health.activeStudents = rows.length;

    for (const row of rows) {
      const drift = Number(row.drift ?? 0);

      if (row.has_ledger === false) {
        health.studentsWithoutLedger += 1;
      } else if (drift > 0) {
        health.underBilledStudents += 1;
        health.underBilledAmount += drift;
      } else if (drift < 0) {
        health.overBilledStudents += 1;
        health.overBilledAmount += -drift;
      }

      if (Number(row.stale_class_rows ?? 0) > 0) {
        health.studentsWithStaleLedgerClass += 1;
      }

      if (Number(row.stale_class_locked_rows ?? 0) > 0) {
        health.studentsWithStaleLockedClass += 1;
      }
    }

    health.healthy =
      health.underBilledStudents === 0 &&
      health.overBilledStudents === 0 &&
      health.studentsWithoutLedger === 0 &&
      health.studentsWithStaleLedgerClass === 0 &&
      health.studentsWithStaleLockedClass === 0;

    return health;
  } catch (error) {
    return emptyHealth(trimmed, error instanceof Error ? error.message : "Check failed.");
  }
}
