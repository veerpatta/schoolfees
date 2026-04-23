import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { getStudentWorkspaceData } from "@/lib/students/workspace";

type StudentWorkspace = Awaited<ReturnType<typeof getStudentWorkspaceData>>;

export function MasterStatementDocument({
  student,
  financialSnapshot,
  installmentBalances,
}: Pick<StudentWorkspace, "student" | "financialSnapshot" | "installmentBalances">) {
  if (!student || !financialSnapshot) {
    return null;
  }

  const feeHeads = [
    ...financialSnapshot.resolvedBreakdown.coreHeads,
    ...financialSnapshot.resolvedBreakdown.customHeads,
  ];
  const totalDue = installmentBalances.reduce((sum, item) => sum + item.totalCharge, 0);
  const totalPaid = installmentBalances.reduce((sum, item) => sum + item.paidAmount, 0);

  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-slate-400 print:p-0 print:shadow-none">
      <header className="border-b border-slate-300 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold uppercase tracking-wide">{schoolProfile.name}</p>
            <p className="text-sm text-slate-600">Master fee statement</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              Academic session {financialSnapshot.policy.academicSessionLabel}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-slate-950">{student.fullName}</p>
            <p className="text-slate-600">SR no {student.admissionNo}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 border-b border-slate-300 py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Class</p>
          <p className="font-medium">{student.classLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Student status</p>
          <p className="font-medium">{student.studentStatusLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Transport route</p>
          <p className="font-medium">{student.transportRouteLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Father</p>
          <p className="font-medium">{student.fatherName || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Father phone</p>
          <p className="font-medium">{student.fatherPhone || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Mother phone</p>
          <p className="font-medium">{student.motherPhone || "-"}</p>
        </div>
      </section>

      <section className="grid gap-4 border-b border-slate-300 py-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Fee breakup</p>
          <div className="overflow-hidden rounded-md border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <tbody>
                {feeHeads.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 first:border-t-0">
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 bg-slate-50">
                  <td className="px-3 py-2 font-semibold">Resolved annual total</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total due</p>
            <p className="mt-1 font-semibold text-slate-950">{formatInr(totalDue)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total paid</p>
            <p className="mt-1 font-semibold text-slate-950">{formatInr(totalPaid)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Outstanding</p>
            <p className="mt-1 font-semibold text-slate-950">{formatInr(financialSnapshot.currentOutstanding)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Open installments</p>
            <p className="mt-1 font-semibold text-slate-950">{financialSnapshot.openInstallments}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Overdue installments</p>
            <p className="mt-1 font-semibold text-slate-950">{financialSnapshot.overdueInstallments}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Next due</p>
            <p className="mt-1 font-semibold text-slate-950">{financialSnapshot.nextDueLabel ?? "No pending dues"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {financialSnapshot.nextDueDate ? `${formatShortDate(financialSnapshot.nextDueDate)} | ${formatInr(financialSnapshot.nextDueAmount ?? 0)}` : "-"}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Override reason</p>
            <p className="mt-1 font-semibold text-slate-950">{financialSnapshot.activeOverrideReason || "-"}</p>
          </div>
        </div>
      </section>

      <section className="py-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Installment-wise dues</p>
        <div className="overflow-hidden rounded-md border border-slate-300">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Installment</th>
                <th className="px-3 py-2">Due date</th>
                <th className="px-3 py-2">Base due</th>
                <th className="px-3 py-2">Late fee</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {installmentBalances.map((item) => (
                <tr key={item.installmentId} className="border-t border-slate-200">
                  <td className="px-3 py-2">{item.installmentLabel}</td>
                  <td className="px-3 py-2">{formatShortDate(item.dueDate)}</td>
                  <td className="px-3 py-2">{formatInr(item.baseCharge)}</td>
                  <td className="px-3 py-2">{formatInr(item.finalLateFee)}</td>
                  <td className="px-3 py-2">{formatInr(item.paidAmount)}</td>
                  <td className="px-3 py-2 font-medium">{formatInr(item.pendingAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-slate-300 pt-4 text-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <span className="font-semibold">Tuition override:</span>{" "}
            {student.tuitionOverride !== null ? formatInr(student.tuitionOverride) : "Class default"}
          </div>
          <div>
            <span className="font-semibold">Transport override:</span>{" "}
            {student.transportOverride !== null ? formatInr(student.transportOverride) : "Route default"}
          </div>
          <div>
            <span className="font-semibold">Discount:</span> {formatInr(student.discountAmount)}
          </div>
          <div>
            <span className="font-semibold">Late fee waiver:</span> {formatInr(student.lateFeeWaiverAmount)}
          </div>
        </div>
        <p className="mt-3">
          <span className="font-semibold">Other fee / adjustment:</span>{" "}
          {student.otherAdjustmentHead ? `${student.otherAdjustmentHead} | ` : ""}
          {formatInr(student.otherAdjustmentAmount ?? 0)}
        </p>
      </section>
    </article>
  );
}
