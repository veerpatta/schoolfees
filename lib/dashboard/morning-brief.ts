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

export type MorningBriefTranslator = (
  key:
    | "morningBriefTodayNone"
    | "morningBriefTodayCount"
    | "morningBriefPendingTotal"
    | "morningBriefInstallmentOverdue"
    | "morningBriefInstallmentDueToday",
  values?: Record<string, string | number>,
) => string;

export type MorningBriefInput = {
  kpis: DashboardKpis;
  currentInstallment?: DashboardCurrentInstallment | null;
  /** Optional pending Q1-style label; pages can pass a custom phrase. */
  pendingPhrase?: string;
  /** Translator scoped to the Dashboard namespace. */
  t: MorningBriefTranslator;
};

export function composeMorningBrief({
  kpis,
  currentInstallment,
  pendingPhrase,
  t,
}: MorningBriefInput): string {
  const parts: string[] = [];

  if (kpis.todaysCollection > 0 || kpis.receiptsToday > 0) {
    parts.push(
      t("morningBriefTodayCount", {
        amount: formatInr(kpis.todaysCollection),
        count: kpis.receiptsToday,
      }),
    );
  } else {
    parts.push(t("morningBriefTodayNone"));
  }

  if (pendingPhrase) {
    parts.push(pendingPhrase);
  } else if (kpis.totalPending > 0) {
    parts.push(
      t("morningBriefPendingTotal", { amount: formatInr(kpis.totalPending) }),
    );
  }

  if (currentInstallment) {
    if (currentInstallment.status === "overdue") {
      parts.push(
        t("morningBriefInstallmentOverdue", {
          label: currentInstallment.label,
          dueDate: currentInstallment.dueDate,
        }),
      );
    } else if (currentInstallment.status === "due_today") {
      parts.push(
        t("morningBriefInstallmentDueToday", { label: currentInstallment.label }),
      );
    }
  }

  return parts.join(" ");
}
