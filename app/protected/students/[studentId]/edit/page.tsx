import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentForm } from "@/components/students/student-form";
import { getStudentDetail, getStudentFormOptions } from "@/lib/students/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import { updateStudentAction } from "../../actions";

type EditStudentPageProps = {
  params: Promise<{
    studentId: string;
  }>;
};

export default async function EditStudentPage({ params }: EditStudentPageProps) {
  await requireStaffPermission("students:write", { onDenied: "redirect" });
  const resolvedParams = await params;
  const student = await getStudentDetail(resolvedParams.studentId);

  if (!student) {
    notFound();
  }

  const { classOptions, routeOptions } = await getStudentFormOptions({
    sessionLabel: student.classSessionLabel,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Edit student"
        description={`Update student details and fee exceptions for ${student.fullName} (SR no ${student.admissionNo}).`}
      />

      <SectionCard
        title="Student details"
        description="Keep record corrections and fee-profile changes clear and traceable."
      >
        <StudentForm
          mode="edit"
          classOptions={classOptions}
          routeOptions={routeOptions}
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
            lateFeeWaiverAmount: student.lateFeeWaiverAmount.toString(),
            otherAdjustmentHead: student.otherAdjustmentHead ?? "",
            otherAdjustmentAmount: student.otherAdjustmentAmount?.toString() ?? "",
            feeProfileReason: student.overrideReason ?? "Student fee profile",
            feeProfileNotes: student.overrideNotes ?? "",
            notes: student.notes ?? "",
          }}
          action={updateStudentAction.bind(null, student.id)}
        />
      </SectionCard>
    </div>
  );
}
