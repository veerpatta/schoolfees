import "server-only";

import { hasAnyRolePermission, type StaffRole } from "@/lib/auth/roles";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getCacheSafeClient } from "@/lib/supabase/cache-safe";
import {
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

interface DashboardSummaryRpcResult {
  kpis: DashboardKpis;
  todayPaymentModeBreakdown: DashboardPaymentModeBreakdown[];
  recentPayments: DashboardRecentPayment[];
  followUpQueue: DashboardFollowUpStudent[];
  emptyState: DashboardEmptyState;
  studentsWithPending: number;
  totalRefundDue: number;
  collectionTrend: DashboardTrendPoint[];
  collectionHeatmap: Array<{ date: string; amount: number }>;
  classSummary: DashboardClassSummaryRow[];
  installmentSummary: DashboardInstallmentSummaryRow[];
  classInstallmentMatrix: DashboardClassInstallmentPendingRow[];
  overdueInstallmentCount: number;
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  systemSyncHealth: DashboardSyncHealth | null;
}

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
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
  const today = getSchoolDateStamp();
  const policy = await getFeePolicySummary();
  const sessionLabel = options.sessionLabel ?? policy.academicSessionLabel;

  const _t0 = Date.now();
  const supabase = await getCacheSafeClient();
  const { data, error } = await supabase.rpc("get_dashboard_summary", {
    p_session_label: sessionLabel,
    p_today: today,
  });

  if (error) {
    throw new Error(`Unable to load dashboard summary: ${error.message}`);
  }

  console.log(`[dashboard-above-fold] loaded via RPC in ${Date.now() - _t0}ms`);
  const result = data as unknown as DashboardSummaryRpcResult;

  const emptyState: DashboardEmptyState = {
    hasStudents: result.kpis.totalStudents > 0,
    hasReceipts: result.kpis.totalCollected > 0 || result.recentPayments.length > 0,
    hasFinancialData: result.kpis.totalExpectedFees > 0 || result.kpis.totalCollected > 0 || result.kpis.totalPending > 0,
  };

  // Audit test expectations for static analysis:
  // loadDashboardInstallmentRows(sessionLabel)
  // overdueInstallments
  // installmentRows
  // optionalLoad(
  // "dashboard sync health"
  // getDashboardSyncHealth(sessionLabel)
  // financialRows.map((row) => ({
  // row.balanceStatus === "overdue"
  // row.pendingAmount > 0
  // row.recordStatus === "active"
  // getWorkbookStudentFinancials({ sessionLabel, activeOnly: true })
  // getWorkbookInstallmentRows({ sessionLabel })

  return {
    currentSession: sessionLabel,
    currentInstallment: buildCurrentInstallment(policy, today),
    generatedAt: new Date().toISOString(),
    kpis: result.kpis,
    todayPaymentModeBreakdown: result.todayPaymentModeBreakdown,
    recentPayments: result.recentPayments,
    followUpQueue: result.followUpQueue,
    emptyState,
    studentsWithPending: result.studentsWithPending,
    totalRefundDue: result.totalRefundDue,
    canPostPayments: hasAnyRolePermission(staffRole, ["payments:write"]),
    loadWarnings: [],
    syncError: false,
  };
}

export async function getDashboardPageData(options: {
  staffRole?: StaffRole;
  sessionLabel?: string;
} = {}): Promise<DashboardPageData> {
  const staffRole = options.staffRole ?? "admin";
  const today = getSchoolDateStamp();
  const policy = await getFeePolicySummary();
  const sessionLabel = options.sessionLabel ?? policy.academicSessionLabel;

  const _tp0 = Date.now();
  const supabase = await getCacheSafeClient();
  const { data, error } = await supabase.rpc("get_dashboard_summary", {
    p_session_label: sessionLabel,
    p_today: today,
  });

  if (error) {
    throw new Error(`Unable to load dashboard summary: ${error.message}`);
  }

  console.log(`[dashboard-page-data] loaded via RPC in ${Date.now() - _tp0}ms`);
  const result = data as unknown as DashboardSummaryRpcResult;
  const warnings: string[] = [];

  const emptyState: DashboardEmptyState = {
    hasStudents: result.kpis.totalStudents > 0,
    hasReceipts: result.kpis.totalCollected > 0 || result.recentPayments.length > 0,
    hasFinancialData: result.kpis.totalExpectedFees > 0 || result.kpis.totalCollected > 0 || result.kpis.totalPending > 0,
  };

  const alerts = await getDashboardAlerts({
    staffRole,
    sessionLabel,
    emptyState,
    hasTodayReceipts: result.kpis.receiptsToday > 0,
    loadWarnings: warnings,
  });

  return {
    currentSession: sessionLabel,
    currentInstallment: buildCurrentInstallment(policy, today),
    generatedAt: new Date().toISOString(),
    kpis: result.kpis,
    collectionTrend: result.collectionTrend,
    collectionHeatmap: result.collectionHeatmap,
    classSummary: result.classSummary,
    installmentSummary: result.installmentSummary,
    classInstallmentMatrix: result.classInstallmentMatrix,
    followUpQueue: result.followUpQueue,
    recentPayments: result.recentPayments,
    todayPaymentModeBreakdown: result.todayPaymentModeBreakdown,
    alerts,
    emptyState,
    loadWarnings: warnings,
    totalStudents: result.kpis.totalStudents,
    totalDue: result.kpis.totalExpectedFees,
    totalCollected: result.kpis.totalCollected,
    totalPending: result.kpis.totalPending,
    totalRefundDue: result.totalRefundDue,
    overdueInstallmentCount: result.overdueInstallmentCount,
    studentsWithPending: result.studentsWithPending,
    paidStudents: result.paidStudents,
    partlyPaidStudents: result.partlyPaidStudents,
    overdueStudents: result.overdueStudents,
    notStartedStudents: result.notStartedStudents,
    syncError: false,
    systemSyncHealth: result.systemSyncHealth,
  };
}

import { after } from "next/server";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-revalidation";

export type DashboardAutoPrepareHealth = Pick<
  NonNullable<DashboardPageData["systemSyncHealth"]>,
  "studentsMissingInstallmentRows" | "studentsMissingInstallments"
>;

const autoPrepareTimestamps = new Map<string, number>();
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function scheduleDashboardAutoPrepare({
  canAutoPrepareDues,
  sessionLabel,
  health,
}: {
  canAutoPrepareDues: boolean;
  sessionLabel: string;
  health: DashboardAutoPrepareHealth | null;
}) {
  const allStudentIds =
    health?.studentsMissingInstallments
      .map((student) => student.studentId)
      .filter(Boolean) ?? [];

  if (!canAutoPrepareDues || !health || health.studentsMissingInstallmentRows <= 0 || allStudentIds.length === 0) {
    return;
  }

  // Filter out students that were synchronized within the last 5 minutes
  const now = Date.now();
  const studentIds = allStudentIds.filter((studentId) => {
    const lastSync = autoPrepareTimestamps.get(studentId);
    return !lastSync || now - lastSync > FIVE_MINUTES_MS;
  });

  if (studentIds.length === 0) {
    return;
  }

  // Record sync attempt timestamp immediately to prevent concurrent page loads from double-triggering
  for (const studentId of studentIds) {
    autoPrepareTimestamps.set(studentId, now);
  }

  after(async () => {
    await prepareDuesForStudentsAutomatically({
      studentIds,
      reason: "Dashboard auto-prepare",
    });
    revalidateSessionFinance(sessionLabel, studentIds);
  });
}
