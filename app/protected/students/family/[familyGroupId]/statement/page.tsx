import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { FamilyStatementDocument } from "@/components/students/family-statement-document";
import { MasterStatementPrintActions } from "@/components/students/master-statement-print-actions";
import { getFamilyWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/lib/supabase/session";

type FamilyStatementPageProps = {
  params: Promise<{
    familyGroupId: string;
  }>;
};

export default async function FamilyStatementPage({
  params,
}: FamilyStatementPageProps) {
  await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const workspace = await getFamilyWorkspaceData(resolvedParams.familyGroupId);

  if (!workspace || workspace.students.length === 0) {
    notFound();
  }

  const primaryStudent = workspace.students[0].student;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students / Families"
        title={`Family Statement: Group ${workspace.familyGroup.name}`}
        description="Printable consolidated master statement for all siblings in the family group."
        actions={<MasterStatementPrintActions backHref={`/protected/students/${primaryStudent.id}`} />}
        className="no-print"
      />

      <FamilyStatementDocument
        familyGroup={workspace.familyGroup}
        students={workspace.students}
      />
    </div>
  );
}
