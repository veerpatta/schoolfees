import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/loading-skeleton";
import { advancedHubSections } from "@/lib/config/navigation";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { getSystemSyncHealth, type SystemSyncHealth } from "@/lib/system-sync/finance-sync";
import { getErrorMessage } from "@/lib/system-sync/health-fallback";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

import { reconcileSessionAction } from "./session-health/actions";

type AdminToolsTranslator = Awaited<ReturnType<typeof getTranslations<"AdminTools">>>;

type AdvancedPageProps = {
  searchParams?: Promise<{ session?: string }>;
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

function healthStatus(health: SystemSyncHealth, t: AdminToolsTranslator) {
  if (isHealthy(health)) {
    return { label: t("statusSynced"), tone: "good" as const };
  }

  if (health.classesWithoutFeeSettings > 0 || health.errors.length > 0) {
    return { label: t("statusSetupNeeded"), tone: "warning" as const };
  }

  return { label: t("statusDuesPending"), tone: "info" as const };
}

async function SystemStatusCard({
  sessionLabel,
  canReconcile,
  t,
}: {
  sessionLabel: string;
  canReconcile: boolean;
  t: AdminToolsTranslator;
}) {
  let health: SystemSyncHealth;
  try {
    health = await getSystemSyncHealth(sessionLabel);
  } catch (error) {
    return (
      <SectionCard
        title={t("sessionStatusTitle", { session: sessionLabel })}
        description={t("sessionStatusDescription")}
        actions={<StatusBadge label={t("statusSyncUnavailable")} tone="warning" />}
      >
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{t("noticeHealthUnavailableTitle")}</p>
            <p className="mt-1 break-words">
              {t("noticeHealthUnavailableBody", { error: getErrorMessage(error) })}
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const status = healthStatus(health, t);
  const healthy = isHealthy(health);

  return (
    <SectionCard
      title={t("sessionStatusTitle", { session: sessionLabel })}
      description={t("sessionStatusDescription")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          <Button asChild variant={healthy ? "outline" : "default"} size="sm">
            <Link href={appendSessionParam("/protected/admin-tools/session-health", sessionLabel)}>
              {t("sessionStatusOpenHealth")}
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("metricStudents")} value={health.rawStudentsInActiveSession} />
        <Metric label={t("metricDuesPrepared")} value={health.workbookFinancialRowCount} />
        <Metric label={t("metricDuesMissing")} value={health.studentsMissingInstallmentRows} />
        <Metric label={t("metricClassFeeGaps")} value={health.classesWithoutFeeSettings} />
      </div>

      {canReconcile && !healthy && health.classesWithoutFeeSettings === 0 ? (
        <form
          action={reconcileSessionAction}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
        >
          <input type="hidden" name="sessionLabel" value={sessionLabel} />
          <p className="text-muted-foreground">{t("sessionHealthAttentionBody")}</p>
          <PendingSubmitButton
            idleLabel={t("sessionHealthReconcileButton")}
            pendingLabel={t("sessionHealthReconcileButtonPending")}
          />
        </form>
      ) : null}
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SystemStatusFallback({
  sessionLabel,
  t,
}: {
  sessionLabel: string;
  t: AdminToolsTranslator;
}) {
  return (
    <SectionCard
      title={t("sessionStatusTitle", { session: sessionLabel })}
      description={t("sessionStatusDescription")}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingBlock key={index} />
        ))}
      </div>
    </SectionCard>
  );
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
  const canReconcile = hasStaffPermission(staff, "fees:write");
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

  const visibleSections = advancedHubSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasStaffPermission(staff, item.requiredPermission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <OfficeNotice title={t("noticeAutoOnTitle")} tone="info">
        {t("noticeAutoOnBody")}
      </OfficeNotice>

      <Suspense
        fallback={<SystemStatusFallback sessionLabel={viewSession.sessionLabel} t={t} />}
      >
        <SystemStatusCard
          sessionLabel={viewSession.sessionLabel}
          canReconcile={canReconcile}
          t={t}
        />
      </Suspense>

      <div className="grid gap-5 xl:grid-cols-2">
        {visibleSections.map((section) => (
          <SectionCard key={section.title} title={section.title} description={section.description}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={withSession(item.href)}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 transition-all hover:border-border-strong hover:bg-surface-2 active:scale-[0.99]"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 transition-colors group-hover:bg-surface-3">
                      <Icon className="size-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
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
