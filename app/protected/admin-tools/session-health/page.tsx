import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { REQUIRED_OFFICE_SESSION_LABELS } from "@/lib/session/available-sessions";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";
import {
  autoReconcileSessionIfSafe,
  getSystemSyncHealth,
  type SystemSyncHealth,
} from "@/lib/system-sync/finance-sync";
import {
  buildUnavailableSystemSyncHealth,
  getErrorMessage,
} from "@/lib/system-sync/health-fallback";

import { reconcileSessionAction } from "./actions";

type AdminToolsTranslator = Awaited<ReturnType<typeof getTranslations<"AdminTools">>>;

type SessionHealthPageProps = {
  searchParams?: Promise<{
    reconciled?: string;
    prepared?: string;
    error?: string;
    session?: string;
  }>;
};

type AcademicSessionRow = {
  session_label: string;
  status: string;
  is_current: boolean;
};

type ReconcileLogRow = {
  session_label: string;
  finished_at: string | null;
};

type SessionHealthCard = {
  session: AcademicSessionRow;
  health: SystemSyncHealth;
  lastReconciledAt: string | null;
  needsAttention: boolean;
  autoSyncRan: boolean;
  autoSyncReason: string;
};

type SessionSyncState = {
  health: SystemSyncHealth;
  ran: boolean;
  reason: string;
};

function getSessionBadge(session: AcademicSessionRow, t: AdminToolsTranslator) {
  if (session.session_label.toUpperCase().includes("TEST")) {
    return { label: t("sessionHealthBadgeTest"), tone: "info" as const };
  }

  if (session.is_current || session.status === "active") {
    return { label: t("sessionHealthBadgeActive"), tone: "good" as const };
  }

  return { label: t("sessionHealthBadgeArchived"), tone: "neutral" as const };
}

function needsSessionAttention(health: SystemSyncHealth) {
  return (
    health.studentsMissingInstallmentRows > 0 ||
    health.classesWithoutFeeSettings > 0 ||
    health.errors.length > 0
  );
}

function formatLastReconciled(value: string | null, neverLabel: string) {
  if (!value) {
    return neverLabel;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function fallbackSessionRows(): AcademicSessionRow[] {
  return REQUIRED_OFFICE_SESSION_LABELS.map((sessionLabel) => ({
    session_label: sessionLabel,
    status: "active",
    is_current: sessionLabel === "2026-27",
  }));
}

async function loadSessionSyncState(
  sessionLabel: string,
  canAutoReconcile: boolean,
  t: AdminToolsTranslator,
): Promise<SessionSyncState> {
  try {
    if (canAutoReconcile) {
      return await autoReconcileSessionIfSafe(sessionLabel);
    }

    return {
      health: await getSystemSyncHealth(sessionLabel),
      ran: false,
      reason: t("sessionHealthSyncReasonAutoUnavailable"),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    return {
      health: buildUnavailableSystemSyncHealth(sessionLabel, errorMessage),
      ran: false,
      reason: t("sessionHealthSyncReasonFailed"),
    };
  }
}

async function getSessionHealthCards(
  canAutoReconcile: boolean,
  t: AdminToolsTranslator,
): Promise<SessionHealthCard[]> {
  const supabase = await createClient();
  const { data: sessions, error: sessionsError } = await supabase
    .from("academic_sessions")
    .select("session_label,status,is_current")
    .order("session_label", { ascending: true });

  const sessionRows = sessionsError
    ? fallbackSessionRows()
    : ((sessions ?? []) as AcademicSessionRow[]).filter((session) => session.session_label.trim());
  const sessionLabels = sessionRows.map((session) => session.session_label);
  let latestBySession = new Map<string, string | null>();

  if (sessionLabels.length > 0) {
    const { data: logs, error: logsError } = await supabase
      .from("session_reconcile_log")
      .select("session_label,finished_at")
      .in("session_label", sessionLabels)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false });

    if (!logsError) {
      latestBySession = ((logs ?? []) as ReconcileLogRow[]).reduce((map, row) => {
        if (!map.has(row.session_label)) {
          map.set(row.session_label, row.finished_at);
        }

        return map;
      }, new Map<string, string | null>());
    }
  }

  return Promise.all(
    sessionRows.map(async (session) => {
      const autoSync = await loadSessionSyncState(session.session_label, canAutoReconcile, t);

      return {
        session,
        health: autoSync.health,
        lastReconciledAt: latestBySession.get(session.session_label) ?? null,
        needsAttention: needsSessionAttention(autoSync.health),
        autoSyncRan: autoSync.ran,
        autoSyncReason: autoSync.reason,
      };
    }),
  );
}

export default async function SessionHealthPage({ searchParams }: SessionHealthPageProps) {
  const t = await getTranslations("AdminTools");
  const staff = await requireStaffPermission("fees:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const canAutoReconcile = hasStaffPermission(staff, "fees:write");
  const cards = await getSessionHealthCards(canAutoReconcile, t);
  const attentionCount = cards.filter((card) => card.needsAttention).length;
  const autoSyncCount = cards.filter((card) => card.autoSyncRan).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("sessionHealthTitle")}
        description={t("sessionHealthDescription")}
        actions={
          <Button asChild variant="outline">
            <Link href="/protected/admin-tools">{t("sessionHealthBackToAdmin")}</Link>
          </Button>
        }
      />

      <OfficeNotice
        title={
          autoSyncCount > 0
            ? t("sessionHealthAutoSynced", { count: autoSyncCount })
            : attentionCount === 0
              ? t("sessionHealthAllHealthy")
              : t("sessionHealthAttention", { count: attentionCount })
        }
        tone={attentionCount === 0 || autoSyncCount > 0 ? "success" : "warning"}
      >
        {autoSyncCount > 0
          ? t("sessionHealthAutoSyncedBody")
          : attentionCount === 0
            ? t("sessionHealthAllHealthyBody")
            : t("sessionHealthAttentionBody")}
      </OfficeNotice>

      {resolvedSearchParams?.reconciled ? (
        <OfficeNotice title={t("sessionHealthReconcileTitle")} tone="success">
          {t("sessionHealthReconcileBody", {
            count: resolvedSearchParams.reconciled,
            prepared: resolvedSearchParams.prepared ?? "0",
          })}
        </OfficeNotice>
      ) : null}

      {resolvedSearchParams?.error ? (
        <OfficeNotice title={t("sessionHealthReconcileErrTitle")} tone="danger">
          {resolvedSearchParams.session ? `${resolvedSearchParams.session}: ` : ""}
          {resolvedSearchParams.error}
        </OfficeNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const badge = getSessionBadge(card.session, t);
          const studentsInThisSession = card.health.rawStudentsInActiveSession;

          return (
            <SectionCard
              key={card.session.session_label}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {card.session.session_label}
                  <StatusBadge label={badge.label} tone={badge.tone} />
                </span>
              }
              description={
                card.needsAttention
                  ? t("sessionHealthCardAttentionDesc")
                  : card.autoSyncRan
                    ? t("sessionHealthCardAutoDesc")
                    : t("sessionHealthCardReadyDesc")
              }
              actions={
                <StatusBadge
                  label={
                    card.needsAttention
                      ? t("sessionHealthBadgeNeedsAttention")
                      : t("sessionHealthBadgeHealthy")
                  }
                  tone={card.needsAttention ? "warning" : "good"}
                />
              }
            >
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("sessionHealthCardActiveStudents")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">{studentsInThisSession}</dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("sessionHealthCardDuesPrepared")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.workbookFinancialRowCount}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("sessionHealthCardDuesMissing")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.studentsMissingInstallmentRows}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("sessionHealthCardClassesMissing")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.classesWithoutFeeSettings}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("sessionHealthCardLastReconciled")}</span>
                <span className="font-semibold text-foreground">
                  {formatLastReconciled(card.lastReconciledAt, t("sessionHealthCardLastReconciledNever"))}
                </span>
              </div>

              <div className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                {card.autoSyncReason}
              </div>

              {card.needsAttention ? (
                <details className="mt-4 rounded-md border border-border bg-card">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-foreground">
                    {t("sessionHealthManualFallback")}
                  </summary>
                  <div className="border-t border-border p-3">
                    {card.health.classesWithoutFeeSettings > 0 ? (
                      <Button asChild className="w-full" variant="outline">
                        <Link href={`/protected/fee-setup?session=${encodeURIComponent(card.session.session_label)}`}>
                          {t("sessionHealthOpenFeeSetup")}
                        </Link>
                      </Button>
                    ) : (
                      <form action={reconcileSessionAction}>
                        <input type="hidden" name="sessionLabel" value={card.session.session_label} />
                        <PendingSubmitButton
                          idleLabel={t("sessionHealthReconcileButton")}
                          pendingLabel={t("sessionHealthReconcileButtonPending")}
                          className="w-full"
                        />
                      </form>
                    )}
                  </div>
                </details>
              ) : null}
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
