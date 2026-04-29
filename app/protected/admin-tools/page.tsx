import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { advancedHubSections } from "@/lib/config/navigation";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getSystemSyncHealth } from "@/lib/system-sync/finance-sync";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

import {
  alignWorkingSessionWithFeeSetupAction,
  repairCurrentSessionDuesAction,
  repairPaymentDeskDataAction,
  syncCurrentSessionAction,
  syncDashboardNowAction,
} from "../dashboard/actions";

export default async function AdvancedPage() {
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });
  const canRepairFeeData = hasStaffPermission(staff, "fees:write");
  const policy = await getFeePolicySummary();
  const feeDataHealth = await getSystemSyncHealth(policy.academicSessionLabel);
  const databaseObjectStatuses = Object.values(feeDataHealth.requiredDatabaseObjectsStatus);

  const visibleSections = advancedHubSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasStaffPermission(staff, item.requiredPermission)),
    }))
    .filter((section) => section.items.length > 0 && section.title !== "Fee Data Troubleshooting");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Admin Tools"
        description="Rare setup, staff, correction, and troubleshooting tools."
        actions={<StatusBadge label="Rare admin area" tone="accent" />}
      />

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
        These tools are rarely needed. Daily work should stay in Dashboard, Students, Fee Setup,
        Payment Desk, and Transactions.
      </div>

      {canRepairFeeData ? (
        <SectionCard
          id="fee-data-troubleshooting"
          title="Fee Data Troubleshooting"
          description="Use these actions only when students or dues are missing from Dashboard, Payment Desk, Transactions, or reports."
          actions={
            <StatusBadge
              label={feeDataHealth.dashboardReady && feeDataHealth.paymentDeskReady ? "Ready" : "Needs attention"}
              tone={feeDataHealth.dashboardReady && feeDataHealth.paymentDeskReady ? "good" : "warning"}
            />
          }
        >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Fee Setup year
            </p>
            <p className="mt-2 font-semibold text-slate-950">{feeDataHealth.activeFeePolicySession}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Students this year
            </p>
            <p className="mt-2 font-semibold text-slate-950">{feeDataHealth.rawStudentsInActiveSession}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Dues not prepared
            </p>
            <p className="mt-2 font-semibold text-slate-950">{feeDataHealth.studentsMissingDues}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Payment Desk
            </p>
            <p className="mt-2 font-semibold text-slate-950">
              {feeDataHealth.paymentDeskReady ? "Ready" : "Needs attention"}
            </p>
          </div>
        </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <form action={repairCurrentSessionDuesAction}>
              <Button type="submit">Prepare missing dues</Button>
            </form>
            <form action={syncCurrentSessionAction}>
              <Button type="submit" variant="outline">
                Update fee records for this year
              </Button>
            </form>
            <form action={alignWorkingSessionWithFeeSetupAction}>
              <Button type="submit" variant="outline">
                Align year with Fee Setup
              </Button>
            </form>
            <form action={repairPaymentDeskDataAction}>
              <Button type="submit" variant="outline">
                Fix Payment Desk dues
              </Button>
            </form>
            <form action={syncDashboardNowAction}>
              <Button type="submit" variant="outline">
                Refresh Dashboard totals
              </Button>
            </form>
          </div>

        <details className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
            Technical details
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 lg:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-950">Setup status</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>Current school setup year: {feeDataHealth.academicCurrentSession ?? "Not set"}</p>
                <p>Fee Setup year: {feeDataHealth.activeFeePolicySession}</p>
                <p>Classes without fee settings: {feeDataHealth.classesWithoutFeeSettings}</p>
                <p>Prepared dues records: {feeDataHealth.workbookFinancialRowCount}</p>
              </div>
            </div>
            <div>
            <p className="font-semibold text-slate-950">Payment preview setup</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {databaseObjectStatuses.map((status) => (
                  <div key={status.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{status.objectName}</span>
                      <StatusBadge
                        label={status.usable ? "Ready" : "Database update pending"}
                        tone={status.usable ? "good" : "warning"}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{status.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>
        </SectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {visibleSections.map((section) => (
          <SectionCard key={section.title} title={section.title} description={section.description}>
            <div className="grid gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-700">
                        <Icon className="size-4" />
                      </div>
                      <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm">
                        Open
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
