import { StudentImportWorkflow } from "@/components/imports/student-import-workflow";
import { getStudentImportPageData } from "@/lib/import/data";
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
  const data = await getStudentImportPageData(selectedBatchId || null);

  return (
    <StudentImportWorkflow
      data={data}
      canManage={hasStaffPermission(staff, "students:write")}
      notice={resolvedSearchParams?.notice?.trim() || null}
      error={resolvedSearchParams?.error?.trim() || null}
    />
  );
}
