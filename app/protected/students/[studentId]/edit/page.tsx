import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentForm } from "@/components/students/student-form";
import { getStudentDetail, getStudentFormOptions } from "@/lib/students/data";

import { updateStudentAction } from "../../actions";

type EditStudentPageProps = {
  params: Promise<{
    studentId: string;
  }>;
};

export default async function EditStudentPage({ params }: EditStudentPageProps) {
  const resolvedParams = await params;
  const [{ classOptions, routeOptions }, student] = await Promise.all([
    getStudentFormOptions(),
    getStudentDetail(resolvedParams.studentId),
  ]);

  if (!student) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Edit student"
        description={`Update record for ${student.fullName} (SR no ${student.admissionNo}).`}
      />

      <SectionCard
        title="Student details"
        description="Keep corrections clear and traceable for office and audit review."
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
            notes: student.notes ?? "",
          }}
          action={updateStudentAction.bind(null, student.id)}
        />
      </SectionCard>
    </div>
  );
}
