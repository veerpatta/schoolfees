import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { AutoSubmitForm } from "@/components/office/auto-submit-form";
import { WorkflowGuard } from "@/components/office/office-ui";
import { PrintReportButton } from "@/components/reports/print-report-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPaymentModeLabel,
  getReportAuditNote,
  getReportsPageData,
  normalizeReportFilters,
} from "@/lib/reports/data";
import {
  reportDefinitions,
  reportKeys,
  type ReportData,
  type ReportFilters,
  type ReportKey,
} from "@/lib/reports/types";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { requireStaffPermission } from "@/lib/supabase/session";

type ReportsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildReportHref(
  filters: ReportFilters,
  overrides: Partial<ReportFilters> = {},
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  params.set("report", nextFilters.report);

  if (nextFilters.classId) {
    params.set("classId", nextFilters.classId);
  }

  if (nextFilters.transportRouteId) {
    params.set("transportRouteId", nextFilters.transportRouteId);
  }

  if (nextFilters.sessionLabel) {
    params.set("sessionLabel", nextFilters.sessionLabel);
  }

  if (nextFilters.fromDate) {
    params.set("fromDate", nextFilters.fromDate);
  }

  if (nextFilters.toDate) {
    params.set("toDate", nextFilters.toDate);
  }

  if (nextFilters.paymentMode) {
    params.set("paymentMode", nextFilters.paymentMode);
  }

  if (nextFilters.studentId) {
    params.set("studentId", nextFilters.studentId);
  }

  if (nextFilters.studentQuery) {
    params.set("studentQuery", nextFilters.studentQuery);
  }

  if (nextFilters.batchId) {
    params.set("batchId", nextFilters.batchId);
  }

  return `/protected/reports?${params.toString()}`;
}

function ResetFiltersLink({
  report,
}: {
  report: ReportKey;
}) {
  return (
    <Button asChild variant="outline">
      <Link href={`/protected/reports?report=${report}`}>Reset filters</Link>
    </Button>
  );
}

function ReportCatalog({
  filters,
}: {
  filters: ReportFilters;
}) {
  return (
    <SectionCard
      title="Report list"
      description="Choose one report. Filters update the table automatically."
      className="print:hidden"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reportKeys.map((reportKey) => {
          const definition = reportDefinitions[reportKey];
          const isActive = reportKey === filters.report;

          return (
            <Link
              key={reportKey}
              href={buildReportHref(filters, {
                report: reportKey,
                studentId: reportKey === "student-ledger" ? filters.studentId : "",
                batchId: reportKey === "import-verification" ? filters.batchId : "",
              })}
              className={`rounded-[24px] border px-4 py-4 transition-colors ${
                isActive
                  ? "border-blue-200 bg-blue-50/80"
                  : "border-slate-200/80 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold text-slate-950">
                  {definition.title}
                </p>
                {isActive ? (
                  <StatusBadge label="Open" tone="accent" />
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {definition.description}
              </p>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ReportFiltersSection({
  report,
  exportHref,
  printHref,
  children,
}: {
  report: ReportKey;
  exportHref: string;
  printHref?: string;
  children: React.ReactNode;
}) {
  return (
    <SectionCard
      title="Filters and output"
      description="Filters update the table automatically. Export and print remain manual."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={exportHref}>Export CSV</Link>
          </Button>
          {printHref ? (
            <Button asChild variant="outline">
              <Link href={printHref} target="_blank">Print view</Link>
            </Button>
          ) : reportDefinitions[report].printFriendly ? (
            <PrintReportButton />
          ) : null}
          <ResetFiltersLink report={report} />
        </div>
      }
      className="print:hidden"
    >
      {children}
    </SectionCard>
  );
}

function SharedClassAndSessionFilters({
  filters,
  sessionOptions,
  classOptions,
}: {
  filters: ReportFilters;
  sessionOptions: string[];
  classOptions: Array<{ id: string; label: string; sessionLabel: string }>;
}) {
  return (
    <>
      <div>
        <Label htmlFor="report-session-label">Session</Label>
        <select
          id="report-session-label"
          name="sessionLabel"
          defaultValue={filters.sessionLabel}
          className={`${selectClassName} mt-2`}
        >
          <option value="">All sessions</option>
          {sessionOptions.map((sessionLabel) => (
            <option key={sessionLabel} value={sessionLabel}>
              {sessionLabel}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="report-class-id">Class</Label>
        <select
          id="report-class-id"
          name="classId"
          defaultValue={filters.classId}
          className={`${selectClassName} mt-2`}
        >
          <option value="">All classes</option>
          {classOptions.map((classOption) => (
            <option key={classOption.id} value={classOption.id}>
              {classOption.label} ({classOption.sessionLabel})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function OutstandingFilters({
  filters,
  sessionOptions,
  classOptions,
  routeOptions,
}: {
  filters: ReportFilters;
  sessionOptions: string[];
  classOptions: Array<{ id: string; label: string; sessionLabel: string }>;
  routeOptions: Array<{ id: string; label: string; routeCode: string | null }>;
}) {
  return (
    <AutoSubmitForm action="/protected/reports" method="get" className="space-y-4">
      <input type="hidden" name="report" value="outstanding" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SharedClassAndSessionFilters
          filters={filters}
          sessionOptions={sessionOptions}
          classOptions={classOptions}
        />
        <div>
          <Label htmlFor="outstanding-route-id">Route</Label>
          <select
            id="outstanding-route-id"
            name="transportRouteId"
            defaultValue={filters.transportRouteId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">All routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="outstanding-from-date">Due from</Label>
          <Input
            id="outstanding-from-date"
            name="fromDate"
            type="date"
            defaultValue={filters.fromDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="outstanding-to-date">Due to</Label>
          <Input
            id="outstanding-to-date"
            name="toDate"
            type="date"
            defaultValue={filters.toDate}
            className="mt-2"
          />
        </div>
      </div>
    </AutoSubmitForm>
  );
}

function CollectionFilters({
  filters,
  sessionOptions,
  classOptions,
  routeOptions,
  paymentModes,
  report,
}: {
  filters: ReportFilters;
  sessionOptions: string[];
  classOptions: Array<{ id: string; label: string; sessionLabel: string }>;
  routeOptions: Array<{ id: string; label: string; routeCode: string | null }>;
  paymentModes: ReadonlyArray<{ value: string; label: string }>;
  report: "daily-collection" | "receipt-register";
}) {
  return (
    <AutoSubmitForm action="/protected/reports" method="get" className="space-y-4">
      <input type="hidden" name="report" value={report} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SharedClassAndSessionFilters
          filters={filters}
          sessionOptions={sessionOptions}
          classOptions={classOptions}
        />
        <div>
          <Label htmlFor={`${report}-route-id`}>Route</Label>
          <select
            id={`${report}-route-id`}
            name="transportRouteId"
            defaultValue={filters.transportRouteId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">All routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${report}-from-date`}>Date from</Label>
          <Input
            id={`${report}-from-date`}
            name="fromDate"
            type="date"
            defaultValue={filters.fromDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor={`${report}-to-date`}>Date to</Label>
          <Input
            id={`${report}-to-date`}
            name="toDate"
            type="date"
            defaultValue={filters.toDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor={`${report}-payment-mode`}>Payment mode</Label>
          <select
            id={`${report}-payment-mode`}
            name="paymentMode"
            defaultValue={filters.paymentMode}
            className={`${selectClassName} mt-2`}
          >
            <option value="">All modes</option>
            {paymentModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </AutoSubmitForm>
  );
}

function LedgerFilters({
  filters,
  sessionOptions,
  classOptions,
  routeOptions,
  paymentModes,
  studentOptions,
  selectedStudentId,
}: {
  filters: ReportFilters;
  sessionOptions: string[];
  classOptions: Array<{ id: string; label: string; sessionLabel: string }>;
  routeOptions: Array<{ id: string; label: string; routeCode: string | null }>;
  paymentModes: ReadonlyArray<{ value: string; label: string }>;
  studentOptions: Array<{
    id: string;
    fullName: string;
    admissionNo: string;
    classLabel: string;
  }>;
  selectedStudentId: string;
}) {
  return (
    <AutoSubmitForm action="/protected/reports" method="get" className="space-y-4">
      <input type="hidden" name="report" value="student-ledger" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SharedClassAndSessionFilters
          filters={filters}
          sessionOptions={sessionOptions}
          classOptions={classOptions}
        />
        <div>
          <Label htmlFor="ledger-route-id">Route</Label>
          <select
            id="ledger-route-id"
            name="transportRouteId"
            defaultValue={filters.transportRouteId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">All routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ledger-student-query">Search student</Label>
          <Input
            id="ledger-student-query"
            name="studentQuery"
            defaultValue={filters.studentQuery}
            placeholder="Student name or SR no"
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="ledger-student-id">Student</Label>
          <select
            id="ledger-student-id"
            name="studentId"
            defaultValue={selectedStudentId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">Select student</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName} ({student.admissionNo}) - {student.classLabel}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ledger-from-date">Entry from</Label>
          <Input
            id="ledger-from-date"
            name="fromDate"
            type="date"
            defaultValue={filters.fromDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="ledger-to-date">Entry to</Label>
          <Input
            id="ledger-to-date"
            name="toDate"
            type="date"
            defaultValue={filters.toDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="ledger-payment-mode">Payment mode</Label>
          <select
            id="ledger-payment-mode"
            name="paymentMode"
            defaultValue={filters.paymentMode}
            className={`${selectClassName} mt-2`}
          >
            <option value="">All modes</option>
            {paymentModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </AutoSubmitForm>
  );
}

function ImportFilters({
  filters,
  sessionOptions,
  classOptions,
  batchOptions,
  selectedBatchId,
}: {
  filters: ReportFilters;
  sessionOptions: string[];
  classOptions: Array<{ id: string; label: string; sessionLabel: string }>;
  batchOptions: Array<{ id: string; label: string; createdAt: string; status: string }>;
  selectedBatchId: string;
}) {
  return (
    <AutoSubmitForm action="/protected/reports" method="get" className="space-y-4">
      <input type="hidden" name="report" value="import-verification" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SharedClassAndSessionFilters
          filters={filters}
          sessionOptions={sessionOptions}
          classOptions={classOptions}
        />
        <div>
          <Label htmlFor="import-batch-id">Batch</Label>
          <select
            id="import-batch-id"
            name="batchId"
            defaultValue={selectedBatchId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">Latest matching batch</option>
            {batchOptions.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.label} ({formatShortDate(batch.createdAt)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="import-from-date">Batch from</Label>
          <Input
            id="import-from-date"
            name="fromDate"
            type="date"
            defaultValue={filters.fromDate}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="import-to-date">Batch to</Label>
          <Input
            id="import-to-date"
            name="toDate"
            type="date"
            defaultValue={filters.toDate}
            className="mt-2"
          />
        </div>
      </div>
    </AutoSubmitForm>
  );
}

function MetricsSection({ report }: { report: ReportData }) {
  switch (report.key) {
    case "outstanding":
      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Students with dues"
            value={report.metrics.studentCount}
            hint="Students in the current filtered outstanding list"
          />
          <MetricCard
            title="Open installments"
            value={report.metrics.openInstallments}
            hint="Installment rows still carrying an unpaid balance"
          />
          <MetricCard
            title="Overdue installments"
            value={report.metrics.overdueInstallments}
            hint="Rows already past due date and still unpaid"
          />
          <MetricCard
            title="Outstanding total"
            value={formatInr(report.metrics.totalOutstanding)}
            hint="Current unpaid amount in this report view"
          />
        </section>
      );
    case "daily-collection":
      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Receipts in view"
            value={report.metrics.receiptCount}
            hint="Posted receipts matching the selected filters"
          />
          <MetricCard
            title="Collection total"
            value={formatInr(report.metrics.totalAmount)}
            hint="Sum of receipt totals inside this view"
          />
          <MetricCard
            title="Collection days"
            value={report.metrics.collectionDays}
            hint="Distinct payment dates in the current report"
          />
          <MetricCard
            title="Students covered"
            value={report.metrics.distinctStudents}
            hint="Students represented in the listed receipt rows"
          />
        </section>
      );
    case "student-ledger":
      if (!report.selectedStudent) {
        return null;
      }

      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Entries in view"
            value={report.metrics.entryCount}
            hint="Payment and adjustment rows currently listed"
          />
          <MetricCard
            title="Payments in view"
            value={formatInr(report.metrics.paymentsTotal)}
            hint="Original payment amounts only"
          />
          <MetricCard
            title="Adjustment net"
            value={formatInr(report.metrics.adjustmentNet)}
            hint="Positive reduces due, negative increases due"
          />
          <MetricCard
            title="Current outstanding"
            value={formatInr(report.metrics.currentOutstanding)}
            hint="Current unpaid balance for the selected student"
          />
        </section>
      );
    case "receipt-register":
      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            title="Receipts listed"
            value={report.metrics.receiptCount}
            hint="Receipt rows in the current filtered register"
          />
          <MetricCard
            title="Amount in register"
            value={formatInr(report.metrics.totalAmount)}
            hint="Total of receipt amounts shown below"
          />
          <MetricCard
            title="Students covered"
            value={report.metrics.studentCount}
            hint="Students represented in the listed receipt rows"
          />
        </section>
      );
    case "import-verification":
      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Batches in scope"
            value={report.metrics.batchCount}
            hint="Import batches matching the current date filters"
          />
          <MetricCard
            title="Workbook rows"
            value={report.metrics.totalRows}
            hint="Total staged rows across the listed batches"
          />
          <MetricCard
            title="Imported rows"
            value={report.metrics.importedRows}
            hint="Rows saved into the student master workflow"
          />
          <MetricCard
            title="Issue rows"
            value={report.metrics.issueRows}
            hint="Invalid, duplicate, or failed rows still needing review"
          />
        </section>
      );
    default:
      return null;
  }
}

function ReportTables({ report }: { report: ReportData }) {
  switch (report.key) {
    case "outstanding":
      return (
        <SectionCard
          title={reportDefinitions[report.key].tableTitle}
          description={reportDefinitions[report.key].tableDescription}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">SR no</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Amount due</th>
                  <th className="px-4 py-3">Payments</th>
                  <th className="px-4 py-3">Adjustments</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                      No outstanding rows found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={`${row.studentId}-${row.installmentNo}`} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                      <td className="px-4 py-3">{row.admissionNo}</td>
                      <td className="px-4 py-3">{row.sessionLabel}</td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.transportRouteLabel}</td>
                      <td className="px-4 py-3">
                        {row.installmentLabel} ({row.installmentNo})
                      </td>
                      <td className="px-4 py-3">{formatShortDate(row.dueDate)}</td>
                      <td className="px-4 py-3">{formatInr(row.amountDue)}</td>
                      <td className="px-4 py-3">{formatInr(row.paymentsTotal)}</td>
                      <td className="px-4 py-3">{formatInr(row.adjustmentsTotal)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3 capitalize">{row.balanceStatus}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    case "daily-collection":
      return (
        <>
          <SectionCard
            title="Mode totals"
            description="Quick payment-mode split for daily counter reconciliation."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {report.modeTotals.length === 0 ? (
                <p className="text-sm text-slate-600">No payment totals available for this filter.</p>
              ) : (
                report.modeTotals.map((row) => (
                  <div
                    key={row.paymentMode}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <p className="text-sm font-medium text-slate-700">
                      {formatPaymentModeLabel(row.paymentMode)}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatInr(row.totalAmount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.receiptCount} receipt{row.receiptCount === 1 ? "" : "s"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={reportDefinitions[report.key].tableTitle}
            description={reportDefinitions[report.key].tableDescription}
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Payment date</th>
                    <th className="px-4 py-3">Payment mode</th>
                    <th className="px-4 py-3">Receipt count</th>
                    <th className="px-4 py-3">Student count</th>
                    <th className="px-4 py-3">Total amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No collection summary rows found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row) => (
                      <tr key={`${row.paymentDate}-${row.paymentMode}`} className="border-t border-slate-100 text-slate-700">
                        <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                        <td className="px-4 py-3">{formatPaymentModeLabel(row.paymentMode)}</td>
                        <td className="px-4 py-3">{row.receiptCount}</td>
                        <td className="px-4 py-3">{row.studentCount}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatInr(row.totalAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      );
    case "student-ledger":
      if (!report.selectedStudent) {
        return (
          <SectionCard
            title="Student selection required"
            description="Choose a student to open the ledger report."
          >
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Payments and adjustments are exportable only after a student is selected.
            </p>
          </SectionCard>
        );
      }

      return (
        <SectionCard
          title={`${report.selectedStudent.fullName} ledger`}
          description={reportDefinitions[report.key].tableDescription}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Entry type</th>
                  <th className="px-4 py-3">Created at</th>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Payment date</th>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">Mode / ref</th>
                  <th className="px-4 py-3">Payment amount</th>
                  <th className="px-4 py-3">Adjustment impact</th>
                  <th className="px-4 py-3">Reason / created by</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                      No ledger rows found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={`${row.entryType}-${row.entryId}`} className="border-t border-slate-100 align-top text-slate-700">
                      <td className="px-4 py-3 capitalize">{row.entryType}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.receiptNumber}</td>
                      <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.installmentLabel}</div>
                        <div className="text-xs text-slate-500">Due {formatShortDate(row.dueDate)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{formatPaymentModeLabel(row.paymentMode)}</div>
                        <div className="text-xs text-slate-500">
                          {row.referenceNumber ? `Ref ${row.referenceNumber}` : "No reference"}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatInr(row.paymentAmount)}</td>
                      <td className="px-4 py-3">
                        {row.adjustmentAmount === null ? (
                          <span className="text-slate-500">-</span>
                        ) : (
                          <div>
                            <div className="font-medium text-slate-900">
                              {formatInr(row.adjustmentAmount)}
                            </div>
                            <div className="text-xs text-slate-500 capitalize">
                              {row.adjustmentType}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.reason ?? "-"}</div>
                        <div className="text-xs text-slate-500">
                          {row.createdByName ?? row.receivedBy ?? "Staff user"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.notes || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    case "receipt-register":
      return (
        <SectionCard
          title={reportDefinitions[report.key].tableTitle}
          description={reportDefinitions[report.key].tableDescription}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Receipt no</th>
                  <th className="px-4 py-3">Payment date</th>
                  <th className="px-4 py-3">Posted at</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">SR no</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Received by</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                      No receipts found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={row.receiptId} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.receiptNumber}</td>
                      <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                      <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-3">{row.fullName}</td>
                      <td className="px-4 py-3">{row.admissionNo}</td>
                      <td className="px-4 py-3">{row.sessionLabel}</td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.transportRouteLabel}</td>
                      <td className="px-4 py-3">{formatPaymentModeLabel(row.paymentMode)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatInr(row.totalAmount)}
                      </td>
                      <td className="px-4 py-3">{row.referenceNumber ?? "-"}</td>
                      <td className="px-4 py-3">{row.receivedBy ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    case "import-verification":
      return (
        <>
          <SectionCard
            title="Batch summary"
            description="Use this table to compare batch totals before drilling into a selected batch."
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1140px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Format</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total rows</th>
                    <th className="px-4 py-3">Imported</th>
                    <th className="px-4 py-3">Invalid</th>
                    <th className="px-4 py-3">Duplicate</th>
                    <th className="px-4 py-3">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {report.batchRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                        No import batches found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    report.batchRows.map((row) => (
                      <tr key={row.batchId} className="border-t border-slate-100 text-slate-700">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.filename}</td>
                        <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                        <td className="px-4 py-3 uppercase">{row.sourceFormat}</td>
                        <td className="px-4 py-3 capitalize">{row.status}</td>
                        <td className="px-4 py-3">{row.totalRows}</td>
                        <td className="px-4 py-3">{row.importedRows}</td>
                        <td className="px-4 py-3">{row.invalidRows}</td>
                        <td className="px-4 py-3">{row.duplicateRows}</td>
                        <td className="px-4 py-3">{row.failedRows}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title={
              report.selectedBatch
                ? `Detail rows for ${report.selectedBatch.label}`
                : reportDefinitions[report.key].tableTitle
            }
            description={reportDefinitions[report.key].tableDescription}
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1280px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">SR no</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Imported</th>
                    <th className="px-4 py-3">Duplicate</th>
                    <th className="px-4 py-3">Errors</th>
                    <th className="px-4 py-3">Warnings</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {report.detailRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                        No import detail rows found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    report.detailRows.map((row) => (
                      <tr key={row.rowId} className="border-t border-slate-100 align-top text-slate-700">
                        <td className="px-4 py-3">{row.rowIndex}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.fullName ?? "-"}</td>
                        <td className="px-4 py-3">{row.admissionNo ?? "-"}</td>
                        <td className="px-4 py-3">{row.classLabel ?? "-"}</td>
                        <td className="px-4 py-3 capitalize">{row.status}</td>
                        <td className="px-4 py-3">{row.importedStudentId ?? "-"}</td>
                        <td className="px-4 py-3">{row.duplicateStudentId ?? "-"}</td>
                        <td className="px-4 py-3">{row.errors.length > 0 ? row.errors.join(" | ") : "-"}</td>
                        <td className="px-4 py-3">{row.warnings.length > 0 ? row.warnings.join(" | ") : "-"}</td>
                        <td className="px-4 py-3">{formatDateTime(row.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      );
    default:
      return null;
  }
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const staff = await requireStaffPermission("reports:view", { onDenied: "redirect" });
  const filters = normalizeReportFilters(searchParams ? await searchParams : undefined);
  const [data, policy, setup] = await Promise.all([
    getReportsPageData(filters),
    getFeePolicySummary(),
    getSetupWizardData(),
  ]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const activeDefinition = reportDefinitions[data.report.key];
  const exportHref = `/protected/reports/export${buildReportHref(filters).replace("/protected/reports", "")}`;
  const printHref = data.report.key === "student-ledger" && data.report.selectedStudent
    ? `/protected/reports/ledger/${data.report.selectedStudent.id}/print${buildReportHref(filters).replace("/protected/reports", "")}`
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title={activeDefinition.title}
        description={activeDefinition.description}
        actions={
          <div className="print:hidden">
            <StatusBadge label="Audit-focused" tone="accent" />
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

      <ReportCatalog filters={filters} />

      <ReportFiltersSection
        report={data.report.key}
        exportHref={exportHref}
        printHref={printHref}
      >
        {data.report.key === "outstanding" ? (
          <OutstandingFilters
            filters={filters}
            sessionOptions={data.options.sessionOptions}
            classOptions={data.options.classOptions}
            routeOptions={data.options.routeOptions}
          />
        ) : null}

        {data.report.key === "daily-collection" ? (
          <CollectionFilters
            filters={filters}
            sessionOptions={data.options.sessionOptions}
            classOptions={data.options.classOptions}
            routeOptions={data.options.routeOptions}
            paymentModes={data.options.paymentModes}
            report="daily-collection"
          />
        ) : null}

        {data.report.key === "student-ledger" ? (
          <LedgerFilters
            filters={filters}
            sessionOptions={data.options.sessionOptions}
            classOptions={data.options.classOptions}
            routeOptions={data.options.routeOptions}
            paymentModes={data.options.paymentModes}
            studentOptions={data.options.studentOptions}
            selectedStudentId={data.report.selectedStudent?.id ?? filters.studentId}
          />
        ) : null}

        {data.report.key === "receipt-register" ? (
          <CollectionFilters
            filters={filters}
            sessionOptions={data.options.sessionOptions}
            classOptions={data.options.classOptions}
            routeOptions={data.options.routeOptions}
            paymentModes={data.options.paymentModes}
            report="receipt-register"
          />
        ) : null}

        {data.report.key === "import-verification" ? (
          <ImportFilters
            filters={filters}
            sessionOptions={data.options.sessionOptions}
            classOptions={data.options.classOptions}
            batchOptions={data.options.batchOptions}
            selectedBatchId={data.report.selectedBatch?.id ?? filters.batchId}
          />
        ) : null}
      </ReportFiltersSection>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
        Generated {formatDateTime(data.generatedAt)}. {getReportAuditNote(data.report.key)} Active policy session: {policy.academicSessionLabel}.
      </div>

      <MetricsSection report={data.report} />

      <ReportTables report={data.report} />
    </div>
  );
}
