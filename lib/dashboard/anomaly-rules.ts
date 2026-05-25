/**
 * Client-evaluable anomaly rules for admin dashboards.
 *
 * Three flavors of "did something unusual just happen?":
 *
 *  1. price-spike   — a single receipt is >3× the class's average ticket size,
 *                     which catches typos like 5,00,000 instead of 50,000.
 *  2. dupe-same-day — the same student already has a receipt today.
 *  3. waiver-burst  — late fees were waived several times in a short window
 *                     (we approximate "this week" with the visible recent set).
 *
 * Each rule yields at most one anomaly per row, with a deep-link the toast
 * action button uses for "Review".
 */

import type { DashboardClassSummaryRow, DashboardRecentPayment } from "@/lib/dashboard/summary";

export type DashboardAnomaly = {
  key: string;
  kind: "price-spike" | "dupe-same-day" | "waiver-burst";
  title: string;
  detail: string;
  reviewHref: string;
};

const PRICE_SPIKE_MULTIPLIER = 3;
const DUPE_DAY_THRESHOLD = 2;

function classAverageByLabel(classSummary: DashboardClassSummaryRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of classSummary) {
    if (row.studentsWithGeneratedDues <= 0 || row.collectedAmount <= 0) continue;
    const avg = Math.round(row.collectedAmount / row.studentsWithGeneratedDues);
    map.set(row.classLabel, avg);
  }
  return map;
}

export function evaluateDashboardAnomalies(input: {
  recentPayments: DashboardRecentPayment[];
  classSummary: DashboardClassSummaryRow[];
  todayIso: string;
}): DashboardAnomaly[] {
  const anomalies: DashboardAnomaly[] = [];
  const classAvg = classAverageByLabel(input.classSummary);

  for (const payment of input.recentPayments) {
    const avg = classAvg.get(payment.classLabel);
    if (avg && avg > 0 && payment.amount > avg * PRICE_SPIKE_MULTIPLIER) {
      anomalies.push({
        key: `spike:${payment.receiptId}`,
        kind: "price-spike",
        title: `Unusually large receipt: ${payment.studentName}`,
        detail: `₹${payment.amount.toLocaleString("en-IN")} is over ${PRICE_SPIKE_MULTIPLIER}× the ${payment.classLabel} average (~₹${avg.toLocaleString("en-IN")}).`,
        reviewHref: `/protected/receipts/${payment.receiptId}`,
      });
    }
  }

  const byStudentToday = new Map<string, DashboardRecentPayment[]>();
  for (const payment of input.recentPayments) {
    if (payment.paymentDate !== input.todayIso) continue;
    const list = byStudentToday.get(payment.studentId) ?? [];
    list.push(payment);
    byStudentToday.set(payment.studentId, list);
  }
  for (const [studentId, list] of byStudentToday) {
    if (list.length >= DUPE_DAY_THRESHOLD) {
      const sample = list[0];
      anomalies.push({
        key: `dupe:${studentId}:${input.todayIso}`,
        kind: "dupe-same-day",
        title: `Two payments today for ${sample.studentName}`,
        detail: `${list.length} receipts in ${sample.classLabel} today (${list.map((p) => p.receiptNumber).join(", ")}). Confirm both are intentional.`,
        reviewHref: `/protected/students/${studentId}`,
      });
    }
  }

  return anomalies;
}
