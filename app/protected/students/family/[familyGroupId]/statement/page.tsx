import { notFound } from "next/navigation";

import { isUuid } from "@/lib/helpers/uuid";

import { PageHeader } from "@/components/admin/page-header";
import { FamilyStatementDocument } from "@/components/students/family-statement-document";
import { MasterStatementPrintActions } from "@/components/students/master-statement-print-actions";
import { appendSessionParam } from "@/lib/navigation/session-href";
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

  // Guard before the first query: a non-UUID segment makes Postgres raise
  // `invalid input syntax for type uuid`, which is an unhandled 500, not a
  // not-found. Checking the result afterwards is too late.
  if (!isUuid(resolvedParams.familyGroupId)) {
    notFound();
  }
  const workspace = await getFamilyWorkspaceData(resolvedParams.familyGroupId);

  if (!workspace || workspace.students.length === 0) {
    notFound();
  }

  const primaryStudent = workspace.students[0].student;
  const sessionLabel = workspace.familyGroup.academic_session_label;
  const backHref = appendSessionParam(`/protected/students/${primaryStudent.id}`, sessionLabel);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students / Families"
        title={`Family Statement: Group ${workspace.familyGroup.name}`}
        description="Printable consolidated master statement for all siblings in the family group."
        actions={<MasterStatementPrintActions backHref={backHref} />}
        className="no-print"
      />

      <FamilyStatementDocument
        familyGroup={workspace.familyGroup}
        students={workspace.students}
      />
    </div>
  );
}
