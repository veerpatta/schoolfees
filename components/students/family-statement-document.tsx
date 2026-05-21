import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { getFamilyWorkspaceData } from "@/lib/students/workspace";

type FamilyWorkspace = Awaited<ReturnType<typeof getFamilyWorkspaceData>>;

type FamilyStatementDocumentProps = {
  familyGroup: FamilyWorkspace["familyGroup"];
  students: FamilyWorkspace["students"];
};

export function FamilyStatementDocument({
  familyGroup,
  students,
}: FamilyStatementDocumentProps) {
  if (!students || students.length === 0) {
    return null;
  }

  // Get primary guardian/family details from the first student record
  const primaryStudent = students[0].student;
  const fatherName = primaryStudent.fatherName || "-";
  const fatherPhone = primaryStudent.fatherPhone || "-";
  const motherName = primaryStudent.motherName || "-";
  const motherPhone = primaryStudent.motherPhone || "-";
  const address = primaryStudent.address || "-";
  const sessionLabel = familyGroup.academic_session_label;

  // Calculate family totals
  const totalDue = students.reduce((sum, s) => {
    return sum + s.installmentBalances.reduce((subSum, item) => subSum + item.totalCharge, 0);
  }, 0);

  const totalPaid = students.reduce((sum, s) => {
    return sum + s.installmentBalances.reduce((subSum, item) => subSum + item.paidAmount, 0);
  }, 0);

  const totalOutstanding = students.reduce((sum, s) => {
    return sum + (s.financialSnapshot?.currentOutstanding ?? 0);
  }, 0);

  // Group installment-wise dues across all siblings
  const installmentAggregatesMap = new Map<
    string,
    {
      label: string;
      dueDate: string;
      baseCharge: number;
      finalLateFee: number;
      paidAmount: number;
      pendingAmount: number;
    }
  >();

  students.forEach(({ installmentBalances }) => {
    installmentBalances.forEach((item) => {
      const key = item.installmentLabel;
      const existing = installmentAggregatesMap.get(key);
      if (existing) {
        existing.baseCharge += item.baseCharge;
        existing.finalLateFee += item.finalLateFee;
        existing.paidAmount += item.paidAmount;
        existing.pendingAmount += item.pendingAmount;
      } else {
        installmentAggregatesMap.set(key, {
          label: item.installmentLabel,
          dueDate: item.dueDate,
          baseCharge: item.baseCharge,
          finalLateFee: item.finalLateFee,
          paidAmount: item.paidAmount,
          pendingAmount: item.pendingAmount,
        });
      }
    });
  });

  const aggregatedInstallments = Array.from(installmentAggregatesMap.values()).sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border border-border-strong bg-card p-6 text-foreground shadow-sm print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none space-y-6">
      {/* Header */}
      <header className="border-b border-border-strong pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold uppercase tracking-wide">{schoolProfile.name}</p>
            <h1 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Consolidated Sibling Fee Statement</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Academic session {sessionLabel}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-foreground">Family ID: {familyGroup.name}</p>
            <p className="text-muted-foreground">{students.length} linked children</p>
          </div>
        </div>
      </header>

      {/* Guardian Details */}
      <section className="grid gap-3 border-b border-border-strong py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father / Guardian</p>
          <p className="font-medium">{fatherName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother</p>
          <p className="font-medium">{motherName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Address</p>
          <p className="font-medium truncate" title={address}>{address}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father Phone</p>
          <p className="font-medium">{fatherPhone}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother Phone</p>
          <p className="font-medium">{motherPhone}</p>
        </div>
      </section>

      {/* Sibling Summary Chips */}
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Siblings</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {students.map(({ student, financialSnapshot }) => (
            <div key={student.id} className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
              <p className="font-bold text-foreground truncate">{student.fullName}</p>
              <p className="text-muted-foreground">SR no {student.admissionNo} • {student.classLabel}</p>
              <div className="mt-2 flex justify-between font-semibold border-t border-border pt-1">
                <span>Dues:</span>
                <span className={financialSnapshot && financialSnapshot.currentOutstanding > 0 ? "text-review" : "text-success"}>
                  {formatInr(financialSnapshot?.currentOutstanding ?? 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Consolidated Aggregates Box */}
      <section className="grid gap-3 sm:grid-cols-3 border-y border-border-strong py-4 bg-surface-1/50 px-2 rounded-md">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Family Due</p>
          <p className="mt-1 text-lg font-bold text-foreground">{formatInr(totalDue)}</p>
        </div>
        <div className="text-center border-x border-border">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Family Paid</p>
          <p className="mt-1 text-lg font-bold text-success">{formatInr(totalPaid)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Consolidated Outstanding</p>
          <p className="mt-1 text-lg font-extrabold text-review">{formatInr(totalOutstanding)}</p>
        </div>
      </section>

      {/* Installment Dues Table */}
      <section className="py-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Consolidated Installment-wise Dues</h2>
        <div className="overflow-hidden rounded-md border border-border-strong">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Installment</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2">Base Charge</th>
                <th className="px-3 py-2">Late Fee</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedInstallments.map((item) => (
                <tr key={item.label} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{item.label}</td>
                  <td className="px-3 py-2">{formatShortDate(item.dueDate)}</td>
                  <td className="px-3 py-2">{formatInr(item.baseCharge)}</td>
                  <td className="px-3 py-2">{formatInr(item.finalLateFee)}</td>
                  <td className="px-3 py-2">{formatInr(item.paidAmount)}</td>
                  <td className={`px-3 py-2 font-bold ${item.pendingAmount > 0 ? "text-review" : "text-success"}`}>
                    {formatInr(item.pendingAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Page Break for Print Layout of child details */}
      <div className="page-break" />

      {/* Detailed Child-wise breakdown */}
      <section className="space-y-8 pt-4 border-t border-dashed border-border-strong print:border-t-0">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">Detailed Child-wise Breakdown</h2>
        {students.map(({ student, financialSnapshot, installmentBalances }) => {
          if (!financialSnapshot) return null;
          const feeHeads = [
            ...financialSnapshot.resolvedBreakdown.coreHeads,
            ...financialSnapshot.resolvedBreakdown.customHeads,
          ];
          const hasConventionalDiscount = financialSnapshot.resolvedBreakdown.conventionalDiscountApplied > 0;

          return (
            <div key={student.id} className="space-y-4 rounded-lg border border-border p-4 bg-card print:border-none print:p-0">
              <div className="flex justify-between items-start border-b border-border pb-2">
                <div>
                  <h3 className="text-base font-bold text-foreground">{student.fullName}</h3>
                  <p className="text-xs text-muted-foreground">SR no {student.admissionNo} • Class {student.classLabel}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase text-muted-foreground">Outstanding</span>
                  <p className="text-sm font-bold text-review">{formatInr(financialSnapshot.currentOutstanding)}</p>
                </div>
              </div>

              {/* Fee Breakup & Conventional Discounts */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Fee breakup</p>
                  <table className="w-full border-collapse text-left text-xs border border-border rounded-md">
                    <tbody>
                      {feeHeads.map((item) => (
                        <tr key={item.id} className="border-t border-border first:border-t-0">
                          <td className="px-2 py-1.5">{item.label}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{formatInr(item.amount)}</td>
                        </tr>
                      ))}
                      {hasConventionalDiscount && (
                        <tr className="border-t border-accent/20 bg-accent-soft/40 text-accent-soft-foreground">
                          <td className="px-2 py-1.5 font-medium">
                            Discount ({financialSnapshot.resolvedBreakdown.conventionalDiscountLabels.join(", ")})
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold">
                            -{formatInr(financialSnapshot.resolvedBreakdown.conventionalDiscountApplied)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border-strong bg-surface-2 font-semibold">
                        <td className="px-2 py-1.5">Annual Total</td>
                        <td className="px-2 py-1.5 text-right">
                          {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3">
                  {/* Overrides and custom details */}
                  <div className="rounded-lg bg-surface-2 p-3 text-xs space-y-2">
                    <p className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Fee Overrides & Settings</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tuition Override:</span>
                      <span className="font-medium text-foreground">
                        {student.tuitionOverride !== null ? formatInr(student.tuitionOverride) : "Class default"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transport Override:</span>
                      <span className="font-medium text-foreground">
                        {student.transportOverride !== null ? formatInr(student.transportOverride) : "Route default"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">General Discount:</span>
                      <span className="font-medium text-foreground">{formatInr(student.discountAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Late Fee Waiver:</span>
                      <span className="font-medium text-foreground">{formatInr(student.lateFeeWaiverAmount)}</span>
                    </div>
                    {student.otherAdjustmentHead && (
                      <div className="flex justify-between border-t border-border pt-1">
                        <span className="text-muted-foreground truncate max-w-[150px]" title={student.otherAdjustmentHead}>
                          {student.otherAdjustmentHead}:
                        </span>
                        <span className="font-medium text-foreground">{formatInr(student.otherAdjustmentAmount ?? 0)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Installment Balances */}
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Installment Breakdown</p>
                <table className="w-full border-collapse text-left text-xs border border-border rounded-md">
                  <thead className="bg-surface-2 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Installment</th>
                      <th className="px-2 py-1">Due Date</th>
                      <th className="px-2 py-1">Base Due</th>
                      <th className="px-2 py-1">Late Fee</th>
                      <th className="px-2 py-1">Paid</th>
                      <th className="px-2 py-1">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentBalances.map((item) => (
                      <tr key={item.installmentId} className="border-t border-border">
                        <td className="px-2 py-1.5">{item.installmentLabel}</td>
                        <td className="px-2 py-1.5">{formatShortDate(item.dueDate)}</td>
                        <td className="px-2 py-1.5">{formatInr(item.baseCharge)}</td>
                        <td className="px-2 py-1.5">{formatInr(item.finalLateFee)}</td>
                        <td className="px-2 py-1.5">{formatInr(item.paidAmount)}</td>
                        <td className={`px-2 py-1.5 font-medium ${item.pendingAmount > 0 ? "text-review" : "text-success"}`}>
                          {formatInr(item.pendingAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </article>
  );
}
