import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { getStudentDetail } from "@/lib/students/data";

type StudentDetailPageProps = {
  params: Promise<{
    studentId: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readValue(value: string | null) {
  return value?.trim() || "-";
}

export default async function StudentDetailPage({ params }: StudentDetailPageProps) {
  const resolvedParams = await params;
  const student = await getStudentDetail(resolvedParams.studentId);

  if (!student) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title={student.fullName}
        description={`SR no ${student.admissionNo} • ${student.classLabel}`}
        actions={<StudentStatusBadge status={student.status} />}
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/protected/students/${student.id}/edit`}>Edit student</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/protected/students">Back to list</Link>
        </Button>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Identity" description="Core student and class details.">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Student name</dt>
              <dd>{student.fullName}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">SR no</dt>
              <dd>{student.admissionNo}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Class</dt>
              <dd>{student.classLabel}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">DOB</dt>
              <dd>{formatDate(student.dateOfBirth)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Transport route</dt>
              <dd>{student.transportRouteLabel}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Guardian & contact" description="Parent names and phone numbers.">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Father name</dt>
              <dd>{readValue(student.fatherName)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Mother name</dt>
              <dd>{readValue(student.motherName)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Father phone</dt>
              <dd>{readValue(student.fatherPhone)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Mother phone</dt>
              <dd>{readValue(student.motherPhone)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-slate-500">Address</dt>
              <dd>{readValue(student.address)}</dd>
            </div>
          </dl>
        </SectionCard>
      </section>

      <SectionCard title="Office notes" description="Additional staff notes and audit timestamps.">
        <div className="space-y-3 text-sm text-slate-700">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            {readValue(student.notes)}
          </p>
          <p>
            <span className="font-medium text-slate-500">Created:</span>{" "}
            {formatDateTime(student.createdAt)}
          </p>
          <p>
            <span className="font-medium text-slate-500">Last updated:</span>{" "}
            {formatDateTime(student.updatedAt)}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
