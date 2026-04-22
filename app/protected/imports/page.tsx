import { WorkflowGuard } from "@/components/office/office-ui";
import { StudentImportWorkflow } from "@/components/imports/student-import-workflow";
import { getStudentImportPageData } from "@/lib/import/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ImportsPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const staff = await requireStaffPermission("imports:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedBatchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const [data, setup] = await Promise.all([
    getStudentImportPageData(selectedBatchId || null),
    getSetupWizardData(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const canManageImports =
    hasStaffPermission(staff, "students:write") && readiness.importStudents.isReady;

  return (
    <div className="space-y-6">
      {!readiness.importStudents.isReady ? (
        <WorkflowGuard
          title={readiness.importStudents.title}
          detail={readiness.importStudents.detail}
          actionLabel={readiness.importStudents.actionLabel}
          actionHref={readiness.importStudents.actionHref}
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
