import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { WorkflowGuard } from "@/components/office/office-ui";
import { StudentForm } from "@/components/students/student-form";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import { createStudentAction } from "../actions";

type NewStudentPageProps = {
  searchParams?: Promise<{
    sessionLabel?: string;
  }>;
};

export default async function NewStudentPage({ searchParams }: NewStudentPageProps) {
  const staff = await requireStaffPermission("students:write", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedSessionLabel = resolvedSearchParams?.sessionLabel?.trim() ?? null;
  const [{ classOptions, routeOptions, conventionalDiscountPolicies }, setup] = await Promise.all([
    getStudentFormOptions({ sessionLabel: requestedSessionLabel }),
    getSetupWizardData(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Add student"
        description="Enter the student details needed for the school register."
      />

      {!readiness.addStudent.isReady ? (
        <WorkflowGuard
          title={readiness.addStudent.title}
          detail={readiness.addStudent.detail}
          actionLabel={readiness.addStudent.actionLabel}
          actionHref={readiness.addStudent.actionHref}
        />
      ) : null}

      <SectionCard
        title="Student details"
        description="Add the main student details first. Fee exceptions and extra parent details are optional."
      >
        {readiness.addStudent.isReady ? (
          <StudentForm
            mode="add"
            classOptions={classOptions}
            routeOptions={routeOptions}
            conventionalDiscountPolicies={conventionalDiscountPolicies}
            initialValues={{
              fullName: "",
              classId: "",
              admissionNo: "",
              dateOfBirth: "",
              fatherName: "",
              motherName: "",
              fatherPhone: "",
              motherPhone: "",
              address: "",
              transportRouteId: "",
              status: "active",
              studentTypeOverride: "existing",
              tuitionOverride: "",
              transportOverride: "",
              discountAmount: "0",
              lateFeeWaiverAmount: "0",
              otherAdjustmentHead: "",
              otherAdjustmentAmount: "",
              feeProfileReason: "Student fee profile",
              feeProfileNotes: "",
              conventionalPolicyIds: [],
              conventionalDiscountReason: "",
              conventionalDiscountNotes: "",
              conventionalDiscountFamilyGroup: "",
              conventionalDiscountManualOverrideReason: "",
              notes: "",
            }}
            action={createStudentAction}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Student entry will open here as soon as the active session classes are ready.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
