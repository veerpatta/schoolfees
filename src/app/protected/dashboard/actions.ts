"use server";

import { redirect } from "next/navigation";

import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import { alignWorkingSessionWithFeeSetup, revalidateFinanceSurfaces } from "@/modules/system-sync/domain/finance-sync";
import { requireStaffPermission } from "@/platform/supabase/session";

function parseSessionLabel(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error("Academic session is required.");
  }

  return parseAcademicSessionLabel(normalized).normalizedLabel;
}

function dashboardUrl(notice: string, sessionLabel?: string) {
  const params = new URLSearchParams({ notice });
  if (sessionLabel) {
    params.set("session", sessionLabel);
  }
  return `/protected/dashboard?${params.toString()}`;
}

export async function syncDashboardNowAction(formData: FormData) {
  await requireStaffPermission("fees:write");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  // With the session label, so the dashboard's own cached rollups are actually
  // evicted. Without it this action refreshed everything except the numbers it
  // is named after.
  revalidateFinanceSurfaces({ sessionLabel });
  redirect(dashboardUrl("Dashboard, Payment Desk, Transactions, and reports were refreshed.", sessionLabel));
}

export async function alignWorkingSessionWithFeeSetupAction() {
  await requireStaffPermission("fees:write");
  const health = await alignWorkingSessionWithFeeSetup();
  const warningCount =
    health.classSessionMismatchStudents.length + health.studentsMissingInstallments.length;

  redirect(
    dashboardUrl(
      `Academic current session now matches Fee Setup session ${health.activeSession}. Student records were not moved; ${warningCount} warning item${warningCount === 1 ? "" : "s"} remain for review.`,
    ),
  );
}
