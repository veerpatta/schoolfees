import "server-only";

import type { StaffRole } from "@/lib/auth/roles";
import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { createClient } from "@/lib/supabase/server";
import {
  getRawActiveSessionStudentCount,
  getRawClassStudentSummary,
  type SystemSyncHealth,
} from "@/lib/system-sync/finance-sync";
import {
  buildDashboardSummary,
  type DashboardClassSummaryRow,
  type DashboardEmptyState,
  type DashboardFollowUpStudent,
  type DashboardInstallmentSummaryRow,
  type DashboardKpis,
  type DashboardPaymentModeBreakdown,
  type DashboardRecentPayment,
  type DashboardTrendPoint,
} from "@/lib/dashboard/summary";
import {
  getWorkbookInstallmentRows,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";

type DashboardAlertTone = "info" | "warning" | "danger" | "success";

type ImportBatchRow = {
  id: string;
  filename: string;
  status: string;
  invalid_rows: number;
  duplicate_rows: number;
  failed_rows: number;
  created_at: string;
};

type LedgerRegenerationBatchRow = {
  id: string;
  policy_revision_label: string;
  reason: string;
  status: "preview_ready" | "applied" | "stale" | "failed" | "cancelled";
  created_at: string;
  preview_summary: {
    rowsRequiringReview?: number;
    rowsRecalculated?: number;
    affectedStudents?: number;
  } | null;
};

export type DashboardAlert = {
  key: string;
  title: string;
  detail: string;
  tone: DashboardAlertTone;
  actionHref?: string;
  actionLabel?: string;
};

export type DashboardCurrentInstallment = {
  label: string;
  dueDate: string;
  status: "due_today" | "upcoming" | "overdue";
};

export type DashboardPageData = {
  currentSession: string;
  currentInstallment: DashboardCurrentInstallment | null;
  generatedAt: string;
  kpis: DashboardKpis;
  collectionTrend: DashboardTrendPoint[];
  classSummary: DashboardClassSummaryRow[];
  installmentSummary: DashboardInstallmentSummaryRow[];
  followUpQueue: DashboardFollowUpStudent[];
  recentPayments: DashboardRecentPayment[];
  todayPaymentModeBreakdown: DashboardPaymentModeBreakdown[];
  alerts: DashboardAlert[];
  emptyState: DashboardEmptyState;
  loadWarnings: string[];
  totalStudents: number;
  totalDue: number;
  totalCollected: number;
  totalPending: number;
  totalRefundDue: number;
  overdueInstallmentCount: number;
  studentsWithPending: number;
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  systemSyncHealth: SystemSyncHealth | null;
};

type ActiveStudentRow = {
  studentId: string;
  classId: string;
  sessionLabel: string;
  classLabel: string;
};

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

async function optionalLoad<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
  warnings: string[],
) {
  try {
    return await loader();
  } catch (error) {
    warnings.push(`${label}: ${toErrorMessage(error)}`);
    return fallback;
  }
}

function buildCurrentInstallment(
  policy: Awaited<ReturnType<typeof getFeePolicySummary>>,
  today: string,
): DashboardCurrentInstallment | null {
  const schedule = [...policy.installmentSchedule]
    .filter((item) => item.dueDate)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

  if (schedule.length === 0) {
    return null;
  }

  const nextDue = schedule.find((item) => item.dueDate >= today) ?? schedule[schedule.length - 1];
  const status =
    nextDue.dueDate === today
      ? "due_today"
      : nextDue.dueDate < today
        ? "overdue"
        : "upcoming";

  return {
    label: nextDue.label,
    dueDate: nextDue.dueDate,
    status,
  };
}

async function getImportIssueAlerts(): Promise<DashboardAlert[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, filename, status, invalid_rows, duplicate_rows, failed_rows, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(`Unable to load import alerts: ${error.message}`);
  }

  return ((data ?? []) as ImportBatchRow[])
    .map((row) => ({
      row,
      issueCount: row.invalid_rows + row.duplicate_rows + row.failed_rows,
    }))
    .filter((item) => item.issueCount > 0)
    .slice(0, 2)
    .map(({ row, issueCount }) => ({
      key: `import-${row.id}`,
      title: "Student import needs review",
      detail: `${row.filename} has ${issueCount} row issue${issueCount === 1 ? "" : "s"} waiting for office review.`,
      tone: "warning" as const,
      actionHref: "/protected/imports",
      actionLabel: "Open imports",
    }));
}

async function getLedgerReviewAlerts(): Promise<DashboardAlert[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_regeneration_batches")
    .select("id, policy_revision_label, reason, status, created_at, preview_summary")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    throw new Error(`Unable to load dues update alerts: ${error.message}`);
  }

  return ((data ?? []) as LedgerRegenerationBatchRow[])
    .filter((row) => {
      const requiringReview = Number(row.preview_summary?.rowsRequiringReview ?? 0);
      return requiringReview > 0 || row.status === "failed" || row.status === "preview_ready";
    })
    .slice(0, 2)
    .map((row) => {
      const requiringReview = Number(row.preview_summary?.rowsRequiringReview ?? 0);
      return {
        key: `ledger-${row.id}`,
        title:
          row.status === "failed"
            ? "Dues update failed"
            : requiringReview > 0
              ? "Dues update needs review"
              : "Dues update waiting",
        detail:
          requiringReview > 0
            ? `${requiringReview} row${requiringReview === 1 ? "" : "s"} are protected from automatic update and need manual review.`
            : row.reason || "A dues update review is waiting for the next step.",
        tone: row.status === "failed" ? "danger" as const : "warning" as const,
        actionHref: "/protected/fee-setup/generate",
        actionLabel: "Review dues update",
      };
    });
}

async function getConfigChangeAlerts(): Promise<DashboardAlert[]> {
  const recentConfigChanges = await getRecentConfigChangeLog(6);

  return recentConfigChanges
    .filter((item) => item.status === "preview_ready")
    .slice(0, 2)
    .map((item) => ({
      key: `config-${item.id}`,
      title: "Fee setup review is pending",
      detail: `${item.scopeLabel} for ${item.targetLabel} is saved for review but not live yet.`,
      tone: "warning" as const,
      actionHref: "/protected/fee-setup",
      actionLabel: "Open Fee Setup",
    }));
}

async function getSetupAlerts(
  staffRole: StaffRole,
  warnings: string[],
): Promise<DashboardAlert[]> {
  const setup = await optionalLoad(
    "setup readiness",
    () => getSetupWizardData(),
    null,
    warnings,
  );

  if (!setup) {
    return [];
  }

  const readiness = getOfficeWorkflowReadiness(setup, staffRole);
  const alerts: DashboardAlert[] = [];

  if (!readiness.reports.isReady) {
    alerts.push({
      key: "reports-readiness",
      title: readiness.reports.title,
      detail: readiness.reports.detail,
      tone: "warning",
      actionHref: readiness.reports.actionHref ?? undefined,
      actionLabel: readiness.reports.actionLabel ?? undefined,
    });
  }

  if (!readiness.postPayments.isReady) {
    alerts.push({
      key: "payment-readiness",
      title: readiness.postPayments.title,
      detail: readiness.postPayments.detail,
      tone: "warning",
      actionHref: readiness.postPayments.actionHref ?? undefined,
      actionLabel: readiness.postPayments.actionLabel ?? undefined,
    });
  }

  return alerts;
}

export async function getDashboardPageData(options: { staffRole?: StaffRole } = {}): Promise<DashboardPageData> {
  const staffRole = options.staffRole ?? "admin";
  const warnings: string[] = [];
  const today = getSchoolDateStamp();

  const policy = await getFeePolicySummary();
  const [
    activeStudents,
    rawStudentCount,
    rawClassSummary,
    financialRows,
    installmentRows,
    overdueInstallments,
    transactions,
    todayTransactions,
    refundStateRows,
    configAlerts,
    importAlerts,
    ledgerAlerts,
    setupAlerts,
  ] = await Promise.all([
    optionalLoad(
      "active students",
      async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("students")
          .select(
            "id, class_id, status, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name)",
          )
          .eq("status", "active")
          .eq("class_ref.session_label", policy.academicSessionLabel)
          .eq("class_ref.status", "active");

        if (error) {
          throw new Error(error.message);
        }

        return ((data ?? []) as Array<{
          id: string;
          class_id: string;
          class_ref:
            | {
                id: string;
                session_label: string;
                class_name: string;
                section: string | null;
                stream_name: string | null;
              }
            | Array<{
                id: string;
                session_label: string;
                class_name: string;
                section: string | null;
                stream_name: string | null;
              }>
            | null;
        }>)
          .map((row) => {
            const classRef = toSingleRecord(row.class_ref);
            if (!classRef) {
              return null;
            }

            return {
              studentId: row.id,
              classId: row.class_id,
              sessionLabel: classRef.session_label,
              classLabel: buildClassLabel(classRef),
            } satisfies ActiveStudentRow;
          })
          .filter((row): row is ActiveStudentRow => Boolean(row));
      },
      [],
      warnings,
    ),
    optionalLoad(
      "raw active student count",
      () => getRawActiveSessionStudentCount(policy.academicSessionLabel),
      0,
      warnings,
    ),
    optionalLoad(
      "raw class student summary",
      () => getRawClassStudentSummary(policy.academicSessionLabel),
      [],
      warnings,
    ),
    optionalLoad("workbook student financials", () => getWorkbookStudentFinancials(), [], warnings),
    optionalLoad("workbook installment balances", () => getWorkbookInstallmentRows(), [], warnings),
    optionalLoad(
      "overdue workbook installments",
      () => getWorkbookInstallmentRows({ overdueOnly: true, pendingOnly: true }),
      [],
      warnings,
    ),
    optionalLoad("receipt activity", () => getWorkbookTransactions({ limit: 20 }), [], warnings),
    optionalLoad(
      "today receipt activity",
      () => getWorkbookTransactions({ todayOnly: true }),
      [],
      warnings,
    ),
    optionalLoad(
      "refund due state",
      async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("v_student_financial_state")
          .select("refundable_amount");

        if (error) {
          throw new Error(error.message);
        }

        return (data ?? []) as Array<{ refundable_amount: number | null }>;
      },
      [],
      warnings,
    ),
    optionalLoad("fee setup review alerts", getConfigChangeAlerts, [], warnings),
    optionalLoad("student import alerts", getImportIssueAlerts, [], warnings),
    optionalLoad("dues update alerts", getLedgerReviewAlerts, [], warnings),
    getSetupAlerts(staffRole, warnings),
  ]);

  const summary = buildDashboardSummary({
    financialRows,
    studentRows: activeStudents,
    classRows: rawClassSummary,
    installmentRows,
    overdueInstallments,
    transactions,
    todayTransactions,
    rawStudentCount: rawStudentCount || activeStudents.length,
  });

  const paidStudents = financialRows.filter((row) => row.statusLabel === "PAID").length;
  const partlyPaidStudents = financialRows.filter((row) => row.statusLabel === "PARTLY PAID").length;
  const overdueStudents = financialRows.filter((row) => row.statusLabel === "OVERDUE").length;
  const notStartedStudents = financialRows.filter((row) => row.statusLabel === "NOT STARTED").length;
  const studentsWithPending = financialRows.filter((row) => row.outstandingAmount > 0).length;
  const totalRefundDue = refundStateRows.reduce(
    (sum, row) => sum + Math.max(Number(row.refundable_amount ?? 0), 0),
    0,
  );
  const alerts: DashboardAlert[] = [
    ...setupAlerts,
    ...configAlerts,
    ...ledgerAlerts,
    ...importAlerts,
  ];

  if (warnings.length > 0) {
    alerts.push({
      key: "dashboard-limited-data",
      title: "Dashboard data is limited",
      detail: "Some dashboard sections could not be loaded. Existing posting and setup rules were not changed.",
      tone: "warning",
      actionHref: "/protected/reports",
      actionLabel: "Open reports",
    });
  }

  if (!summary.emptyState.hasStudents) {
    alerts.push({
      key: "no-students",
      title: "No students yet",
      detail: "Add or upload test students before relying on collection totals.",
      tone: "info",
      actionHref: "/protected/students/new",
      actionLabel: "Add student",
    });
  } else if (!summary.emptyState.hasFinancialData) {
    alerts.push({
      key: "dues-missing",
      title: "Students found, dues missing",
      detail: "Students exist in the active fee setup session, but dues are not prepared yet.",
      tone: "warning",
      actionHref: "/protected/advanced#fee-data-troubleshooting",
      actionLabel: "Prepare missing dues",
    });
  }

  if (!summary.emptyState.hasReceipts) {
    alerts.push({
      key: "no-receipts",
      title: "No receipts posted yet",
      detail: "Today and trend sections will fill in after payments are posted at the Payment Desk.",
      tone: "info",
      actionHref: "/protected/payments",
      actionLabel: "Open Payment Desk",
    });
  } else if (todayTransactions.length === 0) {
    alerts.push({
      key: "no-receipts-today",
      title: "No receipts today",
      detail: "No collection has been posted for the current school day yet.",
      tone: "info",
      actionHref: "/protected/payments",
      actionLabel: "Open Payment Desk",
    });
  }

  return {
    currentSession: policy.academicSessionLabel,
    currentInstallment: buildCurrentInstallment(policy, today),
    generatedAt: new Date().toISOString(),
    kpis: summary.kpis,
    collectionTrend: summary.collectionTrend,
    classSummary: summary.classSummary,
    installmentSummary: summary.installmentSummary,
    followUpQueue: summary.followUpQueue,
    recentPayments: summary.recentPayments,
    todayPaymentModeBreakdown: summary.todayPaymentModeBreakdown,
    alerts,
    emptyState: summary.emptyState,
    loadWarnings: warnings,
    totalStudents: summary.kpis.totalStudents,
    totalDue: summary.kpis.totalExpectedFees,
    totalCollected: summary.kpis.totalCollected,
    totalPending: summary.kpis.totalPending,
    totalRefundDue,
    overdueInstallmentCount: overdueInstallments.length,
    studentsWithPending,
    paidStudents,
    partlyPaidStudents,
    overdueStudents,
    notStartedStudents,
    systemSyncHealth: null,
  };
}
