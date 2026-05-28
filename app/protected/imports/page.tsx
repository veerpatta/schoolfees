import { WorkflowGuard } from "@/components/office/office-ui";
import { StudentImportWorkflow } from "@/components/imports/student-import-workflow";
import { MissingDuesBanner } from "@/components/shared/missing-dues-banner";
import { createEmptyImportPageData, getStudentImportPageData } from "@/lib/import/data";
import { getDuplicateAuditSummary } from "@/lib/import/duplicate-audit";
import { getStudentImportWorkflowReadiness } from "@/lib/import/readiness";
import { getStudentFormOptions } from "@/lib/students/data";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ImportsPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    mode?: string;
    notice?: string;
    error?: string;
    session?: string;
    sessionLabel?: string;
  }>;
};

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const staff = await requireStaffPermission("imports:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedBatchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const mode = resolvedSearchParams?.mode === "update" ? "update" : "add";
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session ?? resolvedSearchParams?.sessionLabel,
    cookieSession: await getViewSessionCookie(),
  });
  let data = createEmptyImportPageData(mode);
  let importDataError: string | null = null;
  const studentFormOptions = await getStudentFormOptions({
    sessionLabel: viewSession.sessionLabel,
  });

  try {
    data = await getStudentImportPageData(selectedBatchId || null, mode);
  } catch (error) {
    importDataError = error instanceof Error ? error.message : "Unable to load import data.";
  }

  let readiness = null;
  let readinessError: string | null = null;

  try {
    readiness = await getStudentImportWorkflowReadiness(
      staff.appRole,
      data.selectedBatch?.targetSessionLabel ?? null,
    );
  } catch (error) {
    readinessError =
      error instanceof Error ? error.message : "Setup readiness could not be loaded.";
  }

  const canManageImports = hasStaffPermission(staff, "students:write") && Boolean(readiness?.isReady);

  let duplicateAuditSummary = null;
  if (data.selectedBatch && data.selectedBatch.importMode === "add") {
    try {
      duplicateAuditSummary = await getDuplicateAuditSummary(data.selectedBatch.id);
    } catch (error) {
      console.error("Duplicate audit summary failed", error);
    }
  }

  // Audit 1.13 — when a commit completed with a ledger-sync error, surface it
  // as a persistent banner above the workflow so staff don't miss it. The
  // commit redirects with `?error=Students imported, but dues sync needs
  // attention: …`; we re-render that here in a non-dismissable banner with a
  // Fee Setup CTA.
  const ledgerSyncErrorMessage =
    resolvedSearchParams?.error?.trim() &&
    resolvedSearchParams.error.includes("dues sync needs attention")
      ? resolvedSearchParams.error.trim()
      : null;

  return (
    <div className="space-y-6">
      <MissingDuesBanner ledgerSyncError={ledgerSyncErrorMessage} />
      {importDataError ? (
        <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          Import data could not be loaded safely: {importDataError}
        </div>
      ) : null}

      {readinessError ? (
        <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          Import readiness could not be loaded safely: {readinessError}
        </div>
      ) : readiness && !readiness.isReady ? (
        <WorkflowGuard
          title={readiness.title}
          detail={readiness.detail}
          actionLabel={readiness.actionLabel}
          actionHref={readiness.actionHref}
        />
      ) : null}

      <StudentImportWorkflow
        data={data}
        canManage={canManageImports}
        currentSessionLabel={viewSession.sessionLabel}
        sessionOptions={studentFormOptions.sessionOptions}
        notice={resolvedSearchParams?.notice?.trim() || null}
        error={resolvedSearchParams?.error?.trim() || null}
        duplicateAuditSummary={duplicateAuditSummary}
      />
    </div>
  );
}
