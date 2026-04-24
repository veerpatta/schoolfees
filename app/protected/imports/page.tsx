import { WorkflowGuard } from "@/components/office/office-ui";
import { StudentImportWorkflow } from "@/components/imports/student-import-workflow";
import { createEmptyImportPageData, getStudentImportPageData } from "@/lib/import/data";
import { getStudentImportWorkflowReadiness } from "@/lib/import/readiness";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ImportsPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    mode?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const staff = await requireStaffPermission("imports:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedBatchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const mode = resolvedSearchParams?.mode === "update" ? "update" : "add";
  let data = createEmptyImportPageData(mode);
  let importDataError: string | null = null;

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

  return (
    <div className="space-y-6">
      {importDataError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Import data could not be loaded safely: {importDataError}
        </div>
      ) : null}

      {readinessError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
        notice={resolvedSearchParams?.notice?.trim() || null}
        error={resolvedSearchParams?.error?.trim() || null}
      />
    </div>
  );
}
