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

async function getShellPulseUncached(sessionLabel: string): Promise<ShellPulse> {
  const supabase = await getCacheSafeClient();
  const today = getSchoolDateStamp();

  const [todayReceipts, overdueCount] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, total_amount, student_ref:students!inner(class_ref:classes!inner(session_label))")
      .eq("student_ref.class_ref.session_label", sessionLabel)
      .eq("payment_date", today),
    supabase
      .from("v_workbook_student_financials")
      .select("student_id", { count: "exact", head: true })
      .eq("session_label", sessionLabel)
      .eq("record_status", "active")
      .eq("balance_status", "overdue"),
  ]);

  if (todayReceipts.error || overdueCount.error) {
    // Shell chrome must never take a page down over a metrics hiccup.
    return EMPTY_PULSE;
  }

  const rows = (todayReceipts.data ?? []) as Array<{ id: string; total_amount: number | null }>;

  return {
    todayTotalAmount: rows.reduce((sum, row) => sum + (row.total_amount ?? 0), 0),
    todayReceiptCount: rows.length,
    overdueStudentCount: overdueCount.count ?? 0,
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
