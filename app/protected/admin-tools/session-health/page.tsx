import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getSystemSyncHealth, type SystemSyncHealth } from "@/lib/system-sync/finance-sync";

import { reconcileSessionAction } from "./actions";

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
};

function getSessionBadge(session: AcademicSessionRow) {
  if (session.session_label.toUpperCase().includes("TEST")) {
    return { label: "Test", tone: "info" as const };
  }

  if (session.is_current || session.status === "active") {
    return { label: "Active", tone: "good" as const };
  }

  return { label: "Archived", tone: "neutral" as const };
}

function needsSessionAttention(health: SystemSyncHealth) {
  return (
    health.studentsMissingInstallmentRows > 0 ||
    health.classesWithoutFeeSettings > 0 ||
    health.errors.length > 0
  );
}

function formatLastReconciled(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

async function getSessionHealthCards(): Promise<SessionHealthCard[]> {
  const supabase = await createClient();
  const { data: sessions, error: sessionsError } = await supabase
    .from("academic_sessions")
    .select("session_label,status,is_current")
    .order("session_label", { ascending: true });

  if (sessionsError) {
    throw new Error(sessionsError.message);
  }

  const sessionRows = ((sessions ?? []) as AcademicSessionRow[]).filter((session) =>
    session.session_label.trim(),
  );
  const sessionLabels = sessionRows.map((session) => session.session_label);
  let latestBySession = new Map<string, string | null>();

  if (sessionLabels.length > 0) {
    const { data: logs, error: logsError } = await supabase
      .from("session_reconcile_log")
      .select("session_label,finished_at")
      .in("session_label", sessionLabels)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false });

    if (logsError) {
      throw new Error(logsError.message);
    }

    latestBySession = ((logs ?? []) as ReconcileLogRow[]).reduce((map, row) => {
      if (!map.has(row.session_label)) {
        map.set(row.session_label, row.finished_at);
      }

      return map;
    }, new Map<string, string | null>());
  }

  return Promise.all(
    sessionRows.map(async (session) => {
      const health = await getSystemSyncHealth(session.session_label);

      return {
        session,
        health,
        lastReconciledAt: latestBySession.get(session.session_label) ?? null,
        needsAttention: needsSessionAttention(health),
      };
    }),
  );
}

export default async function SessionHealthPage({ searchParams }: SessionHealthPageProps) {
  await requireStaffPermission("fees:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const cards = await getSessionHealthCards();
  const attentionCount = cards.filter((card) => card.needsAttention).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Session Health"
        description="Review each academic year and reconcile missing dues from one place."
        actions={
          <Button asChild variant="outline">
            <Link href="/protected/admin-tools">Back to Admin Tools</Link>
          </Button>
        }
      />

      <OfficeNotice
        title={attentionCount === 0 ? "All sessions healthy" : `${attentionCount} sessions need attention.`}
        tone={attentionCount === 0 ? "success" : "warning"}
      >
        {attentionCount === 0
          ? "Every session has prepared dues and class fee settings."
          : "Open the session card that needs work, then use Reconcile this session."}
      </OfficeNotice>

      {resolvedSearchParams?.reconciled ? (
        <OfficeNotice title="Reconcile complete" tone="success">
          {resolvedSearchParams.reconciled} reconciled. {resolvedSearchParams.prepared ?? "0"} dues prepared.
        </OfficeNotice>
      ) : null}

      {resolvedSearchParams?.error ? (
        <OfficeNotice title="Reconcile could not finish" tone="danger">
          {resolvedSearchParams.session ? `${resolvedSearchParams.session}: ` : ""}
          {resolvedSearchParams.error}
        </OfficeNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const badge = getSessionBadge(card.session);
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
                  ? "This session needs a dues or fee setup review."
                  : "This session is ready."
              }
              actions={
                <StatusBadge
                  label={card.needsAttention ? "Needs attention" : "Healthy"}
                  tone={card.needsAttention ? "warning" : "good"}
                />
              }
            >
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Active students
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">{studentsInThisSession}</dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Dues prepared
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.workbookFinancialRowCount}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Dues missing
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.studentsMissingInstallmentRows}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Classes missing fees
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">
                    {card.health.classesWithoutFeeSettings}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="text-muted-foreground">Last reconciled</span>
                <span className="font-semibold text-foreground">
                  {formatLastReconciled(card.lastReconciledAt)}
                </span>
              </div>

              <form action={reconcileSessionAction} className="mt-4">
                <input type="hidden" name="sessionLabel" value={card.session.session_label} />
                <PendingSubmitButton
                  idleLabel="Reconcile this session"
                  pendingLabel="Reconciling..."
                  className="w-full"
                />
              </form>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
