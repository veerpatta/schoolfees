"use server";

import { redirect } from "next/navigation";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  alignWorkingSessionWithFeeSetup,
  getSystemSyncHealth,
  repairMissingDues,
  revalidateFinanceSurfaces,
  syncSessionDues,
} from "@/lib/system-sync/finance-sync";
import { requireStaffPermission } from "@/lib/supabase/session";

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

export async function repairCurrentSessionDuesAction(formData: FormData) {
  await requireStaffPermission("fees:write");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  const result = await repairMissingDues(sessionLabel);

  redirect(
    dashboardUrl(
      `Missing dues prepared: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
      sessionLabel,
    ),
  );
}

export async function syncDashboardNowAction(formData: FormData) {
  await requireStaffPermission("fees:write");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  revalidateFinanceSurfaces();
  redirect(dashboardUrl("Dashboard, Payment Desk, Transactions, and reports were refreshed.", sessionLabel));
}

export async function syncCurrentSessionAction(formData: FormData) {
  await requireStaffPermission("fees:write");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  const result = await syncSessionDues(sessionLabel);

  redirect(
    dashboardUrl(
      `Fee records updated for ${sessionLabel}: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
      sessionLabel,
    ),
  );
}

export async function repairPaymentDeskDataAction(formData: FormData) {
  await requireStaffPermission("fees:write");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  const health = await getSystemSyncHealth(sessionLabel);

  if (!health.requiredDatabaseObjectsStatus.previewWorkbookPaymentAllocation.usable) {
    redirect(
      dashboardUrl(
        "Payment Desk dues cannot be fixed yet: a database update is pending.",
        sessionLabel,
      ),
    );
  }

  if (!health.requiredDatabaseObjectsStatus.postStudentPayment.usable) {
    redirect(
      dashboardUrl(
        "Payment Desk dues cannot be fixed yet: a database update is pending.",
        sessionLabel,
      ),
    );
  }

  if (health.studentsMissingInstallments.length === 0 && health.studentsWithNoFeeSetting === 0) {
    revalidateFinanceSurfaces();
    redirect(
      dashboardUrl(
        `Payment Desk dues checked for ${sessionLabel}: no students with unprepared dues were found.`,
        sessionLabel,
      ),
    );
  }

  if (health.studentsMissingInstallments.length === 0 && health.studentsWithNoFeeSetting > 0) {
    redirect(
      dashboardUrl(
        `Payment Desk cannot prepare dues yet: class fees are missing for ${health.classesWithoutFeeSettings} class${health.classesWithoutFeeSettings === 1 ? "" : "es"}. Open Fee Setup and fill class-wise annual tuition first.`,
        sessionLabel,
      ),
    );
  }

  const result = await repairMissingDues(sessionLabel);

  revalidateFinanceSurfaces();
  redirect(
    dashboardUrl(
      `Payment Desk dues fixed for ${sessionLabel}: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
      sessionLabel,
    ),
  );
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
