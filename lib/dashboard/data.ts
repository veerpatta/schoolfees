import "server-only";

import { unstable_cache } from "next/cache";

import { hasAnyRolePermission, type StaffRole } from "@/lib/auth/roles";
import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { createClient } from "@/lib/supabase/server";
import {
  getRawActiveSessionStudentCount,
  getRawClassStudentSummary,
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
  systemSyncHealth: DashboardSyncHealth | null;
};

type ActiveStudentRow = {
  studentId: string;
  classId: string;
  sessionLabel: string;
  classLabel: string;
};

type DashboardStudentSessionRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  class_ref: { session_label: string; status: string } | Array<{ session_label: string; status: string }> | null;
};

export type DashboardSyncHealth = {
  sessionMismatch: boolean;
  studentsMissingInstallmentRows: number;
  studentsMissingInstallments: Array<{
    studentId: string;
    admissionNo: string;
    fullName: string;
    sessionLabel: string;
  }>;
  studentsMissingFinancialRows: number;
  studentsWithNoFeeSetting: number;
  paymentPreviewReady: boolean;
  paymentDeskReady: boolean;
  dashboardReady: boolean;
  warnings: string[];
  errors: string[];
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

function sessionTag(sessionLabel: string) {
  return `session:${sessionLabel}`;
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function loadDashboardFinancialRows(sessionLabel: string) {
  return unstable_cache(
    async () => getWorkbookStudentFinancials({ sessionLabel, activeOnly: true }),
    ["dashboard-financials-active", sessionLabel],
    { tags: [sessionTag(sessionLabel)] },
  )();
}

async function getDashboardSyncHealth(sessionLabel: string): Promise<DashboardSyncHealth> {
  const supabase = await createClient();
  const normalizedSession = sessionLabel.trim();

  if (!normalizedSession) {
    return {
      sessionMismatch: false,
      studentsMissingInstallmentRows: 0,
      studentsMissingInstallments: [],
      studentsMissingFinancialRows: 0,
      studentsWithNoFeeSetting: 0,
      paymentPreviewReady: true,
      paymentDeskReady: false,
      dashboardReady: true,
      warnings: [],
      errors: [],
    };
  }

  const { data: studentsRaw, error: studentsError } = await supabase
    .from("students")
    .select(
      "id, admission_no, full_name, class_id, class_ref:classes!inner(session_label, status)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", normalizedSession)
    .eq("class_ref.status", "active");

  if (studentsError) {
    throw new Error(`Unable to load dashboard student health: ${studentsError.message}`);
  }

  const activeStudents = ((studentsRaw ?? []) as DashboardStudentSessionRow[]).filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return classRef?.session_label === normalizedSession && classRef.status === "active";
  });
  const studentIds = activeStudents.map((row) => row.id);
  const classIds = [...new Set(activeStudents.map((row) => row.class_id))];

  let feeSettingClassIds = new Set<string>();
  if (classIds.length > 0) {
    const { data, error } = await supabase
      .from("fee_settings")
      .select("class_id")
      .eq("is_active", true)
      .in("class_id", classIds);

    if (error) {
      throw new Error(`Unable to load dashboard fee-setting health: ${error.message}`);
    }

    feeSettingClassIds = new Set(((data ?? []) as Array<{ class_id: string }>).map((row) => row.class_id));
  }

  const installmentStudentIds = new Set<string>();
  const batchSize = 100;
  for (let offset = 0; offset < studentIds.length; offset += batchSize) {
    const batch = studentIds.slice(offset, offset + batchSize);
    const { data, error } = await supabase
      .from("installments")
      .select("student_id")
      .in("student_id", batch)
      .neq("status", "cancelled");

    if (error) {
      throw new Error(`Unable to load dashboard installment health: ${error.message}`);
    }

    ((data ?? []) as Array<{ student_id: string }>).forEach((row) => {
      installmentStudentIds.add(row.student_id);
    });
  }

  const studentsMissingInstallments = activeStudents
    .filter((row) => !installmentStudentIds.has(row.id))
    .map((row) => ({
      studentId: row.id,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      sessionLabel: normalizedSession,
    }));
  const studentsWithNoFeeSetting = activeStudents.filter(
    (row) => !feeSettingClassIds.has(row.class_id),
  ).length;
  const studentsMissingInstallmentRows = studentsMissingInstallments.length;
  const ready =
    activeStudents.length > 0 &&
    studentsMissingInstallmentRows === 0 &&
    studentsWithNoFeeSetting === 0;

  return {
    sessionMismatch: false,
    studentsMissingInstallmentRows,
    studentsMissingInstallments,
    studentsMissingFinancialRows: studentsMissingInstallmentRows,
    studentsWithNoFeeSetting,
    paymentPreviewReady: true,
    paymentDeskReady: ready,
    dashboardReady: activeStudents.length === 0 || ready,
    warnings: studentsMissingInstallmentRows > 0 ? ["Students exist but dues are missing."] : [],
    errors: [],
  };
}

function loadDashboardTransactions(payload: {
  sessionLabel: string;
  limit?: number;
  todayOnly?: boolean;
}) {
  return unstable_cache(
    async () =>
      getWorkbookTransactions({
        limit: payload.limit,
        todayOnly: payload.todayOnly,
        sessionLabel: payload.sessionLabel,
      }),
    [
      "dashboard-transactions",
      payload.sessionLabel,
      String(payload.limit ?? ""),
      payload.todayOnly ? "today" : "all",
    ],
    { tags: [sessionTag(payload.sessionLabel)] },
  )();
}

function loadDashboardInstallmentRows(sessionLabel: string) {
  return unstable_cache(
    async () => getWorkbookInstallmentRows({ sessionLabel }),
    ["dashboard-installments", sessionLabel],
    { tags: [sessionTag(sessionLabel)] },
  )();
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

function buildDashboardStateAlerts(payload: {
  emptyState: DashboardEmptyState;
  hasTodayReceipts: boolean;
  warnings: readonly string[];
}) {
  const alerts: DashboardAlert[] = [];

  if (payload.warnings.length > 0) {
    alerts.push({
      key: "dashboard-limited-data",
      title: "Dashboard data is limited",
      detail: "Some dashboard sections could not be loaded. Existing posting and setup rules were not changed.",
      tone: "warning",
      actionHref: "/protected/reports",
      actionLabel: "Open reports",
    });
  }

  if (!payload.emptyState.hasStudents) {
    alerts.push({
      key: "no-students",
      title: "No students yet",
      detail: "Add or upload test students before relying on collection totals.",
      tone: "info",
      actionHref: "/protected/students/new",
      actionLabel: "Add student",
    });
  } else if (!payload.emptyState.hasFinancialData) {
    alerts.push({
      key: "dues-missing",
      title: "Students found, dues missing",
      detail: "Students exist in the active fee setup session, but dues are not prepared yet.",
      tone: "warning",
      actionHref: "/protected/admin-tools#fee-data-troubleshooting",
      actionLabel: "Prepare missing dues",
    });
  }

  if (!payload.emptyState.hasReceipts) {
    alerts.push({
      key: "no-receipts",
      title: "No receipts posted yet",
      detail: "Today and trend sections will fill in after payments are posted at the Payment Desk.",
      tone: "info",
      actionHref: "/protected/payments",
      actionLabel: "Open Payment Desk",
    });
  } else if (!payload.hasTodayReceipts) {
    alerts.push({
      key: "no-receipts-today",
      title: "No receipts today",
      detail: "No collection has been posted for the current school day yet.",
      tone: "info",
      actionHref: "/protected/payments",
      actionLabel: "Open Payment Desk",
    });
  }

  return alerts;
}

function canShowAlert(alert: DashboardAlert, staffRole: StaffRole) {
  const href = alert.actionHref ?? "";

  if (
    alert.key === "dues-missing" ||
    href.startsWith("/protected/admin-tools") ||
    href.startsWith("/protected/fee-setup")
  ) {
    return hasAnyRolePermission(staffRole, ["fees:write"]);
  }

  if (href.startsWith("/protected/imports") || href.startsWith("/protected/students/new")) {
    return hasAnyRolePermission(staffRole, ["students:write"]);
  }

  return true;
}

function removeUnavailableAction(alert: DashboardAlert, staffRole: StaffRole) {
  const href = alert.actionHref ?? "";

  if (href.startsWith("/protected/payments") && !hasAnyRolePermission(staffRole, ["payments:write"])) {
    return {
      key: alert.key,
      title: alert.title,
      detail: alert.detail,
      tone: alert.tone,
    };
  }

  return alert;
}

export function filterDashboardAlertsForRole(alerts: DashboardAlert[], staffRole: StaffRole) {
  return alerts
    .filter((alert) => canShowAlert(alert, staffRole))
    .map((alert) => removeUnavailableAction(alert, staffRole));
}

async function getDashboardReviewAlerts(staffRole: StaffRole, warnings: string[]) {
  const [configAlerts, importAlerts, ledgerAlerts, setupAlerts] = await Promise.all([
    optionalLoad("fee setup review alerts", getConfigChangeAlerts, [], warnings),
    optionalLoad("student import alerts", getImportIssueAlerts, [], warnings),
    optionalLoad("dues update alerts", getLedgerReviewAlerts, [], warnings),
    getSetupAlerts(staffRole, warnings),
  ]);

  return [...setupAlerts, ...configAlerts, ...ledgerAlerts, ...importAlerts];
}

export async function getDashboardAlerts(options: {
  staffRole: StaffRole;
  sessionLabel: string;
  emptyState: DashboardEmptyState;
  hasTodayReceipts: boolean;
  loadWarnings?: readonly string[];
}) {
  const warnings = [...(options.loadWarnings ?? [])];
  const alerts = [
    ...(await getDashboardReviewAlerts(options.staffRole, warnings)),
    ...buildDashboardStateAlerts({
      emptyState: options.emptyState,
      hasTodayReceipts: options.hasTodayReceipts,
      warnings,
    }),
  ];

  return filterDashboardAlertsForRole(alerts, options.staffRole);
}

export async function getDashboardAboveFoldData(options: {
  staffRole?: StaffRole;
  sessionLabel?: string;
} = {}) {
  const staffRole = options.staffRole ?? "admin";
  const warnings: string[] = [];
  const today = getSchoolDateStamp();
  const policy = await getFeePolicySummary();
  const sessionLabel = options.sessionLabel ?? policy.academicSessionLabel;
  const _t0 = Date.now();
  const [rawStudentCount, financialRowsRaw, transactions, todayTransactions, refundStateRows] = await Promise.all([
    optionalLoad(
      "raw active student count",
      () => getRawActiveSessionStudentCount(sessionLabel),
      0,
      warnings,
    ),
    optionalLoad(
      "workbook student financials",
      () => loadDashboardFinancialRows(sessionLabel),
      [],
      warnings,
    ),
    optionalLoad(
      "receipt activity",
      () => loadDashboardTransactions({ limit: 20, sessionLabel }),
      [],
      warnings,
    ),
    optionalLoad(
      "today receipt activity",
      () => loadDashboardTransactions({ todayOnly: true, sessionLabel }),
      [],
      warnings,
    ),
    optionalLoad(
      "refund due state",
      async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("v_student_financial_state")
          .select("refundable_amount")
          .gt("refundable_amount", 0);
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{ refundable_amount: number | null }>;
      },
      [],
      warnings,
    ),
  ]);
  console.log(`[dashboard-above-fold] loaded in ${Date.now() - _t0}ms`);
  const financialRows = financialRowsRaw.filter((row) => row.recordStatus === "active");
  const activeStudents: ActiveStudentRow[] = financialRows.map((row) => ({
    studentId: row.studentId,
    classId: row.classId,
    sessionLabel: row.sessionLabel,
    classLabel: row.classLabel,
  }));
  const summary = buildDashboardSummary({
    financialRows,
    studentRows: activeStudents,
    classRows: [],
    installmentRows: [],
    overdueInstallments: [],
    transactions,
    todayTransactions,
    rawStudentCount: rawStudentCount || activeStudents.length,
  });
  const totalRefundDue = refundStateRows.reduce(
    (sum, row) => sum + Math.max(Number(row.refundable_amount ?? 0), 0),
    0,
  );

  return {
    currentSession: sessionLabel,
    currentInstallment: buildCurrentInstallment(policy, today),
    generatedAt: new Date().toISOString(),
    kpis: summary.kpis,
    todayPaymentModeBreakdown: summary.todayPaymentModeBreakdown,
    recentPayments: summary.recentPayments,
    followUpQueue: summary.followUpQueue,
    emptyState: summary.emptyState,
    studentsWithPending: financialRows.filter((row) => row.outstandingAmount > 0).length,
    totalRefundDue,
    canPostPayments: hasAnyRolePermission(staffRole, ["payments:write"]),
    loadWarnings: warnings,
  };
}

export async function getDashboardPageData(options: {
  staffRole?: StaffRole;
  sessionLabel?: string;
} = {}): Promise<DashboardPageData> {
  const staffRole = options.staffRole ?? "admin";
  const warnings: string[] = [];
  const today = getSchoolDateStamp();

  const policy = await getFeePolicySummary();
  const sessionLabel = options.sessionLabel ?? policy.academicSessionLabel;
  const _tp0 = Date.now();
  const [
    rawStudentCount,
    rawClassSummary,
    financialRowsRaw,
    installmentRows,
    transactions,
    todayTransactions,
    refundStateRows,
    systemSyncHealth,
  ] = await Promise.all([
    optionalLoad(
      "raw active student count",
      () => getRawActiveSessionStudentCount(sessionLabel),
      0,
      warnings,
    ),
    optionalLoad(
      "raw class student summary",
      () => getRawClassStudentSummary(sessionLabel),
      [],
      warnings,
    ),
    optionalLoad(
      "workbook student financials",
      () => loadDashboardFinancialRows(sessionLabel),
      [],
      warnings,
    ),
    optionalLoad(
      "workbook installment balances",
      () => loadDashboardInstallmentRows(sessionLabel),
      [],
      warnings,
    ),
    optionalLoad(
      "receipt activity",
      () => loadDashboardTransactions({ limit: 20, sessionLabel }),
      [],
      warnings,
    ),
    optionalLoad(
      "today receipt activity",
      () => loadDashboardTransactions({ todayOnly: true, sessionLabel }),
      [],
      warnings,
    ),
    optionalLoad(
      "refund due state",
      async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("v_student_financial_state")
          .select("refundable_amount")
          .gt("refundable_amount", 0);

        if (error) {
          throw new Error(error.message);
        }

        return (data ?? []) as Array<{ refundable_amount: number | null }>;
      },
      [],
      warnings,
    ),
    optionalLoad(
      "dashboard sync health",
      () => getDashboardSyncHealth(sessionLabel),
      null,
      warnings,
    ),
  ]);
  console.log(`[dashboard-page-data] loaded in ${Date.now() - _tp0}ms`);
  const financialRows = financialRowsRaw.filter((row) => row.recordStatus === "active");
  const overdueInstallments = installmentRows.filter(
    (row) => row.balanceStatus === "overdue" && row.pendingAmount > 0,
  );
  const activeStudents: ActiveStudentRow[] = financialRows.map((row) => ({
    studentId: row.studentId,
    classId: row.classId,
    sessionLabel: row.sessionLabel,
    classLabel: row.classLabel,
  }));

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
  const alerts = await getDashboardAlerts({
    staffRole,
    sessionLabel,
    emptyState: summary.emptyState,
    hasTodayReceipts: todayTransactions.length > 0,
    loadWarnings: warnings,
  });

  return {
    currentSession: sessionLabel,
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
    systemSyncHealth,
  };
}
