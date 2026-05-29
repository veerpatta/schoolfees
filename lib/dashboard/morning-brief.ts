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
    | "morningBriefAllClear"
    | "morningBriefFollowUpOverdue"
    | "morningBriefFollowUpDueToday"
    | "morningBriefFollowUpInstallment"
    | "morningBriefFollowUp",
  values?: Record<string, string | number>,
) => string;

export type MorningBriefInput = {
  kpis: DashboardKpis;
  currentInstallment?: DashboardCurrentInstallment | null;
  /** Students still carrying a balance — names the follow-up count. */
  followUpCount?: number;
  /** Translator scoped to the Dashboard namespace. */
  t: MorningBriefTranslator;
};

/**
 * Builds the one-line brief as a *next action*, not a recap. The Today and
 * Pending KPI cards already show the raw numbers right below this line, so the
 * brief earns its space by telling the office what to do next.
 */
export function composeMorningBrief({
  kpis,
  currentInstallment,
  followUpCount,
  t,
}: MorningBriefInput): string {
  // Nothing outstanding (or no students to chase) → positive confirmation.
  if (kpis.totalPending <= 0 || !followUpCount || followUpCount <= 0) {
    return t("morningBriefAllClear");
  }

  const amount = formatInr(kpis.totalPending);
  const count = followUpCount;

  if (currentInstallment) {
    if (currentInstallment.status === "overdue") {
      return t("morningBriefFollowUpOverdue", {
        label: currentInstallment.label,
        count,
        amount,
      });
    }
    if (currentInstallment.status === "due_today") {
      return t("morningBriefFollowUpDueToday", {
        label: currentInstallment.label,
        count,
        amount,
      });
    }
    return t("morningBriefFollowUpInstallment", {
      label: currentInstallment.label,
      dueDate: currentInstallment.dueDate,
      count,
      amount,
    });
  }

  return t("morningBriefFollowUp", { count, amount });
}
