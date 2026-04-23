import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ClassTabs, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getOfficeWorkbookData } from "@/lib/office/dues";
import {
  buildOfficeWorkbookHref,
  normalizeOfficeWorkbookView,
  officeWorkbookMeta,
  officeWorkbookViews,
  type OfficeWorkbookView,
} from "@/lib/office/workbook";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getReportAuditNote } from "@/lib/reports/data";
import type {
  DailyCollectionReportData,
  ImportVerificationReportData,
  OutstandingReportData,
  ReceiptRegisterReportData,
  ReportData,
  ReportsPageData,
} from "@/lib/reports/types";
import { getSetupWizardData } from "@/lib/setup/data";
import { requireAnyStaffPermission } from "@/lib/supabase/session";

type DuesPageProps = {
  searchParams?: Promise<{
    view?: string;
    classId?: string;
    sessionLabel?: string;
  }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasReportPageData(
  value: Awaited<ReturnType<typeof getOfficeWorkbookData>>["data"],
): value is ReportsPageData {
  return "report" in value;
}

function hasRowsReport(
  report: ReportData,
): report is OutstandingReportData | DailyCollectionReportData | ReceiptRegisterReportData {
  return "rows" in report;
}

function isImportVerificationReport(report: ReportData): report is ImportVerificationReportData {
  return report.key === "import-verification";
}

function normalizeClassId(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function ViewTabs({
  activeView,
  classId,
  sessionLabel,
}: {
  activeView: OfficeWorkbookView;
  classId: string;
  sessionLabel: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {officeWorkbookViews.map((view) => (
        <Link
          key={view}
          href={buildOfficeWorkbookHref({ view, classId, sessionLabel })}
          className={
            view === activeView
              ? "inline-flex min-w-fit items-center rounded-full border border-slate-900 bg-slate-900 px-3 py-2 text-sm text-white"
              : "inline-flex min-w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
          }
        >
          {officeWorkbookMeta[view].title}
        </Link>
      ))}
    </div>
  );
}

function ReceiptRegisterTable({
  rows,
}: {
  rows: Array<{
    receiptId: string;
    receiptNumber: string;
    paymentDate: string;
    fullName: string;
    admissionNo: string;
    classLabel: string;
    transportRouteLabel: string;
    totalAmount: number;
    studentId: string;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Receipt</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                No receipt rows found for this view.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.receiptId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{row.receiptNumber}</td>
                <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                <td className="px-4 py-3">
                  {row.fullName}
                  <div className="text-xs text-slate-500">{row.admissionNo}</div>
                </td>
                <td className="px-4 py-3">{row.classLabel}</td>
                <td className="px-4 py-3">{row.transportRouteLabel}</td>
                <td className="px-4 py-3">{formatInr(row.totalAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/receipts/${row.receiptId}`}>Print</Link>
                    </Button>
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

export default async function DuesPage({ searchParams }: DuesPageProps) {
  const staff = await requireAnyStaffPermission(["receipts:view", "defaulters:view", "imports:view"], {
    onDenied: "redirect",
  });

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeView = normalizeOfficeWorkbookView(resolvedSearchParams?.view);
  const classId = normalizeClassId(resolvedSearchParams?.classId);
  const sessionLabel = (resolvedSearchParams?.sessionLabel ?? "").trim();
  const [workbook, setup] = await Promise.all([
    getOfficeWorkbookData({ view: activeView, classId, sessionLabel }),
    getSetupWizardData(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const activeMeta = officeWorkbookMeta[activeView];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dues & Receipts"
        title={activeMeta.title}
        description={activeMeta.description}
        actions={<StatusBadge label="Office view" tone="accent" />}
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
        title="View shortcuts"
        description="Keep the most-used office tables one hop away. Open Reports & Exports only when you need the full filter set or CSV."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/protected/reports">Open Reports & Exports</Link>
          </Button>
        }
      >
        <div className="space-y-4">
          <ViewTabs activeView={activeView} classId={classId} sessionLabel={sessionLabel} />
          <ClassTabs
            basePath="/protected/dues"
            classOptions={workbook.classOptions}
            activeClassId={classId}
            query={{ view: activeView, sessionLabel }}
          />
        </div>
      </SectionCard>

      {hasReportPageData(workbook.data) ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {getReportAuditNote(workbook.data.report.key)}
        </div>
      ) : null}

      {activeView === "transactions" || activeView === "receipts_today" ? (
        <SectionCard
          title={activeMeta.title}
          description={
            activeView === "transactions"
              ? "Receipt rows stay flat and easy to recheck at the counter."
              : "Only today's posted receipts are shown for quick printing and counter recheck."
          }
        >
          <ReceiptRegisterTable
            rows={
              hasReportPageData(workbook.data) && hasRowsReport(workbook.data.report)
                ? (workbook.data.report.rows as ReceiptRegisterReportData["rows"])
                : []
            }
          />
        </SectionCard>
      ) : null}

      {activeView === "installments" ? (
        <SectionCard
          title={activeMeta.title}
          description="Open installment rows with their current due, collected, and pending amounts."
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Collected</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {hasReportPageData(workbook.data) &&
                hasRowsReport(workbook.data.report) &&
                workbook.data.report.rows.length > 0 ? (
                  (workbook.data.report.rows as OutstandingReportData["rows"]).map((row) => (
                    <tr key={`${row.studentId}-${row.installmentNo}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        {row.fullName}
                        <div className="text-xs text-slate-500">{row.admissionNo}</div>
                      </td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.installmentLabel}</td>
                      <td className="px-4 py-3">{formatShortDate(row.dueDate)}</td>
                      <td className="px-4 py-3">{formatInr(row.amountDue)}</td>
                      <td className="px-4 py-3">{formatInr(row.collectedAmount)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <ValueStatePill
                          tone={row.balanceStatus === "overdue" ? "review" : "calculated"}
                          className="normal-case tracking-normal"
                        >
                          {row.balanceStatus}
                        </ValueStatePill>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No installment rows found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeView === "statements" || activeView === "defaulters" ? (
        <SectionCard
          title={activeMeta.title}
          description={
            activeView === "statements"
              ? "Per-student pending totals for the selected class or current working set."
              : "Overdue-only list for immediate follow-up."
          }
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">SR no</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Pending amount</th>
                  <th className="px-4 py-3">Overdue installments</th>
                  <th className="px-4 py-3">Oldest due</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {"rows" in workbook.data && workbook.data.rows.length > 0 ? (
                  workbook.data.rows.map((row) => (
                    <tr key={row.studentId} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                      <td className="px-4 py-3">{row.admissionNo}</td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.transportRouteLabel}</td>
                      <td className="px-4 py-3">{formatInr(row.totalPending)}</td>
                      <td className="px-4 py-3">{row.overdueInstallments}</td>
                      <td className="px-4 py-3">
                        {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/students/${row.studentId}`}>Student</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/payments?studentId=${row.studentId}`}>
                              Payment
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No student rows found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeView === "collection_today" ? (
        <SectionCard
          title={activeMeta.title}
          description="Grouped totals for same-day desk checking."
        >
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
                {hasReportPageData(workbook.data) &&
                hasRowsReport(workbook.data.report) &&
                workbook.data.report.rows.length > 0 ? (
                  (workbook.data.report.rows as DailyCollectionReportData["rows"]).map((row) => (
                    <tr key={`${row.paymentDate}-${row.paymentMode}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                      <td className="px-4 py-3">{row.paymentMode}</td>
                      <td className="px-4 py-3">{row.receiptCount}</td>
                      <td className="px-4 py-3">{row.studentCount}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatInr(row.totalAmount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No collection rows found for today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeView === "import_issues" ? (
        <SectionCard
          title={activeMeta.title}
          description="Recent staged rows that still need office review or admin cleanup."
        >
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
                {hasReportPageData(workbook.data) &&
                isImportVerificationReport(workbook.data.report) &&
                workbook.data.report.detailRows.length > 0 ? (
                  workbook.data.report.detailRows
                    .filter(
                      (row) =>
                        row.errors.length > 0 ||
                        row.warnings.length > 0 ||
                        row.status !== "imported",
                    )
                    .map((row) => (
                      <tr key={row.rowId} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3">{row.rowIndex}</td>
                        <td className="px-4 py-3">{row.fullName ?? "-"}</td>
                        <td className="px-4 py-3">{row.admissionNo ?? "-"}</td>
                        <td className="px-4 py-3">{row.classLabel ?? "-"}</td>
                        <td className="px-4 py-3">
                          <ValueStatePill
                            tone={row.status === "imported" ? "calculated" : "review"}
                            className="normal-case tracking-normal"
                          >
                            {row.status}
                          </ValueStatePill>
                        </td>
                        <td className="px-4 py-3">
                          {row.errors.length > 0 ? row.errors.join(" | ") : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.warnings.length > 0 ? row.warnings.join(" | ") : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/imports?batchId=${row.batchId}`}>Open batch</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No import issues found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
