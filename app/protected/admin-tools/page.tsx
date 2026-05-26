import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

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

type AdminToolsTranslator = Awaited<ReturnType<typeof getTranslations<"AdminTools">>>;

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

function healthStatus(
  health: SystemSyncHealth,
  autoSyncRan: boolean,
  t: AdminToolsTranslator,
) {
  if (isUnavailableSystemSyncHealth(health)) {
    return { label: t("statusSyncUnavailable"), tone: "warning" as const };
  }

  if (isHealthy(health)) {
    return autoSyncRan
      ? { label: t("statusSyncRepaired"), tone: "info" as const }
      : { label: t("statusSynced"), tone: "good" as const };
  }

  if (health.classesWithoutFeeSettings > 0 || health.errors.length > 0) {
    return { label: t("statusSetupNeeded"), tone: "warning" as const };
  }

  return { label: t("statusDuesPending"), tone: "info" as const };
}

async function loadAdminToolsSyncState(
  sessionLabel: string,
  canAutoSync: boolean,
  t: AdminToolsTranslator,
): Promise<AdminToolsSyncState> {
  try {
    if (canAutoSync) {
      return await autoReconcileSessionIfSafe(sessionLabel);
    }

    return {
      health: await getSystemSyncHealth(sessionLabel),
      ran: false,
      reason: t("syncReasonAutoUnavailable"),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    return {
      health: buildUnavailableSystemSyncHealth(sessionLabel, errorMessage),
      result: null,
      ran: false,
      reason: t("syncReasonHealthFailed"),
      errorMessage,
    };
  }
}

export default async function AdvancedPage({ searchParams }: AdvancedPageProps) {
  const t = await getTranslations("AdminTools");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });
  const canRepairFeeData = hasStaffPermission(staff, "fees:write");
  const autoSync = await loadAdminToolsSyncState(viewSession.sessionLabel, canRepairFeeData, t);
  const feeDataHealth = autoSync.health;
  const status = healthStatus(feeDataHealth, autoSync.ran, t);
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
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={<StatusBadge label={status.label} tone={status.tone} />}
      />

      <OfficeNotice
        title={
          autoSync.errorMessage
            ? t("noticeHealthUnavailableTitle")
            : autoSync.ran
              ? t("noticeAutoSyncedTitle")
              : t("noticeAutoOnTitle")
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
          ? t("noticeHealthUnavailableBody", { error: autoSync.errorMessage })
          : autoSync.ran
            ? t("noticeAutoSyncedBody", { session: viewSession.sessionLabel })
            : t("noticeAutoOnBody")}
      </OfficeNotice>

      <SectionCard
        title={t("sessionStatusTitle", { session: viewSession.sessionLabel })}
        description={t("sessionStatusDescription")}
        actions={
          <Button asChild variant={isHealthy(feeDataHealth) ? "outline" : "default"}>
            <Link href={withSession("/protected/admin-tools/session-health")}>
              {t("sessionStatusOpenHealth")}
            </Link>
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("metricStudents")}
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.rawStudentsInActiveSession}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("metricDuesPrepared")}
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.workbookFinancialRowCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("metricDuesMissing")}
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {feeDataHealth.studentsMissingInstallmentRows}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("metricClassFeeGaps")}
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
        title={t("qualityTitle")}
        description={t("qualityDescription")}
        actions={<StatusBadge label={t("qualityReadOnly")} tone="info" />}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("qualityOfflineLabel")}
            </p>
            <p className="mt-2 font-semibold text-foreground">{t("qualityOfflineValue")}</p>
            <p className="mt-1 text-muted-foreground">{t("qualityOfflineDetail")}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("qualityWorkflowLabel")}
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {t("qualityWorkflowValue", {
                seconds: qualityBudgets.performance.officeWorkflow.paymentDeskSearchToSelectionMs / 1000,
              })}
            </p>
            <p className="mt-1 text-muted-foreground">{t("qualityWorkflowDetail")}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("qualityVisualLabel")}
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {t("qualityVisualValue", { count: qualityBudgets.visualRegression.routes.length })}
            </p>
            <p className="mt-1 text-muted-foreground">{t("qualityVisualDetail")}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        {visibleSections.map((section) => (
          <SectionCard key={section.title} title={section.title} description={section.description}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={withSession(item.href)}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 hover:border-border-strong hover:bg-surface-2 active:scale-[0.99] transition-all"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 group-hover:bg-surface-3 transition-colors">
                      <Icon className="size-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
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
