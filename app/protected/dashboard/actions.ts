"use server";

import { redirect } from "next/navigation";

import { getFeePolicySummary } from "@/lib/fees/data";
import {
  alignWorkingSessionWithFeeSetup,
  getSystemSyncHealth,
  repairMissingDues,
  revalidateFinanceSurfaces,
  syncSessionDues,
} from "@/lib/system-sync/finance-sync";
import { requireStaffPermission } from "@/lib/supabase/session";

function dashboardUrl(notice: string) {
  const params = new URLSearchParams({ notice });
  return `/protected/dashboard?${params.toString()}`;
}

export async function repairCurrentSessionDuesAction() {
  await requireStaffPermission("fees:write");
  const result = await repairMissingDues("");

  redirect(
    dashboardUrl(
      `Missing dues prepared: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
    ),
  );
}

export async function syncDashboardNowAction() {
  await requireStaffPermission("fees:write");
  revalidateFinanceSurfaces();
  redirect(dashboardUrl("Dashboard, Payment Desk, Transactions, and reports were refreshed."));
}

export async function syncCurrentSessionAction() {
  await requireStaffPermission("fees:write");
  const policy = await getFeePolicySummary();
  const result = await syncSessionDues(policy.academicSessionLabel);

  redirect(
    dashboardUrl(
      `Fee records updated for ${policy.academicSessionLabel}: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
    ),
  );
}

export async function repairPaymentDeskDataAction() {
  await requireStaffPermission("fees:write");
  const policy = await getFeePolicySummary();
  const health = await getSystemSyncHealth(policy.academicSessionLabel);

  if (!health.requiredDatabaseObjectsStatus.previewWorkbookPaymentAllocation.usable) {
    redirect(
      dashboardUrl(
        "Payment Desk dues cannot be fixed yet: a database update is pending.",
      ),
    );
  }

  if (!health.requiredDatabaseObjectsStatus.postStudentPayment.usable) {
    redirect(
      dashboardUrl(
        "Payment Desk dues cannot be fixed yet: a database update is pending.",
      ),
    );
  }

  if (health.studentsMissingInstallments.length === 0 && health.studentsWithNoFeeSetting === 0) {
    revalidateFinanceSurfaces();
    redirect(
      dashboardUrl(
        `Payment Desk dues checked for ${policy.academicSessionLabel}: no students with unprepared dues were found.`,
      ),
    );
  }

  if (health.studentsMissingInstallments.length === 0 && health.studentsWithNoFeeSetting > 0) {
    redirect(
      dashboardUrl(
        `Payment Desk cannot prepare dues yet: class fees are missing for ${health.classesWithoutFeeSettings} class${health.classesWithoutFeeSettings === 1 ? "" : "es"}. Open Fee Setup and fill class-wise annual tuition first.`,
      ),
    );
  }

  const result = await repairMissingDues(policy.academicSessionLabel);

  revalidateFinanceSurfaces();
  redirect(
    dashboardUrl(
      `Payment Desk dues fixed for ${policy.academicSessionLabel}: ${result.installmentsToInsert} prepared, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} rows kept for review.`,
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
