import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { advancedHubSections } from "@/lib/config/navigation";
import { appendSessionParam } from "@/lib/navigation/session-href";
import qualityBudgets from "@/quality/office-quality-budgets.json";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import {
  autoReconcileSessionIfSafe,
  getSystemSyncHealth,
  type SystemSyncHealth,
} from "@/lib/system-sync/finance-sync";
import {
  buildUnavailableSystemSyncHealth,
  getErrorMessage,
  isUnavailableSystemSyncHealth,
} from "@/lib/system-sync/health-fallback";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export const revalidate = 60;

type AdvancedPageProps = {
  searchParams?: Promise<{ session?: string }>;
};

type AdminToolsSyncState = {
  health: SystemSyncHealth;
  result?: unknown;
  ran: boolean;
  reason: string;
  errorMessage?: string;
};

function isHealthy(health: SystemSyncHealth) {
  return (
    health.dashboardReady &&
    health.paymentDeskReady &&
    health.studentsMissingInstallmentRows === 0 &&
    health.classesWithoutFeeSettings === 0 &&
    health.errors.length === 0
  );
}

function healthStatus(health: SystemSyncHealth, autoSyncRan: boolean) {
  if (isUnavailableSystemSyncHealth(health)) {
    return { label: "Sync unavailable", tone: "warning" as const };
  }

  if (isHealthy(health)) {
    return autoSyncRan
      ? { label: "Sync repaired", tone: "info" as const }
      : { label: "Synced", tone: "good" as const };
  }

  if (health.classesWithoutFeeSettings > 0 || health.errors.length > 0) {
    return { label: "Setup needed", tone: "warning" as const };
  }

  return { label: "Dues pending", tone: "info" as const };
}

async function loadAdminToolsSyncState(
  sessionLabel: string,
  canAutoSync: boolean,
): Promise<AdminToolsSyncState> {
  try {
    if (canAutoSync) {
      return await autoReconcileSessionIfSafe(sessionLabel);
    }

    return {
      health: await getSystemSyncHealth(sessionLabel),
      ran: false,
      reason: "Automatic sync is available to fee setup admins.",
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    return {
      health: buildUnavailableSystemSyncHealth(sessionLabel, errorMessage),
      result: null,
      ran: false,
      reason:
        "Admin Tools opened, but the automatic health check could not finish. Normal pages remain available while setup is reviewed.",
      errorMessage,
    };
  }
}

export default async function AdvancedPage({ searchParams }: AdvancedPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });
  const canRepairFeeData = hasStaffPermission(staff, "fees:write");
  const autoSync = await loadAdminToolsSyncState(viewSession.sessionLabel, canRepairFeeData);
  const feeDataHealth = autoSync.health;
  const status = healthStatus(feeDataHealth, autoSync.ran);
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

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
        description="Setup and staff tools. Routine dues sync runs automatically from Students and Fee Setup."
        actions={<StatusBadge label={status.label} tone={status.tone} />}
      />

      <OfficeNotice
        title={
          autoSync.errorMessage
            ? "Health check unavailable"
            : autoSync.ran
              ? "Automatic sync just updated this session"
              : "Automatic sync is on"
        }
        tone={
          autoSync.errorMessage
            ? "warning"
            : autoSync.ran || isHealthy(feeDataHealth)
              ? "success"
              : "info"
        }
      >
        {autoSync.errorMessage
          ? `Admin Tools opened, but the automatic health check could not finish. ${autoSync.errorMessage}`
          : autoSync.ran
          ? `${viewSession.sessionLabel} was reconciled automatically. Continue normal work in Students, Fee Setup, Payment Desk, and Transactions.`
          : "The app prepares dues after student changes, imports, Fee Setup changes, and selected-student Payment Desk loading. Admin Tools is now only for review and rare setup tasks."}
      </OfficeNotice>

      <SectionCard
        title={`${viewSession.sessionLabel} session status`}
        description="This shows whether the selected year is ready for Dashboard, Payment Desk, Transactions, and Defaulters."
        actions={
          <Button asChild variant={isHealthy(feeDataHealth) ? "outline" : "default"}>
            <Link href={withSession("/protected/admin-tools/session-health")}>
              Open Session Health
            </Link>
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Students
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.rawStudentsInActiveSession}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Dues prepared
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.workbookFinancialRowCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Dues missing
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.studentsMissingInstallmentRows}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Class fee gaps
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.classesWithoutFeeSettings}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{status.label}</p>
              <p className="mt-1 text-muted-foreground">{autoSync.reason}</p>
            </div>
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Platform quality safeguards"
        description="Read-only guardrails for offline fallback, visual checks, and workflow speed targets."
        actions={<StatusBadge label="Read-only" tone="info" />}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Offline fallback
            </p>
            <p className="mt-2 font-semibold text-foreground">Read-only</p>
            <p className="mt-1 text-muted-foreground">
              Payments and receipts still require server confirmation.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Workflow target
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {qualityBudgets.performance.officeWorkflow.paymentDeskSearchToSelectionMs / 1000}s lookup
            </p>
            <p className="mt-1 text-muted-foreground">
              Search-to-student selection budget for counter work.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Visual smoke
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {qualityBudgets.visualRegression.routes.length} routes
            </p>
            <p className="mt-1 text-muted-foreground">
              Dashboard, Payment Desk, Students, Reports, and Admin Tools in TEST session.
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        {visibleSections.map((section) => (
          <SectionCard key={section.title} title={section.title} description={section.description}>
            <div className="grid gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={withSession(item.href)}
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
