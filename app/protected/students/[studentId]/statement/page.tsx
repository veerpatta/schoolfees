import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { MasterStatementDocument } from "@/components/students/master-statement-document";
import { MasterStatementPrintActions } from "@/components/students/master-statement-print-actions";
import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/lib/supabase/session";

type StudentStatementPageProps = {
  params: Promise<{
    studentId: string;
  }>;
};

export default async function StudentStatementPage({
  params,
}: StudentStatementPageProps) {
  await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const workspace = await getStudentWorkspaceData(resolvedParams.studentId);

  if (!workspace.student || !workspace.financialSnapshot) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title={`Statement: ${workspace.student.fullName}`}
        description="Printable master fee statement with workbook fee breakup and installment-wise dues."
        actions={<MasterStatementPrintActions backHref={`/protected/students/${workspace.student.id}`} />}
        className="no-print"
      />

      <MasterStatementDocument
        student={workspace.student}
        financialSnapshot={workspace.financialSnapshot}
        installmentBalances={workspace.installmentBalances}
      />
    </div>
  );
}
