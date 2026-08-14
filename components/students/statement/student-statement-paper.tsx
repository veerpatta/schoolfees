import { StatementExplainer } from "@/components/students/statement/statement-explainer";
import { StatementFooter } from "@/components/students/statement/statement-footer";
import { StatementKpiTiles } from "@/components/students/statement/statement-kpi-tiles";
import { StatementLetterhead } from "@/components/students/statement/statement-letterhead";
import { StatementPaper } from "@/components/students/statement/statement-paper";
import { StatementPayeeBlock } from "@/components/students/statement/statement-payee-block";
import { StatementReceiptsTable } from "@/components/students/statement/statement-receipts-table";
import {
  StatementDiscountPolicyPanel,
  StatementOverridesGrid,
  StatementRepaymentPlan,
} from "@/components/students/statement/statement-retained-sections";
import { StudentChargeBlock } from "@/components/students/statement/student-charge-block";
import type { ResolvedFeeBreakdown } from "@/lib/fees/types";
import type { RepaymentPlanDetail, RepaymentPlanSummary } from "@/lib/repayment-plans/types";
import type {
  StatementReceiptRow,
  StatementStudentView,
} from "@/lib/students/statement-view-model";

/** The A4 statement for one student. Desktop and paper only. */
export function StudentStatementPaper({
  view,
  receiptRows,
  breakdown,
  sessionLabel,
  issuedOn,
  overrides,
  repaymentPlan,
  repaymentPlanHistory,
}: {
  view: StatementStudentView;
  receiptRows: StatementReceiptRow[];
  breakdown: ResolvedFeeBreakdown;
  sessionLabel: string;
  issuedOn: string;
  overrides: {
    tuitionOverride: number | null;
    transportOverride: number | null;
    discountAmount: number;
    lateFeeWaiverAmount: number;
    otherAdjustmentHead: string | null;
    otherAdjustmentAmount: number | null;
  };
  repaymentPlan: RepaymentPlanDetail | null;
  repaymentPlanHistory: RepaymentPlanSummary[];
}) {
  const receiptCount = receiptRows.filter((row) => !row.isReversed && !row.isWriteOff).length;
  const overdueCount = view.installmentRows.filter((row) => row.status === "overdue").length;

  return (
    <StatementPaper>
      <StatementLetterhead
        docTitle="Student fee statement"
        sessionLabel={sessionLabel}
        issuedOn={issuedOn}
        identifier={`SR ${view.identifier}`}
        pageLabel="Page 1 of 1"
        isYearClear={view.isYearClear}
      />

      <StatementPayeeBlock
        scopeLabel="Student"
        name={view.name}
        meta={view.meta}
        fatherName={view.fatherName}
        fatherPhone={view.fatherPhone}
        transportRouteLabel={view.transportRouteLabel}
        villageCity={view.villageCity}
      />

      <StatementKpiTiles
        totalCharged={view.totalCharged}
        paidInCash={view.paidInCash}
        writtenOff={view.writtenOff}
        feesPending={view.feesPending}
        lateFeePending={view.lateFeePending}
        stillPayable={view.stillPayable}
        chargedHint={
          view.previousYearBalance > 0
            ? "incl. previous-year balance and any late fee"
            : "incl. any late fee charged"
        }
        paidHint={`${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`}
      />

      <StatementExplainer isFamily={false} />

      <StudentChargeBlock view={view} />

      <StatementDiscountPolicyPanel breakdown={breakdown} />

      <StatementOverridesGrid {...overrides} />

      <StatementRepaymentPlan plan={repaymentPlan} history={repaymentPlanHistory} />

      <StatementReceiptsTable
        title="Receipts on record"
        rows={receiptRows}
        totalReceived={view.paidInCash}
        outstanding={view.stillPayable}
        isYearClear={view.isYearClear}
      />

      <StatementFooter
        stillPayable={view.stillPayable}
        lateFeeFlatAmount={view.lateFeeFlatAmount}
        nextDueLabel={view.nextDueLabel}
        nextDueDate={view.nextDueDate}
        nextDueAmount={view.nextDueAmount}
        identifier={`SR ${view.identifier}`}
        closingNote={
          overdueCount > 0
            ? `${overdueCount} installment${overdueCount === 1 ? " is" : "s are"} already past the due date.`
            : undefined
        }
      />
    </StatementPaper>
  );
}
