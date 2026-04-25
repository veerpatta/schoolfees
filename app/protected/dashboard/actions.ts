"use server";

import { redirect } from "next/navigation";

import { getFeePolicySummary } from "@/lib/fees/data";
import {
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
      `Dues repair completed: ${result.installmentsToInsert} inserted, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} protected rows left for review.`,
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
      `Current session sync completed for ${policy.academicSessionLabel}: ${result.installmentsToInsert} inserted, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} protected rows left for review.`,
    ),
  );
}

export async function repairPaymentDeskDataAction() {
  await requireStaffPermission("fees:write");
  const policy = await getFeePolicySummary();
  const result = await repairMissingDues(policy.academicSessionLabel);

  revalidateFinanceSurfaces();
  redirect(
    dashboardUrl(
      `Payment Desk data repaired for ${policy.academicSessionLabel}: ${result.installmentsToInsert} inserted, ${result.installmentsToUpdate} updated, ${result.installmentsToCancel} cancelled, ${result.lockedInstallments} protected rows left for review.`,
    ),
  );
}
