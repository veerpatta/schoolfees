"use server";

import { redirect } from "next/navigation";

import {
  repairMissingDues,
  revalidateFinanceSurfaces,
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
