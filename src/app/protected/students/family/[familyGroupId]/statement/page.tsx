import { notFound } from "next/navigation";

import { isUuid } from "@/platform/helpers/uuid";

import { PageHeader } from "@/ui/shell/page-header";
import { FamilyStatementDocument } from "@/components/students/family-statement-document";
import { MasterStatementPrintActions } from "@/components/students/master-statement-print-actions";
import { formatShortDate, partsToIso, todayPartsIst } from "@/platform/helpers/date";
import { appendSessionParam } from "@/platform/navigation/session-href";
import { getFamilyWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/platform/supabase/session";

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
  const todayIso = partsToIso(todayPartsIst());

  return (
    <div className="space-y-6">
      {/*
        The A4 statement is two sheets, so the first one has to break. Same
        mechanism the family receipt reprint uses — `break-after` for modern
        engines, `page-break-after` for the ones that still only understand the
        legacy property — with the last sheet reset so the print job does not
        end on a blank page.

        Scoped inside `@media print`, so nothing here touches the screen.
      */}
      <style>{`
        @media print {
          .statement-page-break {
            break-after: page;
            page-break-after: always;
            margin: 0 !important;
          }

          .statement-print-page:last-of-type {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>

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
        issuedOn={formatShortDate(todayIso)}
        todayIso={todayIso}
      />
    </div>
  );
}
