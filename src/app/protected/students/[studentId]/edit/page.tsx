import { notFound } from "next/navigation";

import { isUuid } from "@/platform/helpers/uuid";
import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { Section } from "@/ui/primitives/section";
import { StudentForm } from "@/modules/students/ui/student-form";
import { Notice } from "@/ui/primitives/notice";
import {
  StudentRepaymentPlanSection,
  type RepaymentScopeOption,
} from "@/modules/students/ui/student-repayment-plan-section";
import { isRepaymentPlanCreationEnabled } from "@/platform/env";
import { appendSessionParam } from "@/platform/navigation/session-href";
import {
  getActiveRepaymentPlan,
  previewRepaymentPlan,
} from "@/modules/repayment-plans/data/queries";
import { REPAYMENT_PLAN_SCOPES } from "@/modules/repayment-plans/domain/types";
import { getStudentDetail, getStudentFormOptions } from "@/modules/students/data/queries";
import { getWorkbookInstallmentBalances } from "@/modules/fees/data/queries";
import { getDisplayInstallmentLabel } from "@/modules/prev-year-dues/domain/display";
import { WaiveLateFeeTrigger } from "@/modules/payments/ui/waive-late-fee-trigger";
import { Money } from "@/ui/primitives/money";
import { toStudentInfoFormValues } from "@/modules/students/domain/info-fields";
import {
  hasStaffPermission,
  requireAnyStaffPermission,
} from "@/platform/supabase/session";

import { updateStudentAction } from "../../actions";
import { safeReturnTo } from "@/platform/navigation/return-to";

const REPAYMENT_SCOPES = REPAYMENT_PLAN_SCOPES;

/**
 * Price every scope server-side so the admin sees real balances before typing
 * anything, and so the number they agree to is the number sent back as
 * `expectedOpeningBalance`. If dues move in between, the RPC refuses rather
 * than silently building the plan on a different figure.
 */
async function loadRepaymentPlanSection(studentId: string, sessionLabel: string) {
  const [activePlan, ...previews] = await Promise.all([
    getActiveRepaymentPlan(studentId),
    ...REPAYMENT_SCOPES.map((scope) =>
      previewRepaymentPlan({
        studentId,
        sessionLabel,
        scope,
        monthlyAmount: null,
        firstDueDate: null,
      }),
    ),
  ]);

  // A failed preview is NOT "this student has nothing to convert" — that
  // reading turned a broken read into a confident, wrong statement about every
  // student in the school. Keep the failures and let the section say so.
  const loadErrors = previews.flatMap((result) => (result.ok ? [] : [result.message]));

  const scopeOptions = previews.flatMap<RepaymentScopeOption>((result, index) => {
    if (!result.ok) {
      return [];
    }

    return [
      {
        scope: REPAYMENT_SCOPES[index],
        openingBalance: result.preview.openingBalance,
        oldBalanceIncluded: result.preview.oldBalanceIncluded,
        currentYearIncluded: result.preview.currentYearIncluded,
        lateFeeWaived: result.preview.lateFeeWaived,
        installmentCount: result.preview.installmentCount,
      },
    ];
  });

  return { activePlan, scopeOptions, loadErrors };
}

type EditStudentPageProps = {
  params: Promise<{
    studentId: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export default async function EditStudentPage({ params, searchParams }: EditStudentPageProps) {
  const staff = await requireAnyStaffPermission(
    ["students:write", "students:edit_basic"],
    { onDenied: "redirect" },
  );
  const canEditAdmissionNo = hasStaffPermission(staff, "students:edit_sr_no");
  const canEditFinance = hasStaffPermission(staff, "students:write");
  const resolvedParams = await params;

  // Guard before the first query: a non-UUID segment makes Postgres raise
  // `invalid input syntax for type uuid`, which is an unhandled 500, not a
  // not-found. Checking the result afterwards is too late.
  if (!isUuid(resolvedParams.studentId)) {
    notFound();
  }
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo, "/protected/students");
  const student = await getStudentDetail(resolvedParams.studentId);

  if (!student) {
    notFound();
  }

  const {
    classOptions,
    routeOptions,
    conventionalDiscountPolicies,
    resolvedSessionLabel,
  } = await getStudentFormOptions({ sessionLabel: student.classSessionLabel });
  const hasSessionMismatch =
    student.classSessionLabel.trim().toLowerCase() !== resolvedSessionLabel.trim().toLowerCase();
  const sessionAwareReturnTo = appendSessionParam(returnTo, resolvedSessionLabel);

  // EMI plans are admin-only and deliberately live OUTSIDE the student-master
  // form: converting dues to a repayment calendar and forgiving late fees is
  // not a record correction, and must not ride along on a name change.
  const canManageRepaymentPlans = hasStaffPermission(staff, "fees:repayment_plan");
  const canWaiveLateFee = hasStaffPermission(staff, "payments:waive_late_fee");
  // Admin-only and strictly larger than waiving a debt: this gives money back.
  const canWaiveCollectedLateFee = hasStaffPermission(staff, "fees:write");

  // Late fees live OUTSIDE the student-master form for the same reason EMI plans
  // do (see the note above): forgiving money is not a record correction and must
  // not ride along on a name change. src/modules/students/README.md states the
  // rule as "never let a student edit rewrite posted money".
  const [repaymentPlan, installmentBalances] = await Promise.all([
    canManageRepaymentPlans
      ? loadRepaymentPlanSection(student.id, resolvedSessionLabel)
      : Promise.resolve(null),
    canWaiveLateFee
      ? getWorkbookInstallmentBalances(student.id)
      : Promise.resolve([]),
  ]);

  const lateFeeWaivedTotal = installmentBalances.reduce(
    (sum, row) => sum + row.waiverApplied,
    0,
  );
  const waivableInstallments = installmentBalances
    .map((item) => ({
      installmentId: item.installmentId,
      label: getDisplayInstallmentLabel(item),
      remainingLateFee: item.lateFeePending,
      collectedLateFee: canWaiveCollectedLateFee
        ? Math.max(item.finalLateFee - item.lateFeePending, 0)
        : 0,
    }))
    .filter((item) => item.remainingLateFee > 0 || item.collectedLateFee > 0);
  const waivableTotal = waivableInstallments.reduce(
    (sum, item) => sum + item.remainingLateFee + item.collectedLateFee,
    0,
  );

  const lateFeeSlot =
    canWaiveLateFee && waivableInstallments.length > 0 ? (
      <Section
        id="late-fee"
        title="Late fee"
        description="Charged automatically the day an installment passes its due date. Forgiving one writes a waiver against that installment with your reason — it never edits a posted payment or receipt, and it is not part of Update student. Dues, the dashboard and the next receipt follow at once."
      >
        <div className="space-y-4">
          {/* Three across even on a phone: the values are short, and stacking
              them pushed the Waive button most of a screen further down. */}
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Still owed
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                <Money
                  value={waivableInstallments.reduce((sum, item) => sum + item.remainingLateFee, 0)}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Already collected
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                <Money
                  value={waivableInstallments.reduce((sum, item) => sum + item.collectedLateFee, 0)}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Waived so far
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                <Money value={lateFeeWaivedTotal} />
              </dd>
            </div>
          </dl>

          {canWaiveCollectedLateFee ? (
            <Notice tone="info" title="You can forgive a late fee that was already paid">
              Admins only. It gives the money back rather than cancelling a debt: the
              installment charges less, what the family already paid settles the next
              installments, and anything left over stays as credit. Nothing is written to a
              payment or a receipt.
            </Notice>
          ) : null}

          <WaiveLateFeeTrigger
            studentId={student.id}
            studentLabel={student.fullName}
            studentAdmissionNo={student.admissionNo}
            classLabel={student.classLabel}
            currentWaiverAmount={lateFeeWaivedTotal}
            pendingLateFeeAmount={waivableTotal}
            sessionLabel={resolvedSessionLabel}
            waivableInstallments={waivableInstallments}
            canWaiveCollected={canWaiveCollectedLateFee}
            size="default"
          />
        </div>
      </Section>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Edit student"
        description={`Update student details and fee exceptions for ${student.fullName} (SR no ${student.admissionNo}).`}
        actions={
          <Link className="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={sessionAwareReturnTo}>
            Back to Students
          </Link>
        }
      />

        {/* The form owns its own Sections now, so the outer SectionCard is
            gone — it made every group a card inside a card inside a
            card-shaped disclosure. */}
        {hasSessionMismatch ? (
          <Notice tone="warning" title="This student is in a different academic year">
            {student.classSessionLabel || "Another academic year"} holds this record, but Fee Setup
            is active for {resolvedSessionLabel}. Choose an active {resolvedSessionLabel} class
            before dues can be prepared.
          </Notice>
        ) : null}
        <StudentForm
          mode="edit"
          studentId={student.id}
          canEditAdmissionNo={canEditAdmissionNo}
          canEditFinance={canEditFinance}
          classOptions={classOptions}
          routeOptions={routeOptions}
          sessionLabel={resolvedSessionLabel}
          conventionalDiscountPolicies={conventionalDiscountPolicies}
          initialValues={{
            ...toStudentInfoFormValues(student),
            fullName: student.fullName,
            classId: student.classId,
            admissionNo: student.admissionNo,
            dateOfBirth: student.dateOfBirth ?? "",
            fatherName: student.fatherName ?? "",
            motherName: student.motherName ?? "",
            fatherPhone: student.fatherPhone ?? "",
            motherPhone: student.motherPhone ?? "",
            address: student.address ?? "",
            transportRouteId: student.transportRouteId ?? "",
            status: student.status,
            studentTypeOverride: student.studentTypeOverride ?? "existing",
            tuitionOverride: student.tuitionOverride?.toString() ?? "",
            transportOverride: student.transportOverride?.toString() ?? "",
            discountAmount: student.discountAmount.toString(),
            otherAdjustmentHead: student.otherAdjustmentHead ?? "",
            otherAdjustmentAmount: student.otherAdjustmentAmount?.toString() ?? "",
            feeProfileReason: student.overrideReason ?? "Student fee profile",
            feeProfileNotes: student.overrideNotes ?? "",
            conventionalPolicyIds: student.conventionalDiscountPolicyIds,
            conventionalDiscountReason: student.conventionalDiscountReason ?? "",
            conventionalDiscountNotes: student.conventionalDiscountNotes ?? "",
            conventionalDiscountFamilyGroup: student.conventionalDiscountFamilyGroupLabel ?? "",
            conventionalDiscountManualOverrideReason:
              student.conventionalDiscountManualOverrideReason ?? "",
            notes: student.notes ?? "",
            photoPath: student.photoPath ?? "",
          }}
          returnTo={sessionAwareReturnTo}
          lateFeeSlot={lateFeeSlot}
          action={updateStudentAction.bind(null, student.id)}
        />

      {repaymentPlan ? (
        <SectionCard
          id="repayment-plan"
          title="Convert dues to monthly EMI"
          description="Admin only. Spreads what this family owes over interest-free monthly instalments. The covered installments stop accruing their own late fees; from then on the EMI calendar carries the only penalty — a flat Rs 1,000 for each monthly instalment that passes unpaid, which an admin can waive. Nothing in the ledger is rewritten."
        >
          <StudentRepaymentPlanSection
            studentId={student.id}
            sessionLabel={resolvedSessionLabel}
            scopeOptions={repaymentPlan.scopeOptions}
            loadErrors={repaymentPlan.loadErrors}
            activePlan={repaymentPlan.activePlan}
            creationEnabled={isRepaymentPlanCreationEnabled()}
            clientRequestId={crypto.randomUUID()}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
