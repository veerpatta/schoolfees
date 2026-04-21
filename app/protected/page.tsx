import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { getDashboardPageData } from "@/lib/dashboard/data";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";

export default async function ProtectedPage() {
  const data = await getDashboardPageData();

  const dashboardMetrics = [
    {
      title: "Total students",
      value: data.totalStudents,
      hint: "Active and inactive student records in current office use",
    },
    {
      title: "Total due",
      value: formatInr(data.totalDue),
      hint: "Scheduled installment amount excluding waived rows",
    },
    {
      title: "Total collected",
      value: formatInr(data.totalCollected),
      hint: "Posted receipt amount across all collections",
    },
    {
      title: "Total pending",
      value: formatInr(data.totalPending),
      hint: `${data.studentsWithPending} students still have open dues`,
    },
    {
      title: "Overdue installments",
      value: data.overdueInstallmentCount,
      hint: "Installments past due date and still unpaid",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Daily fee office overview"
        description="Track current due position, recent collections, and class-wise follow-up from one operational dashboard."
        actions={<StatusBadge label="Live snapshot" tone="good" />}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboardMetrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            hint={metric.hint}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Recent payments"
          description="Latest receipt entries posted from the payment desk."
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Receipt no</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No payments posted yet.
                    </td>
                  </tr>
                ) : (
                  data.recentPayments.map((payment) => (
                    <tr
                      key={`${payment.receiptNumber}-${payment.paymentDate}`}
                      className="border-t border-slate-100 text-slate-700"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {payment.receiptNumber}
                      </td>
                      <td className="px-4 py-3">{formatShortDate(payment.paymentDate)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{payment.studentName}</div>
                        <div className="text-xs text-slate-500">{payment.admissionNo}</div>
                      </td>
                      <td className="px-4 py-3">{payment.classLabel}</td>
                      <td className="px-4 py-3">{payment.paymentMode}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatInr(payment.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Due position"
          description="Keep the numbers staff usually ask for in one quick reference."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Collection coverage
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {data.totalDue > 0
                  ? `${Math.round((data.totalCollected / data.totalDue) * 100)}%`
                  : "0%"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Portion of scheduled due already collected through receipts.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Students with dues
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {data.studentsWithPending}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Follow-up pool across pending, partial, and overdue installments.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Pending vs collected
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-600">Collected</p>
                  <p className="text-lg font-semibold text-slate-950">
                    {formatInr(data.totalCollected)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Pending</p>
                  <p className="text-lg font-semibold text-slate-950">
                    {formatInr(data.totalPending)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Class-wise quick summary"
        description="Simple class-level view of student count, pending amount, and overdue installment pressure."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Students with dues</th>
                <th className="px-4 py-3">Overdue installments</th>
                <th className="px-4 py-3">Pending amount</th>
              </tr>
            </thead>
            <tbody>
              {data.classSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No class summary available yet.
                  </td>
                </tr>
              ) : (
                data.classSummary.map((row) => (
                  <tr
                    key={`${row.sessionLabel}-${row.classLabel}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="px-4 py-3">{row.sessionLabel}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.totalStudents}</td>
                    <td className="px-4 py-3">{row.studentsWithPending}</td>
                    <td className="px-4 py-3">{row.overdueInstallments}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatInr(row.pendingAmount)}
                    </td>
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
