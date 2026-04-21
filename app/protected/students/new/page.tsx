import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentForm } from "@/components/students/student-form";
import { getStudentFormOptions } from "@/lib/students/data";

import { createStudentAction } from "../actions";

export default async function NewStudentPage() {
  const { classOptions, routeOptions } = await getStudentFormOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Add student"
        description="Enter the student master details. Required fields are clearly marked for faster office entry."
      />

      <SectionCard
        title="Student details"
        description="Use clean SR no and contact details to reduce duplicates before future import migration."
      >
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
      </SectionCard>
    </div>
  );
}
