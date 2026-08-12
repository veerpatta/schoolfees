import { notFound } from "next/navigation";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentForm } from "@/components/students/student-form";
import {
  StudentRepaymentPlanSection,
  type RepaymentScopeOption,
} from "@/components/students/student-repayment-plan-section";
import { isRepaymentPlanCreationEnabled } from "@/lib/env";
import { appendSessionParam } from "@/lib/navigation/session-href";
import {
  getActiveRepaymentPlan,
  previewRepaymentPlan,
} from "@/lib/repayment-plans/data";
import { REPAYMENT_PLAN_SCOPES } from "@/lib/repayment-plans/types";
import { getStudentDetail, getStudentFormOptions } from "@/lib/students/data";
import {
  hasStaffPermission,
  requireAnyStaffPermission,
} from "@/lib/supabase/session";

import { updateStudentAction } from "../../actions";

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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/students")
    ? resolvedSearchParams.returnTo
    : "/protected/students";
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
  const repaymentPlan = canManageRepaymentPlans
    ? await loadRepaymentPlanSection(student.id, resolvedSessionLabel)
    : null;

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

      <SectionCard
        title="Student details"
        description="Keep record corrections and fee exceptions clear."
      >
        {hasSessionMismatch ? (
          <div className="mb-4 rounded-lg border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
            This student is currently in {student.classSessionLabel || "another academic year"}, but Fee Setup is active for {resolvedSessionLabel}. Choose an active {resolvedSessionLabel} class before dues can be prepared.
          </div>
        ) : null}
        <StudentForm
          mode="edit"
          canEditAdmissionNo={canEditAdmissionNo}
          canEditFinance={canEditFinance}
          classOptions={classOptions}
          routeOptions={routeOptions}
          sessionLabel={resolvedSessionLabel}
          conventionalDiscountPolicies={conventionalDiscountPolicies}
          initialValues={{
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
          action={updateStudentAction.bind(null, student.id)}
        />
      </SectionCard>

      {repaymentPlan ? (
        <SectionCard
          id="repayment-plan"
          title="Convert dues to monthly EMI"
          description="Admin only. Spreads what this family owes over interest-free monthly instalments and permanently waives the late fees on the covered installments. Nothing in the ledger is rewritten."
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
