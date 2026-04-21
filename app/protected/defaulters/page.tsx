import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { formatInr } from "@/lib/helpers/currency";
import { createClient } from "@/lib/supabase/server";

type OutstandingClassRow = {
  session_label: string;
  class_name: string;
  section: string;
  stream_name: string;
  students_with_dues: number;
  open_installments: number;
  outstanding_amount: number;
};

type OutstandingStudentRow = {
  student_id: string;
  full_name: string;
  admission_no: string;
  class_name: string;
  section: string;
  stream_name: string;
  installment_label: string;
  due_date: string;
  outstanding_amount: number;
  balance_status: "partial" | "overdue" | "pending" | "waived" | "paid" | "cancelled";
};

function buildClassLabel(row: { class_name: string; section: string; stream_name: string }) {
  const parts = [row.class_name];

  if (row.section) {
    parts.push(`Section ${row.section}`);
  }

  if (row.stream_name) {
    parts.push(row.stream_name);
  }

  return parts.join(" - ");
}

export default async function DefaultersPage() {
  const supabase = await createClient();

  const [{ data: classSummaryRaw, error: classSummaryError }, { data: studentRowsRaw, error: studentRowsError }] =
    await Promise.all([
      supabase
        .from("v_outstanding_summary")
        .select(
          "session_label, class_name, section, stream_name, students_with_dues, open_installments, outstanding_amount",
        )
        .order("session_label", { ascending: false })
        .order("class_name", { ascending: true }),
      supabase
        .from("v_installment_balances")
        .select(
          "student_id, full_name, admission_no, class_name, section, stream_name, installment_label, due_date, outstanding_amount, balance_status",
        )
        .gt("outstanding_amount", 0)
        .in("balance_status", ["overdue", "pending", "partial"])
        .order("due_date", { ascending: true })
        .limit(120),
    ]);

  if (classSummaryError) {
    throw new Error(`Unable to load class-level outstanding summary: ${classSummaryError.message}`);
  }

  if (studentRowsError) {
    throw new Error(`Unable to load defaulter list: ${studentRowsError.message}`);
  }

  const classSummary = (classSummaryRaw ?? []) as OutstandingClassRow[];
  const studentRows = (studentRowsRaw ?? []) as OutstandingStudentRow[];

  const totalOutstanding = classSummary.reduce(
    (sum, row) => sum + row.outstanding_amount,
    0,
  );
  const totalStudents = classSummary.reduce(
    (sum, row) => sum + row.students_with_dues,
    0,
  );
  const overdueCount = studentRows.filter((row) => row.balance_status === "overdue").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Defaulters"
        title="Outstanding follow-up"
        description="Daily class-level and student-level due tracking using auditable installment balance views."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Outstanding amount" value={formatInr(totalOutstanding)} hint="Across all listed classes" />
        <MetricCard title="Students with dues" value={totalStudents} hint="Class-level follow-up count" />
        <MetricCard title="Overdue installments" value={overdueCount} hint="Needs immediate follow-up" />
      </section>

      <SectionCard
        title="Class-wise outstanding"
        description="Use this table for class-level prioritization and assignment."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Students with dues</th>
                <th className="px-4 py-3">Open installments</th>
                <th className="px-4 py-3">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {classSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No outstanding classes found.
                  </td>
                </tr>
              ) : (
                classSummary.map((row) => (
                  <tr
                    key={`${row.session_label}-${row.class_name}-${row.section}-${row.stream_name}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="px-4 py-3">{row.session_label}</td>
                    <td className="px-4 py-3">{buildClassLabel(row)}</td>
                    <td className="px-4 py-3">{row.students_with_dues}</td>
                    <td className="px-4 py-3">{row.open_installments}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatInr(row.outstanding_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Student follow-up list"
        description="Installment-level follow-up queue ordered by due date."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">SR no</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Installment</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Outstanding</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No student installments are currently due.
                  </td>
                </tr>
              ) : (
                studentRows.map((row) => (
                  <tr
                    key={`${row.student_id}-${row.installment_label}-${row.due_date}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="px-4 py-3">{row.full_name}</td>
                    <td className="px-4 py-3">{row.admission_no}</td>
                    <td className="px-4 py-3">
                      {buildClassLabel({
                        class_name: row.class_name,
                        section: row.section,
                        stream_name: row.stream_name,
                      })}
                    </td>
                    <td className="px-4 py-3">{row.installment_label}</td>
                    <td className="px-4 py-3">{row.due_date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatInr(row.outstanding_amount)}
                    </td>
                    <td className="px-4 py-3 capitalize">{row.balance_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
