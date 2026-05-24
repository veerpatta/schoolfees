import { formatInr } from "@/lib/helpers/currency";

import type { DashboardKpis } from "@/lib/dashboard/summary";
import type { DashboardCurrentInstallment } from "@/lib/dashboard/data";

/**
 * Morning brief — deterministic one-line narrative composed from the
 * dashboard's existing KPI shape.
 *
 * Why deterministic: every number must be auditable. We never inject an
 * LLM here. The sentence is a pure function of the inputs.
 *
 * NOTE: no `server-only` guard. The function is a pure utility safe to
 * import from anywhere (including unit tests). Page-level fetching still
 * happens server-side via the dashboard route.
 */

export type MorningBriefInput = {
  kpis: DashboardKpis;
  currentInstallment?: DashboardCurrentInstallment | null;
  /** Optional pending Q1-style label; pages can pass a custom phrase. */
  pendingPhrase?: string;
};

export function composeMorningBrief({
  kpis,
  currentInstallment,
  pendingPhrase,
}: MorningBriefInput): string {
  const parts: string[] = [];

  // Today's collection — keep grammatical for 0 and 1.
  if (kpis.todaysCollection > 0 || kpis.receiptsToday > 0) {
    const receiptWord = kpis.receiptsToday === 1 ? "receipt" : "receipts";
    parts.push(
      `Today: ${formatInr(kpis.todaysCollection)} collected across ${kpis.receiptsToday} ${receiptWord}.`,
    );
  } else {
    parts.push("Today: no collections yet.");
  }

  // Pending mention — fall back to total pending when caller didn't pass
  // a curated phrase (e.g. "47 students still owe Q1").
  if (pendingPhrase) {
    parts.push(pendingPhrase);
  } else if (kpis.totalPending > 0) {
    parts.push(`${formatInr(kpis.totalPending)} still pending across the school.`);
  }

  // Installment context — only when one is currently due/overdue.
  if (currentInstallment) {
    if (currentInstallment.status === "overdue") {
      parts.push(`${currentInstallment.label} is overdue (due ${currentInstallment.dueDate}).`);
    } else if (currentInstallment.status === "due_today") {
      parts.push(`${currentInstallment.label} is due today.`);
    }
  }

  return parts.join(" ");
}
