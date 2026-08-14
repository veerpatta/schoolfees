import { notFound } from "next/navigation";

import { isUuid } from "@/lib/helpers/uuid";

import { PageHeader } from "@/components/admin/page-header";
import { MasterStatementDocument } from "@/components/students/master-statement-document";
import { MasterStatementPrintActions } from "@/components/students/master-statement-print-actions";
import { formatShortDate, partsToIso, todayPartsIst } from "@/lib/helpers/date";
import {
  getRepaymentPlanDetail,
  getRepaymentPlanHistory,
} from "@/lib/repayment-plans/data";
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

  // Guard before the first query: a non-UUID segment makes Postgres raise
  // `invalid input syntax for type uuid`, which is an unhandled 500, not a
  // not-found. Checking the result afterwards is too late.
  if (!isUuid(resolvedParams.studentId)) {
    notFound();
  }
  // One clock read for the whole page: the plan query, the letterhead's issue
  // date and the overdue comparison all have to agree.
  const todayIso = partsToIso(todayPartsIst());

  const [workspace, repaymentPlan, repaymentPlanHistory] = await Promise.all([
    getStudentWorkspaceData(resolvedParams.studentId),
    getRepaymentPlanDetail({
      studentId: resolvedParams.studentId,
      today: todayIso,
    }).catch(() => null),
    getRepaymentPlanHistory(resolvedParams.studentId).catch(() => []),
  ]);

  if (!workspace.student || !workspace.financialSnapshot) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title={`Statement: ${workspace.student.fullName}`}
        description="Printable master fee statement: fee breakup, installment-wise dues, and every payment received."
        actions={<MasterStatementPrintActions backHref={`/protected/students/${workspace.student.id}`} />}
        className="no-print"
      />

      <MasterStatementDocument
        student={workspace.student}
        financialSnapshot={workspace.financialSnapshot}
        installmentBalances={workspace.installmentBalances}
        receipts={workspace.receipts}
        repaymentPlan={repaymentPlan}
        repaymentPlanHistory={repaymentPlanHistory}
        issuedOn={formatShortDate(todayIso)}
        todayIso={todayIso}
      />
    </div>
  );
}
