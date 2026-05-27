import { notFound } from "next/navigation";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst, formatShortDate } from "@/lib/helpers/date";
import { getReportsPageData, normalizeReportFilters } from "@/lib/reports/data";
import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import { requireStaffPermission } from "@/lib/supabase/session";

type PrintLedgerPageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const formatDateTime = (value: string) => formatDateTimeIst(value);

export default async function PrintLedgerPage({ params, searchParams }: PrintLedgerPageProps) {
  await requireStaffPermission("reports:view", { onDenied: "redirect" });

  const { studentId } = await params;
  const rawSearchParams = await searchParams;

  const filters = normalizeReportFilters({
    ...rawSearchParams,
    report: "student-ledger",
    studentId,
  });

  const data = await getReportsPageData(filters);

  if (data.report.key !== "student-ledger") {
    return notFound();
  }

  const { report } = data;
  const selectedStudent = report.selectedStudent;

  if (!selectedStudent) {
    return notFound();
  }

  return (
    <div className="mx-auto max-w-[1000px] bg-card p-8 print:p-0">
      {/* Print Header */}
      <div className="mb-8 flex flex-col items-center justify-center border-b pb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase">
          Shri Veer Patta Senior Secondary School
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Udaipur Road, Kelwa, Rajsamand (Raj.) 313334
        </p>
        <div className="mt-6 inline-flex rounded-full bg-surface-2 px-4 py-1 text-sm font-semibold text-foreground uppercase">
          Student Ledger Report
        </div>
      </div>

      {/* Student Details */}
      <div className="mb-8 grid grid-cols-2 gap-x-12 gap-y-4 rounded-xl border border-border bg-surface-2/50 p-6 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Student Name</p>
          <p className="mt-1 text-base font-semibold text-foreground">{selectedStudent.fullName}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Admission No / SR</p>
          <p className="mt-1 text-base font-semibold text-foreground">{selectedStudent.admissionNo}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Class & Section</p>
          <p className="mt-1 text-foreground">{selectedStudent.classLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Academic Session</p>
          <p className="mt-1 text-foreground">{selectedStudent.sessionLabel}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Total Payments</p>
          <p className="mt-2 text-lg font-bold text-foreground">{formatInr(report.metrics.paymentsTotal)}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Adjustment Net</p>
          <p className="mt-2 text-lg font-bold text-foreground">{formatInr(report.metrics.adjustmentNet)}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Net Effect</p>
          <p className="mt-2 text-lg font-bold text-foreground">{formatInr(report.metrics.netEffect)}</p>
        </div>
        <div className="rounded-xl border bg-info-soft/50 p-4">
          <p className="text-xs font-medium text-info uppercase">Outstanding</p>
          <p className="mt-2 text-lg font-bold text-info-soft-foreground">{formatInr(report.metrics.currentOutstanding)}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-[11px] leading-tight">
          <thead className="bg-surface-2 font-bold uppercase tracking-wider text-foreground">
            <tr>
              <th className="px-3 py-3 border-b border-border">Type</th>
              <th className="px-3 py-3 border-b border-border">Date</th>
              <th className="px-3 py-3 border-b border-border">Receipt</th>
              <th className="px-3 py-3 border-b border-border">Installment</th>
              <th className="px-3 py-3 border-b border-border">Mode / Ref</th>
              <th className="px-3 py-3 border-b border-border text-right">Payment</th>
              <th className="px-3 py-3 border-b border-border text-right">Adjustment</th>
              <th className="px-3 py-3 border-b border-border">Reason / Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  No ledger entries found for the selected scope.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={`${row.entryType}-${row.entryId}`} className="text-foreground">
                  <td className="px-3 py-3 capitalize">{row.entryType}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatShortDate(row.paymentDate)}
                    <br />
                    <span className="text-[9px] text-muted-foreground">{formatShortDate(row.createdAt)}</span>
                  </td>
                  <td className="px-3 py-3 font-semibold">{row.receiptNumber || "-"}</td>
                  <td className="px-3 py-3">
                    {row.installmentLabel}
                    <br />
                    <span className="text-[9px] text-muted-foreground">Due {formatShortDate(row.dueDate)}</span>
                  </td>
                  <td className="px-3 py-3">
                    {formatPaymentModeLabel(row.paymentMode)}
                    {row.referenceNumber && (
                      <>
                        <br />
                        <span className="text-[9px] text-muted-foreground">Ref: {row.referenceNumber}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    {row.paymentAmount > 0 ? formatInr(row.paymentAmount) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {row.adjustmentAmount !== null ? (
                      <>
                        <div className="font-medium text-foreground">{formatInr(row.adjustmentAmount)}</div>
                        <div className="text-[9px] text-muted-foreground capitalize">{row.adjustmentType}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="line-clamp-2 max-w-[150px]">{row.reason || row.notes || "-"}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {row.createdByName ?? row.receivedBy ?? "Staff"}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Signature */}
      <div className="mt-12 flex items-end justify-between border-t pt-8">
        <div className="text-[10px] text-muted-foreground">
          <p>This is a computer-generated ledger report.</p>
          <p>Generated on {formatDateTime(new Date().toISOString())}</p>
        </div>
        <div className="text-center">
          <div className="mb-1 h-12 w-48 border-b border-border-strong"></div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">Accountant Signature</p>
        </div>
      </div>

      {/* Print Trigger */}
      <script
        dangerouslySetInnerHTML={{
          __html: "window.onload = () => { setTimeout(() => window.print(), 500); }",
        }}
      />
    </div>
  );
}
