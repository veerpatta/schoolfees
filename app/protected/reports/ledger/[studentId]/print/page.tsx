import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getReportsPageData, normalizeReportFilters } from "@/lib/reports/data";
import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import { requireStaffPermission } from "@/lib/supabase/session";

type PrintLedgerPageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function PrintLedgerPage({ params, searchParams }: PrintLedgerPageProps) {
  await requireStaffPermission("reports:view", { onDenied: "redirect" });

  const { studentId } = await params;
  const rawSearchParams = await searchParams;
  
  // Force report type and studentId
  const filters = normalizeReportFilters({
    ...rawSearchParams,
    report: "student-ledger",
    studentId,
  });

  const data = await getReportsPageData(filters);

  if (data.report.key !== "student-ledger" || !data.report.selectedStudent) {
    return notFound();
  }

  const { report } = data;
  const { selectedStudent } = report;

  return (
    <div className="mx-auto max-w-[1000px] bg-white p-8 print:p-0">
      {/* Print Header */}
      <div className="mb-8 flex flex-col items-center justify-center border-b pb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
          Shri Veer Patta Senior Secondary School
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Udaipur Road, Kelwa, Rajsamand (Raj.) 313334
        </p>
        <div className="mt-6 inline-flex rounded-full bg-slate-100 px-4 py-1 text-sm font-semibold text-slate-900 uppercase">
          Student Ledger Report
        </div>
      </div>

      {/* Student Details */}
      <div className="mb-8 grid grid-cols-2 gap-x-12 gap-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Student Name</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{selectedStudent.fullName}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Admission No / SR</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{selectedStudent.admissionNo}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Class & Section</p>
          <p className="mt-1 text-slate-900">{selectedStudent.classLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Academic Session</p>
          <p className="mt-1 text-slate-900">{selectedStudent.sessionLabel}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Payments</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{formatInr(report.metrics.paymentsTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase">Adjustment Net</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{formatInr(report.metrics.adjustmentNet)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase">Net Effect</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{formatInr(report.metrics.netEffect)}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs font-medium text-blue-600 uppercase">Outstanding</p>
          <p className="mt-2 text-lg font-bold text-blue-900">{formatInr(report.metrics.currentOutstanding)}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-[11px] leading-tight">
          <thead className="bg-slate-100 font-bold uppercase tracking-wider text-slate-700">
            <tr>
              <th className="px-3 py-3 border-b border-slate-200">Type</th>
              <th className="px-3 py-3 border-b border-slate-200">Date</th>
              <th className="px-3 py-3 border-b border-slate-200">Receipt</th>
              <th className="px-3 py-3 border-b border-slate-200">Installment</th>
              <th className="px-3 py-3 border-b border-slate-200">Mode / Ref</th>
              <th className="px-3 py-3 border-b border-slate-200 text-right">Payment</th>
              <th className="px-3 py-3 border-b border-slate-200 text-right">Adjustment</th>
              <th className="px-3 py-3 border-b border-slate-200">Reason / Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                  No ledger entries found for the selected scope.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={`${row.entryType}-${row.entryId}`} className="text-slate-800">
                  <td className="px-3 py-3 capitalize">{row.entryType}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatShortDate(row.paymentDate)}
                    <br />
                    <span className="text-[9px] text-slate-500">{formatShortDate(row.createdAt)}</span>
                  </td>
                  <td className="px-3 py-3 font-semibold">{row.receiptNumber || "-"}</td>
                  <td className="px-3 py-3">
                    {row.installmentLabel}
                    <br />
                    <span className="text-[9px] text-slate-500">Due {formatShortDate(row.dueDate)}</span>
                  </td>
                  <td className="px-3 py-3">
                    {formatPaymentModeLabel(row.paymentMode)}
                    {row.referenceNumber && (
                      <>
                        <br />
                        <span className="text-[9px] text-slate-500">Ref: {row.referenceNumber}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    {row.paymentAmount > 0 ? formatInr(row.paymentAmount) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {row.adjustmentAmount !== null ? (
                      <>
                        <div className="font-medium text-slate-900">{formatInr(row.adjustmentAmount)}</div>
                        <div className="text-[9px] text-slate-500 capitalize">{row.adjustmentType}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="line-clamp-2 max-w-[150px]">{row.reason || row.notes || "-"}</div>
                    <div className="text-[9px] text-slate-500">
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
        <div className="text-[10px] text-slate-500">
          <p>This is a computer-generated ledger report.</p>
          <p>Generated on {formatDateTime(new Date().toISOString())}</p>
        </div>
        <div className="text-center">
          <div className="mb-1 h-12 w-48 border-b border-slate-300"></div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Accountant Signature</p>
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
