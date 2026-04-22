import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getStudentFinancialSnapshot } from "@/lib/fees/data";
import { getStudentDetail } from "@/lib/students/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

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
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const [student, financialSnapshot] = await Promise.all([
    getStudentDetail(resolvedParams.studentId),
    getStudentFinancialSnapshot(resolvedParams.studentId),
  ]);

  if (!student) {
    notFound();
  }

  const canEditStudent = hasStaffPermission(staff, "students:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title={student.fullName}
        description={`SR no ${student.admissionNo} • ${student.classLabel}`}
        actions={<StudentStatusBadge status={student.status} />}
      />

      <div className="flex flex-wrap gap-2">
        {canEditStudent ? (
          <Button asChild>
            <Link href={`/protected/students/${student.id}/edit`}>Edit student</Link>
          </Button>
        ) : null}
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

      {financialSnapshot ? (
        <SectionCard
          title="Financial view"
          description="Resolved fee policy, current outstanding position, and the next unpaid installment for this student."
        >
          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Active policy
                </p>
                <p className="mt-2 font-medium text-slate-900">
                  {financialSnapshot.policy.academicSessionLabel}
                </p>
                <p className="mt-2">
                  Receipt prefix {financialSnapshot.policy.receiptPrefix}. Late fee {financialSnapshot.policy.lateFeeLabel.toLowerCase()}.
                </p>
                <p className="mt-2">
                  Schedule: {financialSnapshot.policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Current outstanding
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {formatInr(financialSnapshot.currentOutstanding)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Open installments
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {financialSnapshot.openInstallments}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Overdue installments
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {financialSnapshot.overdueInstallments}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Next due
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {financialSnapshot.nextDueLabel ?? "No pending dues"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {financialSnapshot.nextDueDate && financialSnapshot.nextDueAmount !== null
                      ? `${formatShortDate(financialSnapshot.nextDueDate)} • ${formatInr(financialSnapshot.nextDueAmount)}`
                      : "All installments are settled"}
                  </p>
                </div>
              </div>

              {financialSnapshot.activeOverrideReason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Active override reason: {financialSnapshot.activeOverrideReason}
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Resolved fee breakdown</p>
                <p className="text-xs text-slate-500">
                  This uses school policy, class defaults, route defaults, and any active student override.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Fee head</th>
                      <th className="px-4 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...financialSnapshot.resolvedBreakdown.coreHeads,
                      ...financialSnapshot.resolvedBreakdown.customHeads,
                    ].map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                        <td className="px-4 py-3">{item.label}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatInr(item.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                      <td className="px-4 py-3">Resolved annual total</td>
                      <td className="px-4 py-3">
                        {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
