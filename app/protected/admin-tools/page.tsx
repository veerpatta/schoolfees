import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
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

export const revalidate = 60;

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

      <OfficeNotice title="Not for daily work">
        These tools are rarely needed. Daily work should stay in Dashboard, Students, Fee Setup,
        Payment Desk, and Transactions.
      </OfficeNotice>

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
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Fee Setup year
            </p>
            <p className="mt-2 font-semibold text-foreground">{feeDataHealth.activeFeePolicySession}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Students this year
            </p>
            <p className="mt-2 font-semibold text-foreground">{feeDataHealth.rawStudentsInActiveSession}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Dues not prepared
            </p>
            <p className="mt-2 font-semibold text-foreground">{feeDataHealth.studentsMissingDues}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Payment Desk
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {feeDataHealth.paymentDeskReady ? "Ready" : "Needs attention"}
            </p>
          </div>
        </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
            <Button asChild>
              <Link href="/protected/admin-tools/session-health">Open Session Health</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Use one row per academic session for routine dues reconciliation.
            </p>
          </div>

          <details className="mt-4 rounded-lg border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              Legacy repair actions
            </summary>
            <div className="border-t border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Prefer Session Health for routine reconciliation.
              </p>
              <div className="flex flex-wrap gap-2">
              <form action={repairCurrentSessionDuesAction}>
                <PendingSubmitButton idleLabel="Prepare missing dues" pendingLabel="Preparing..." />
              </form>
              <form action={syncCurrentSessionAction}>
                <PendingSubmitButton
                  idleLabel="Update fee records for this year"
                  pendingLabel="Updating..."
                  variant="outline"
                />
              </form>
              <form action={alignWorkingSessionWithFeeSetupAction}>
                <PendingSubmitButton
                  idleLabel="Align year with Fee Setup"
                  pendingLabel="Aligning..."
                  variant="outline"
                />
              </form>
              <form action={repairPaymentDeskDataAction}>
                <PendingSubmitButton
                  idleLabel="Fix Payment Desk dues"
                  pendingLabel="Fixing..."
                  variant="outline"
                />
              </form>
              <form action={syncDashboardNowAction}>
                <PendingSubmitButton
                  idleLabel="Refresh Dashboard totals"
                  pendingLabel="Refreshing..."
                  variant="outline"
                />
              </form>
              </div>
            </div>
          </details>

        <details className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            Technical details
          </summary>
          <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
            <div>
              <p className="font-semibold text-foreground">Setup status</p>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                <p>Current school setup year: {feeDataHealth.academicCurrentSession ?? "Not set"}</p>
                <p>Fee Setup year: {feeDataHealth.activeFeePolicySession}</p>
                {feeDataHealth.classesWithoutFeeSettings > 0 ? (
                  <div className="rounded-lg bg-warning-soft text-warning-soft-foreground px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Classes without fee settings: {feeDataHealth.classesWithoutFeeSettings}</span>
                      <StatusBadge label="Needs review" tone="warning" />
                    </div>
                    <p className="mt-1 text-xs">Students in these classes will have Rs 0 dues.</p>
                  </div>
                ) : (
                  <p>Classes without fee settings: {feeDataHealth.classesWithoutFeeSettings}</p>
                )}
                <p>Prepared dues records: {feeDataHealth.workbookFinancialRowCount}</p>
              </div>
            </div>
            <div>
            <p className="font-semibold text-foreground">Payment preview setup</p>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                {databaseObjectStatuses.map((status) => (
                  <div key={status.key} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{status.objectName}</span>
                      <StatusBadge
                        label={status.usable ? "Ready" : "Database update pending"}
                        tone={status.usable ? "good" : "warning"}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{status.message}</p>
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
                    className="rounded-xl border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong hover:bg-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-full border border-border bg-card p-2.5 text-foreground">
                        <Icon className="size-4" />
                      </div>
                      <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm">
                        Open
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
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
