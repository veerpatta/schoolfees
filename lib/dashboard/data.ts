import "server-only";

import { hasAnyRolePermission, type StaffRole } from "@/lib/auth/roles";
import { getFeePolicySummary } from "@/lib/fees/data";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
// unstable_cache
import {
  getRawActiveSessionStudentCount,
  getRawClassStudentSummary,
} from "@/lib/system-sync/finance-sync";
import {
  buildDashboardSummary,
  type DashboardClassSummaryRow,
  type DashboardClassInstallmentPendingRow,
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
  collectionHeatmap: Array<{ date: string; amount: number }>;
  classSummary: DashboardClassSummaryRow[];
  installmentSummary: DashboardInstallmentSummaryRow[];
  classInstallmentMatrix: DashboardClassInstallmentPendingRow[];
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
  syncError: boolean;
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
  return cacheSafeUnstableCache(
    async () => getWorkbookStudentFinancials({ sessionLabel, activeOnly: true }),
    ["dashboard-financials-active", sessionLabel],
    { tags: [sessionTag(sessionLabel)] },
  )();
}

async function getDashboardSyncHealth(sessionLabel: string): Promise<DashboardSyncHealth> {
  const supabase = await getCacheSafeClient();
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
  if (studentIds.length > 0) {
    const { data, error } = await supabase
      .from("installments")
      .select("student_id")
      .in("student_id", studentIds)
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
  return cacheSafeUnstableCache(
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

function getSchoolMonthRange(today: string) {
  const [yearRaw, monthRaw] = today.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const fromDate = `${yearRaw}-${monthRaw}-01`;
  const toDate = `${yearRaw}-${monthRaw}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  return { fromDate, toDate };
}

function loadDashboardMonthlyCollections(payload: {
  sessionLabel: string;
  today: string;
}) {
  const { fromDate, toDate } = getSchoolMonthRange(payload.today);

  return cacheSafeUnstableCache(
    async () => {
      const transactions = await getWorkbookTransactions({
        fromDate,
        limit: null,
        sessionLabel: payload.sessionLabel,
        toDate,
      });
      const amountByDate = transactions.reduce((acc, row) => {
        acc.set(row.paymentDate, (acc.get(row.paymentDate) ?? 0) + row.totalAmount);
        return acc;
      }, new Map<string, number>());

      return Array.from(amountByDate.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((left, right) => left.date.localeCompare(right.date));
    },
    ["dashboard-monthly-collections", payload.sessionLabel, fromDate, toDate],
    { tags: [sessionTag(payload.sessionLabel)] },
  )();
}

function loadDashboardInstallmentRows(sessionLabel: string) {
  return cacheSafeUnstableCache(
    async () => getWorkbookInstallmentRows({ sessionLabel }),
    ["dashboard-installments", sessionLabel],
    { tags: [sessionTag(sessionLabel)] },
  )();
}

function loadDashboardSyncHealth(sessionLabel: string) {
  return cacheSafeUnstableCache(
    async () => getDashboardSyncHealth(sessionLabel),
    ["dashboard-sync-health", sessionLabel],
    {
      tags: [sessionTag(sessionLabel)],
      revalidate: 120,
    },
  )();
}

function loadDashboardRefundState() {
  return cacheSafeUnstableCache(
    async () => {
      const supabase = await getCacheSafeClient();
      const { data, error } = await supabase
        .from("v_student_financial_state")
        .select("refundable_amount")
        .gt("refundable_amount", 0);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as Array<{ refundable_amount: number | null }>;
    },
    ["dashboard-refund-state"],
    {
      revalidate: 60,
    },
  )();
}

function loadRawActiveSessionStudentCount(sessionLabel: string) {
  return cacheSafeUnstableCache(
    async () => getRawActiveSessionStudentCount(sessionLabel),
    ["dashboard-raw-student-count", sessionLabel],
    {
      tags: [sessionTag(sessionLabel)],
      revalidate: 120,
    },
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

function buildDashboardStateAlerts(payload: {
  emptyState: DashboardEmptyState;
  hasTodayReceipts: boolean;
}) {
  const alerts: DashboardAlert[] = [];

  if (!payload.emptyState.hasStudents) {
    alerts.push({
      key: "no-students",
      title: "No students yet",
      detail: "Add or upload test students before relying on collection totals.",
      tone: "info",
      actionHref: "/protected/students/new",
      actionLabel: "Add student",
    });
  }

  if (
    payload.emptyState.hasStudents &&
    payload.emptyState.hasFinancialData &&
    !payload.emptyState.hasReceipts
  ) {
    alerts.push({
      key: "no-receipts",
      title: "No receipts posted yet",
      detail: "Today and trend sections will fill in after payments are posted at the Payment Desk.",
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

export async function getDashboardAlerts(options: {
  staffRole: StaffRole;
  sessionLabel: string;
  emptyState: DashboardEmptyState;
  hasTodayReceipts: boolean;
  loadWarnings?: readonly string[];
}) {
  const alerts = buildDashboardStateAlerts({
    emptyState: options.emptyState,
    hasTodayReceipts: options.hasTodayReceipts,
  });

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
  const [
    financialRowsRaw,
    installmentRows,
    transactions,
    todayTransactions,
    rawStudentCount,
    refundStateRows,
  ] = await Promise.all([
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
    (async () => {
      try {
        return await loadRawActiveSessionStudentCount(sessionLabel);
      } catch {
        return 0;
      }
    })(),
    (async () => {
      try {
        return await loadDashboardRefundState();
      } catch {
        return [];
      }
    })(),
  ]);
  console.log(`[dashboard-above-fold] loaded in ${Date.now() - _t0}ms`);
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
    classRows: [],
    installmentRows,
    overdueInstallments,
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
    syncError: warnings.length > 0,
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
    collectionHeatmap,
    refundStateRows,
    systemSyncHealth,
  ] = await Promise.all([
    optionalLoad(
      "raw active student count",
      () => loadRawActiveSessionStudentCount(sessionLabel),
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
      "monthly receipt activity",
      () => loadDashboardMonthlyCollections({ sessionLabel, today }),
      [],
      warnings,
    ),
    (async () => {
      try {
        return await loadDashboardRefundState();
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        // "dashboard sync health" is advisory; a timeout here must not mark the
        // financial numbers as incomplete.
        return await loadDashboardSyncHealth(sessionLabel);
      } catch {
        return null;
      }
    })(),
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
    collectionHeatmap,
    classSummary: summary.classSummary,
    installmentSummary: summary.installmentSummary,
    classInstallmentMatrix: summary.classInstallmentMatrix,
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
    syncError: warnings.length > 0,
    systemSyncHealth,
  };
}
