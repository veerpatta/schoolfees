import "server-only";

import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";

/**
 * Lightweight numbers for the workspace shell chrome ("Ledger Calm 2.0"):
 * the sidebar "Day so far" card and the nav count pills. Deliberately much
 * cheaper than the dashboard summary RPC — two narrow queries, cached per
 * (session, day) and revalidated by the same `session:{label}` tag the
 * finance sync already busts after every posting.
 */
export type ShellPulse = {
  todayTotalAmount: number;
  todayReceiptCount: number;
  overdueStudentCount: number;
};

const EMPTY_PULSE: ShellPulse = {
  todayTotalAmount: 0,
  todayReceiptCount: 0,
  overdueStudentCount: 0,
};

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

/**
 * Columns this module reads. `v_workbook_student_financials` is the
 * STUDENT-level view: it has `outstanding_amount` / `record_status` but NOT
 * `balance_status` (that one lives on the installment-level
 * `v_workbook_installment_balances`). Naming the columns here lets a unit test
 * assert them against the generated DB types — a wrong name used to fail
 * silently at runtime and render the whole card as zero.
 */
export const SHELL_PULSE_FINANCIALS_COLUMNS = [
  "session_label",
  "record_status",
  "outstanding_amount",
] as const;

async function getShellPulseUncached(sessionLabel: string): Promise<ShellPulse> {
  const supabase = await getCacheSafeClient();
  const today = getSchoolDateStamp();

  const [todayReceipts, defaulterCount] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, total_amount, student_ref:students!inner(class_ref:classes!inner(session_label))")
      .eq("student_ref.class_ref.session_label", sessionLabel)
      .eq("payment_date", today),
    // Matches what the Defaulters page lists (active students still owing
    // anything) so the nav pill agrees with its click-through destination.
    supabase
      .from("v_workbook_student_financials")
      .select("student_id", { count: "exact", head: true })
      .eq("session_label", sessionLabel)
      .eq("record_status", "active")
      .gt("outstanding_amount", 0),
  ]);

  // Degrade per query: a failure on one side must never blank the other.
  const receiptRows = todayReceipts.error
    ? []
    : ((todayReceipts.data ?? []) as Array<{ id: string; total_amount: number | null }>);

  return {
    todayTotalAmount: receiptRows.reduce((sum, row) => sum + (row.total_amount ?? 0), 0),
    todayReceiptCount: receiptRows.length,
    overdueStudentCount: defaulterCount.error ? 0 : defaulterCount.count ?? 0,
  };
}

export async function getShellPulse(sessionLabel: string): Promise<ShellPulse> {
  try {
    return await cacheSafeUnstableCache(
      async () => getShellPulseUncached(sessionLabel),
      ["shell-pulse", sessionLabel, getSchoolDateStamp()],
      { tags: [`session:${sessionLabel}`] },
    )();
  } catch {
    return EMPTY_PULSE;
  }
}
