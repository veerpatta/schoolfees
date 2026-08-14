import { MasterStatementMobile } from "@/components/students/statement/master-statement-mobile";
import { StudentStatementPaper } from "@/components/students/statement/student-statement-paper";
import {
  buildStatementReceiptRows,
  buildStatementStudentView,
} from "@/lib/students/statement-view-model";
import type { getStudentWorkspaceData } from "@/lib/students/workspace";
import type { RepaymentPlanDetail, RepaymentPlanSummary } from "@/lib/repayment-plans/types";

type StudentWorkspace = Awaited<ReturnType<typeof getStudentWorkspaceData>>;

/**
 * The master fee statement, in its two forms.
 *
 * A phone and an A4 sheet are not the same document, and trying to make one
 * layout serve both is what left a six-column table running off the edge at
 * 375px. So there are two renderings behind one switch:
 *
 * - **Phone** (`md:hidden print:hidden`) — stacked cards, unchanged from before
 *   the redesign. See `./statement/master-statement-mobile.tsx`.
 * - **Desktop and paper** (`hidden md:block print:block`) — the A4 document.
 *   See `./statement/student-statement-paper.tsx`.
 *
 * This is the single door to the paper document: nothing else may reach into
 * `./statement/` past the print variant, or the A4 layout would start leaking
 * onto phones. `tests/ui/statement-mobile-overflow.test.ts` holds that line.
 */
export function MasterStatementDocument({
  student,
  financialSnapshot,
  installmentBalances,
  receipts = [],
  repaymentPlan = null,
  repaymentPlanHistory = [],
  issuedOn,
  todayIso,
}: Pick<StudentWorkspace, "student" | "financialSnapshot" | "installmentBalances"> &
  Partial<Pick<StudentWorkspace, "receipts">> & {
    /** Active plan with its priced schedule, when the student is on one. */
    repaymentPlan?: RepaymentPlanDetail | null;
    /** Every plan ever agreed, newest first — the audit trail a parent can ask about. */
    repaymentPlanHistory?: RepaymentPlanSummary[];
    /**
     * Today in IST, both as a display string for the letterhead and as an ISO
     * date for the overdue comparison. Passed in rather than read from the clock
     * here, so the rendered document is deterministic under test.
     */
    issuedOn: string;
    todayIso: string;
  }) {
  if (!student || !financialSnapshot) {
    return null;
  }

  return (
    <>
      <div className="md:hidden print:hidden">
        <MasterStatementMobile
          student={student}
          financialSnapshot={financialSnapshot}
          installmentBalances={installmentBalances}
          receipts={receipts}
          repaymentPlan={repaymentPlan}
          repaymentPlanHistory={repaymentPlanHistory}
        />
      </div>

      <div className="hidden md:block print:block">
        <StudentStatementPaperFromWorkspace
          student={student}
          financialSnapshot={financialSnapshot}
          installmentBalances={installmentBalances}
          receipts={receipts}
          repaymentPlan={repaymentPlan}
          repaymentPlanHistory={repaymentPlanHistory}
          issuedOn={issuedOn}
          todayIso={todayIso}
        />
      </div>
    </>
  );
}

function StudentStatementPaperFromWorkspace({
  student,
  financialSnapshot,
  installmentBalances,
  receipts,
  repaymentPlan,
  repaymentPlanHistory,
  issuedOn,
  todayIso,
}: {
  student: NonNullable<StudentWorkspace["student"]>;
  financialSnapshot: NonNullable<StudentWorkspace["financialSnapshot"]>;
  installmentBalances: StudentWorkspace["installmentBalances"];
  receipts: StudentWorkspace["receipts"];
  repaymentPlan: RepaymentPlanDetail | null;
  repaymentPlanHistory: RepaymentPlanSummary[];
  issuedOn: string;
  todayIso: string;
}) {
  const view = buildStatementStudentView({
    student,
    financialSnapshot,
    installmentBalances,
    todayIso,
  });

  return (
    <StudentStatementPaper
      view={view}
      receiptRows={buildStatementReceiptRows(receipts, view.totalCharged)}
      breakdown={financialSnapshot.resolvedBreakdown}
      sessionLabel={financialSnapshot.policy.academicSessionLabel}
      issuedOn={issuedOn}
      overrides={{
        tuitionOverride: student.tuitionOverride,
        transportOverride: student.transportOverride,
        discountAmount: student.discountAmount,
        lateFeeWaiverAmount: student.lateFeeWaiverAmount,
        otherAdjustmentHead: student.otherAdjustmentHead,
        otherAdjustmentAmount: student.otherAdjustmentAmount,
      }}
      repaymentPlan={repaymentPlan}
      repaymentPlanHistory={repaymentPlanHistory}
    />
  );
}
