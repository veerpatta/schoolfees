import { schoolProfile } from "@/lib/config/school";
import { buildFeeBreakupDisplayRows } from "@/lib/fees/display-breakdown";
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

  const feeHeads = buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown);
  const totalDue = installmentBalances.reduce((sum, item) => sum + item.totalCharge, 0);
  const totalPaid = installmentBalances.reduce((sum, item) => sum + item.paidAmount, 0);

  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border border-border-strong bg-card p-6 text-foreground shadow-sm print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none">
      <header className="border-b border-border-strong pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold uppercase tracking-wide">{schoolProfile.name}</p>
            <p className="text-sm text-muted-foreground">Master fee statement</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Academic session {financialSnapshot.policy.academicSessionLabel}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-foreground">{student.fullName}</p>
            <p className="text-muted-foreground">SR no {student.admissionNo}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 border-b border-border-strong py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Class</p>
          <p className="font-medium">{student.classLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Student status</p>
          <p className="font-medium">{student.studentStatusLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Transport route</p>
          <p className="font-medium">{student.transportRouteLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father</p>
          <p className="font-medium">{student.fatherName || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father phone</p>
          <p className="font-medium">{student.fatherPhone || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother phone</p>
          <p className="font-medium">{student.motherPhone || "-"}</p>
        </div>
      </section>

      <section className="grid gap-4 border-b border-border-strong py-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Fee breakup</p>
          <div className="overflow-hidden rounded-md border border-border-strong">
            <table className="w-full border-collapse text-left text-sm">
              <tbody>
                {feeHeads.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.kind === "discount"
                        ? "border-t border-accent/20 bg-accent-soft/30 text-accent-soft-foreground text-xs"
                        : "border-t border-border first:border-t-0"
                    }
                  >
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong bg-surface-2">
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
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total due</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(totalDue)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total paid</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(totalPaid)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(financialSnapshot.currentOutstanding)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Open installments</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.openInstallments}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overdue installments</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.overdueInstallments}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Next due</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.nextDueLabel ?? "No pending dues"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {financialSnapshot.nextDueDate ? `${formatShortDate(financialSnapshot.nextDueDate)} | ${formatInr(financialSnapshot.nextDueAmount ?? 0)}` : "-"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Override reason</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.activeOverrideReason || "-"}</p>
          </div>
        </div>
      </section>

      <section className="py-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Installment-wise dues</p>
        <div className="overflow-hidden rounded-md border border-border-strong">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                <tr key={item.installmentId} className="border-t border-border">
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

      <section className="border-t border-border-strong pt-4 text-sm space-y-3">
        {financialSnapshot.resolvedBreakdown.conventionalDiscountApplied > 0 && (
          <div className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3 text-xs space-y-2 no-print">
            <p className="font-semibold text-accent-soft-foreground uppercase tracking-wider text-[10px]">Active Conventional Discount Policy</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <span className="text-muted-foreground">Policy:</span>{" "}
                <span className="font-semibold text-foreground">
                  {financialSnapshot.resolvedBreakdown.conventionalDiscountLabels.join(", ")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Baseline Tuition:</span>{" "}
                <span className="font-medium text-muted-foreground line-through">
                  {formatInr(financialSnapshot.resolvedBreakdown.tuitionBeforeConventionalDiscount)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Applied Tuition:</span>{" "}
                <span className="font-bold text-foreground">
                  {formatInr(
                    financialSnapshot.resolvedBreakdown.tuitionBeforeConventionalDiscount -
                      financialSnapshot.resolvedBreakdown.conventionalDiscountApplied
                  )}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Savings:</span>{" "}
                <span className="font-bold text-success">
                  {formatInr(financialSnapshot.resolvedBreakdown.conventionalDiscountApplied)} saved
                </span>
              </div>
            </div>
          </div>
        )}

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
