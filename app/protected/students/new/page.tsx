import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { WorkflowGuard } from "@/components/office/office-ui";
import { StudentForm } from "@/components/students/student-form";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import { createStudentAction } from "../actions";

export default async function NewStudentPage() {
  const staff = await requireStaffPermission("students:write", { onDenied: "redirect" });
  const [{ classOptions, routeOptions }, setup] = await Promise.all([
    getStudentFormOptions(),
    getSetupWizardData(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Add student"
        description="Enter the student master details. Required fields are clearly marked for faster office entry."
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
        description="Use clean SR no and contact details to reduce duplicates before future import migration."
      >
        {readiness.addStudent.isReady ? (
          <StudentForm
            mode="add"
            classOptions={classOptions}
            routeOptions={routeOptions}
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
