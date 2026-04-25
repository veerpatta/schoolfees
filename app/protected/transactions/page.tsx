import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ClassTabs, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import {
  getOfficeWorkbookData,
  type OfficeWorkbookStudentRow,
  type OfficeWorkbookSummary,
} from "@/lib/office/dues";
import {
  buildOfficeWorkbookExportHref,
  buildOfficeWorkbookHref,
  normalizeOfficeWorkbookView,
  officeWorkbookMeta,
  officeWorkbookViews,
  type OfficeWorkbookView,
} from "@/lib/office/workbook";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getSetupWizardData } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

type TransactionsPageProps = {
  searchParams?: Promise<{
    view?: string;
    classId?: string;
    fromDate?: string;
    paymentMode?: string;
    query?: string;
    routeId?: string;
    sessionLabel?: string;
    toDate?: string;
  }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeClassId(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizePaymentMode(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return ["cash", "upi", "bank_transfer", "cheque"].includes(normalized)
    ? normalized
    : "";
}

function formatPaymentModeLabel(value: string) {
  if (value === "upi") {
    return "UPI";
  }

  if (value === "bank_transfer") {
    return "Bank transfer";
  }

  if (value === "cheque") {
    return "Cheque";
  }

  return "Cash";
}

function formatOptionalDate(value: string | null | undefined) {
  return value ? formatShortDate(value) : "-";
}

function getStatusTone(status: OfficeWorkbookStudentRow["statusLabel"]) {
  switch (status) {
    case "PAID":
      return "locked";
    case "OVERDUE":
      return "review";
    case "PARTLY PAID":
      return "editable";
    case "NOT STARTED":
      return "policy";
    default:
      return "calculated";
  }
}

function ViewTabs({
  activeView,
  classId,
  query,
}: {
  activeView: OfficeWorkbookView;
  classId: string;
  query: Record<string, string>;
}) {
  const buildHref = (view: OfficeWorkbookView) => {
    const params = new URLSearchParams();

    Object.entries({ ...query, view, classId }).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return `/protected/transactions?${params.toString()}`;
  };

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
      {officeWorkbookViews.map((view) => (
        <Link
          key={view}
          href={buildHref(view)}
          className={
            view === activeView
              ? "inline-flex w-full items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-2 py-2 text-[11px] font-medium leading-4 text-white sm:px-3 sm:text-sm"
              : "inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium leading-4 text-slate-700 hover:border-slate-300 sm:px-3 sm:text-sm"
          }
        >
          {officeWorkbookMeta[view].shortTitle}
        </Link>
      ))}
    </div>
  );
}

function WorkbookSummaryCards({
  summary,
  showClassRegisterOnly = false,
}: {
  summary: OfficeWorkbookSummary;
  showClassRegisterOnly?: boolean;
}) {
  const essentialCards = [
    { label: "Students", value: summary.studentCount },
    { label: "Total due", value: formatInr(summary.totalDue) },
    { label: "Outstanding", value: formatInr(summary.totalOutstanding) },
    { label: "Total paid", value: formatInr(summary.totalPaid) },
  ];

  const detailCards = [
    { label: "Discounts", value: formatInr(summary.totalDiscount) },
    { label: "Late fee waived", value: formatInr(summary.totalLateFeeWaived) },
    { label: "Transport students", value: summary.transportStudentCount },
    { label: "Tuition total", value: formatInr(summary.tuitionFeeTotal) },
    { label: "Transport total", value: formatInr(summary.transportFeeTotal) },
    { label: "Academic fee", value: formatInr(summary.academicFeeTotal) },
    { label: "Other adj.", value: formatInr(summary.otherAdjustmentTotal) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {essentialCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {card.label}
            </p>
            <p className="mt-1.5 text-base font-semibold text-slate-950">{card.value}</p>
          </div>
        ))}
      </div>

      {showClassRegisterOnly || detailCards.length > 0 ? (
        <details className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
            More totals
          </summary>
          <div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
            {detailCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1.5 text-base font-semibold text-slate-950">{card.value}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TransactionsTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getOfficeWorkbookData>> extends infer T
    ? T extends { view: "transactions" | "receipts"; rows: infer R }
      ? R
      : never
    : never;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1520px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Receipt / Ref</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">SR no</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Payment mode</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Received by</th>
            <th className="px-4 py-3">Father</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Total paid</th>
            <th className="px-4 py-3">Outstanding</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Late fee waived</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={16} className="px-4 py-6 text-center text-slate-500">
                No transactions found for this view.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.receiptId} className="border-t border-slate-100">
                <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.receiptNumber}</div>
                </td>
                <td className="px-4 py-3">{row.studentName}</td>
                <td className="px-4 py-3">{row.admissionNo}</td>
                <td className="px-4 py-3">{row.classLabel}</td>
                <td className="px-4 py-3">{formatPaymentModeLabel(row.paymentMode)}</td>
                <td className="px-4 py-3">{row.referenceNumber ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.totalAmount)}</td>
                <td className="px-4 py-3">{row.receivedBy ?? "-"}</td>
                <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                <td className="px-4 py-3">{row.transportRouteLabel}</td>
                <td className="px-4 py-3">{formatInr(row.currentTotalPaid)}</td>
                <td className="px-4 py-3">{formatInr(row.currentOutstanding)}</td>
                <td className="px-4 py-3">{formatInr(row.discountApplied)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeWaived)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/receipts/${row.receiptId}`}>Print</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/students/${row.studentId}`}>Student</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/payments?studentId=${row.studentId}`}>Payment Desk</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function InstallmentTrackerTable({ rows }: { rows: OfficeWorkbookStudentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">SR no</th>
            <th className="px-4 py-3">Father / Phone</th>
            <th className="px-4 py-3">Inst 1</th>
            <th className="px-4 py-3">Inst 2</th>
            <th className="px-4 py-3">Inst 3</th>
            <th className="px-4 py-3">Inst 4</th>
            <th className="px-4 py-3">Late fee</th>
            <th className="px-4 py-3">Total due</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Outstanding</th>
            <th className="px-4 py-3">Next due date</th>
            <th className="px-4 py-3">Next due amount</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Waiver</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={18} className="px-4 py-6 text-center text-slate-500">
                No installment tracker rows found.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                <td className="px-4 py-3">{row.classLabel}</td>
                <td className="px-4 py-3">{row.admissionNo}</td>
                <td className="px-4 py-3">
                  <div>{row.fatherName ?? "-"}</div>
                  <div className="text-xs text-slate-500">{row.fatherPhone ?? "-"}</div>
                </td>
                <td className="px-4 py-3">{formatInr(row.inst1Pending)}</td>
                <td className="px-4 py-3">{formatInr(row.inst2Pending)}</td>
                <td className="px-4 py-3">{formatInr(row.inst3Pending)}</td>
                <td className="px-4 py-3">{formatInr(row.inst4Pending)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.outstandingAmount)}</td>
                <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                <td className="px-4 py-3">
                  <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                    {row.duesStatus === "missing_dues" ? "Dues not generated" : row.statusLabel || "-"}
                  </ValueStatePill>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/payments?studentId=${row.studentId}`}>Payment</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/students/${row.studentId}/statement`}>Statement</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentDuesTable({ rows }: { rows: OfficeWorkbookStudentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1320px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Tuition</th>
            <th className="px-4 py-3">Transport</th>
            <th className="px-4 py-3">Academic</th>
            <th className="px-4 py-3">Other adj.</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Late fee</th>
            <th className="px-4 py-3">Total due</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Outstanding</th>
            <th className="px-4 py-3">Next due</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-4 py-6 text-center text-slate-500">
                No students found for statement view.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.studentName}</div>
                  <div className="text-xs text-slate-500">{row.admissionNo}</div>
                </td>
                <td className="px-4 py-3">{row.classLabel}</td>
                <td className="px-4 py-3">{formatInr(row.tuitionFee)}</td>
                <td className="px-4 py-3">{formatInr(row.transportFee)}</td>
                <td className="px-4 py-3">{formatInr(row.academicFee)}</td>
                <td className="px-4 py-3">
                  {row.otherAdjustmentHead ? `${row.otherAdjustmentHead}: ` : ""}
                  {formatInr(row.otherAdjustmentAmount)}
                </td>
                <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.outstandingAmount)}</td>
                <td className="px-4 py-3">
                  <div>
                    {row.duesStatus === "missing_dues"
                      ? "Dues not generated"
                      : row.nextDueLabel ?? "No pending dues"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {row.duesStatus === "missing_dues"
                      ? "Generate dues before collection"
                      : row.nextDueDate ? `${formatShortDate(row.nextDueDate)} | ${formatInr(row.nextDueAmount ?? 0)}` : "-"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/students/${row.studentId}/statement`}>Print statement</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/payments?studentId=${row.studentId}`}>Payment</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClassRegisterTable({ rows }: { rows: OfficeWorkbookStudentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[2080px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">SR no</th>
            <th className="px-4 py-3">Father</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Student status</th>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Total due</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Outstanding</th>
            <th className="px-4 py-3">Next due date</th>
            <th className="px-4 py-3">Next due amount</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Last payment</th>
            <th className="px-4 py-3">Other head</th>
            <th className="px-4 py-3">Other adj.</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Late fee waived</th>
            <th className="px-4 py-3">Tuition</th>
            <th className="px-4 py-3">Transport</th>
            <th className="px-4 py-3">Academic</th>
            <th className="px-4 py-3">Receipt history</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={22} className="px-4 py-6 text-center text-slate-500">
                No class register rows found.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                <td className="px-4 py-3">{row.admissionNo}</td>
                <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                <td className="px-4 py-3">{row.studentStatusLabel}</td>
                <td className="px-4 py-3">{row.transportRouteName ?? "No Transport"}</td>
                <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.outstandingAmount)}</td>
                <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                <td className="px-4 py-3">
                  <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                    {row.duesStatus === "missing_dues" ? "Dues not generated" : row.statusLabel || "-"}
                  </ValueStatePill>
                </td>
                <td className="px-4 py-3">{formatOptionalDate(row.lastPaymentDate)}</td>
                <td className="px-4 py-3">{row.otherAdjustmentHead ?? "-"}</td>
                <td className="px-4 py-3">{formatInr(row.otherAdjustmentAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.tuitionFee)}</td>
                <td className="px-4 py-3">{formatInr(row.transportFee)}</td>
                <td className="px-4 py-3">{formatInr(row.academicFee)}</td>
                <td className="px-4 py-3">
                  {row.receiptHistory.length === 0 ? (
                    <span className="text-slate-500">No receipts yet</span>
                  ) : (
                    <div className="space-y-1">
                      {row.receiptHistory.map((item) => (
                        <div key={`${row.studentId}-${item.receiptNumber}`} className="text-xs text-slate-700">
                          {item.receiptNumber} | {formatShortDate(item.paymentDate)} | {formatInr(item.totalAmount)}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/students/${row.studentId}`}>Student</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/payments?studentId=${row.studentId}`}>Payment</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DefaultersTable({ rows }: { rows: OfficeWorkbookStudentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">SR no</th>
            <th className="px-4 py-3">Father</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Total due</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Outstanding</th>
            <th className="px-4 py-3">Late fee</th>
            <th className="px-4 py-3">Next due date</th>
            <th className="px-4 py-3">Next due amount</th>
            <th className="px-4 py-3">Last payment</th>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Waiver</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={16} className="px-4 py-6 text-center text-slate-500">
                No overdue students found.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                <td className="px-4 py-3">{row.classLabel}</td>
                <td className="px-4 py-3">{row.admissionNo}</td>
                <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.outstandingAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                <td className="px-4 py-3">{formatOptionalDate(row.lastPaymentDate)}</td>
                <td className="px-4 py-3">{row.transportRouteName ?? "No Transport"}</td>
                <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/payments?studentId=${row.studentId}`}>Payment</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/students/${row.studentId}`}>Student</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CollectionTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getOfficeWorkbookData>> extends infer T
    ? T extends { view: "collection_today"; rows: infer R }
      ? R
      : never
    : never;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Receipts</th>
            <th className="px-4 py-3">Students</th>
            <th className="px-4 py-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No collection rows found for today.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.paymentDate}-${row.paymentMode}`} className="border-t border-slate-100">
                <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                <td className="px-4 py-3">{row.paymentMode}</td>
                <td className="px-4 py-3">{row.receiptCount}</td>
                <td className="px-4 py-3">{row.studentCount}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.totalAmount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ImportIssuesTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getOfficeWorkbookData>> extends infer T
    ? T extends { view: "import_issues"; rows: infer R }
      ? R
      : never
    : never;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1260px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Row</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">SR no</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Errors</th>
            <th className="px-4 py-3">Warnings</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                No import issues found for this view.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.rowId} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">{row.rowIndex}</td>
                <td className="px-4 py-3">{row.fullName ?? "-"}</td>
                <td className="px-4 py-3">{row.admissionNo ?? "-"}</td>
                <td className="px-4 py-3">{row.classLabel ?? "-"}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.errors.length > 0 ? row.errors.join(" | ") : "-"}</td>
                <td className="px-4 py-3">{row.warnings.length > 0 ? row.warnings.join(" | ") : "-"}</td>
                <td className="px-4 py-3">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/protected/imports?batchId=${row.batchId}`}>Open batch</Link>
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const staff = await requireAnyStaffPermission(
    ["receipts:view", "defaulters:view", "reports:view", "finance:view"],
    {
      onDenied: "redirect",
    },
  );

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeView = normalizeOfficeWorkbookView(resolvedSearchParams?.view);
  const classId = normalizeClassId(resolvedSearchParams?.classId);
  const routeId = normalizeClassId(resolvedSearchParams?.routeId);
  const sessionLabel = (resolvedSearchParams?.sessionLabel ?? "").trim();
  const searchQuery = (resolvedSearchParams?.query ?? "").trim();
  const fromDate = normalizeDate(resolvedSearchParams?.fromDate);
  const toDate = normalizeDate(resolvedSearchParams?.toDate);
  const paymentMode = normalizePaymentMode(resolvedSearchParams?.paymentMode);
  const [workbook, setup, { routeOptions }, policy] = await Promise.all([
    getOfficeWorkbookData({
      view: activeView,
      classId,
      fromDate,
      paymentMode,
      routeId,
      searchQuery,
      sessionLabel,
      toDate,
    }),
    getSetupWizardData(),
    getStudentFormOptions(),
    getFeePolicySummary(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const activeMeta = officeWorkbookMeta[activeView];
  const canExport = hasStaffPermission(staff, "reports:view");
  const preservedQuery = {
    query: searchQuery,
    fromDate,
    toDate,
    paymentMode,
    routeId,
    sessionLabel,
  };
  const currentExportHref = buildOfficeWorkbookExportHref({
    view: activeView,
    classId,
    fromDate,
    paymentMode,
    query: searchQuery,
    routeId,
    sessionLabel,
    toDate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance records"
        title="Transactions"
        description="Permanent receipt records, dues, installment tracker, defaulters, and exportable finance views."
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <Button asChild size="sm" variant="outline">
                <Link href={currentExportHref}>Export current view</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/payments">Open Payment Desk</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={buildOfficeWorkbookHref({ view: "collection_today", classId, sessionLabel })}>
                Today&apos;s Collection
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={buildOfficeWorkbookHref({ view: "receipts", classId, sessionLabel })}>
                Receipt Register
              </Link>
            </Button>
          </div>
        }
      />

      {!readiness.reports.isReady ? (
        <WorkflowGuard
          title={readiness.reports.title}
          detail={readiness.reports.detail}
          actionLabel={readiness.reports.actionLabel}
          actionHref={readiness.reports.actionHref}
        />
      ) : null}

      <SectionCard
        title="Choose view"
        description="Switch records, dues, receipts, and export views from one compact control area."
        actions={
          <StatusBadge label="Read-only records" tone="accent" />
        }
      >
        <div className="space-y-4">
          <ViewTabs activeView={activeView} classId={classId} query={preservedQuery} />
          <ClassTabs
            basePath="/protected/transactions"
            classOptions={workbook.classOptions}
            activeClassId={classId}
            query={{ view: activeView, ...preservedQuery }}
          />
          <form action="/protected/transactions" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input type="hidden" name="view" value={activeView} />
            {classId ? <input type="hidden" name="classId" value={classId} /> : null}
            <div className="xl:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transactions-query">
                Search
              </label>
              <input
                id="transactions-query"
                name="query"
                defaultValue={searchQuery}
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                placeholder="Student, SR no, receipt no, phone"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transactions-route">
                Route
              </label>
              <select
                id="transactions-route"
                name="routeId"
                defaultValue={routeId}
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">All routes</option>
                {routeOptions.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transactions-mode">
                Mode
              </label>
              <select
                id="transactions-mode"
                name="paymentMode"
                defaultValue={paymentMode}
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">All modes</option>
                {policy.acceptedPaymentModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transactions-from">
                From
              </label>
              <input
                id="transactions-from"
                name="fromDate"
                type="date"
                defaultValue={fromDate}
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transactions-to">
                To
              </label>
              <input
                id="transactions-to"
                name="toDate"
                type="date"
                defaultValue={toDate}
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="flex items-end gap-2 xl:col-span-6">
              <Button type="submit" size="sm">Apply filters</Button>
              <Button asChild size="sm" variant="outline">
                <Link href={buildOfficeWorkbookHref({ view: activeView, classId: "", sessionLabel: "" })}>
                  Reset
                </Link>
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      {"summary" in workbook ? (
        <SectionCard
          title={activeView === "class_register" ? "Class summary" : "Working totals"}
          description={
            activeView === "class_register"
              ? "Top-level register totals for the selected class or working set."
              : "Essential totals first, more totals only when needed."
          }
        >
          <WorkbookSummaryCards
            summary={workbook.summary}
            showClassRegisterOnly={activeView === "class_register"}
          />
        </SectionCard>
      ) : null}

      {workbook.view === "transactions" || workbook.view === "receipts" ? (
        <SectionCard
          title={activeMeta.title}
          description={
            workbook.view === "transactions"
              ? "Latest posted records newest first with current workbook balance context."
              : "Receipt register with print, student, and payment desk shortcuts."
          }
        >
          <TransactionsTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "installments" ? (
        <SectionCard
          title="Installment tracker"
          description="Student-wise workbook tracker with pending installment columns and next due details."
        >
          <InstallmentTrackerTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "student_dues" ? (
        <SectionCard
          title="Student dues"
          description="Student-wise dues, paid, pending, discount, and next-due details."
        >
          <StudentDuesTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "class_register" ? (
        <SectionCard
          title="Class register"
          description="Workbook-style class register with fee breakup and compact receipt history."
        >
          <ClassRegisterTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "defaulters" ? (
        <SectionCard
          title="Defaulters"
          description="Overdue-only follow-up register with phone-ready details."
        >
          <DefaultersTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "collection_today" ? (
        <SectionCard
          title="Today's collection"
          description="Grouped daily collection totals for desk and day-book recheck."
        >
          <CollectionTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "import_issues" ? (
        <SectionCard
          title="Import issues"
          description="Recent staged rows that still need review or cleanup."
        >
          <ImportIssuesTable rows={workbook.rows} />
        </SectionCard>
      ) : null}

      {workbook.view === "exports" ? (
        <SectionCard
          title="Exports"
          description="Download the permanent finance views as CSV. PDF export remains deferred."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {officeWorkbookViews
              .filter((view) => view !== "exports")
              .map((view) => (
                <div key={view} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="font-medium text-slate-950">{officeWorkbookMeta[view].title}</p>
                  <p className="mt-1 text-sm text-slate-600">{officeWorkbookMeta[view].description}</p>
                  {canExport ? (
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link
                        href={buildOfficeWorkbookExportHref({
                          view,
                          classId,
                          fromDate,
                          paymentMode,
                          query: searchQuery,
                          routeId,
                          sessionLabel,
                          toDate,
                        })}
                      >
                        Download CSV
                      </Link>
                    </Button>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">CSV export requires reports access.</p>
                  )}
                </div>
              ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
