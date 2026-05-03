import "server-only";

import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getDashboardPageData } from "@/lib/dashboard/data";
import { createClient } from "@/lib/supabase/server";
import { getWorkbookInstallmentRows, getWorkbookTransactions } from "@/lib/workbook/data";

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

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

export type OfficeHomeData = {
  today: string;
  dashboard: Awaited<ReturnType<typeof getDashboardPageData>>;
  studentsDueToday: Array<{
    studentId: string;
    fullName: string;
    admissionNo: string;
    classLabel: string;
    dueDate: string;
    outstandingAmount: number;
    balanceStatus: "partial" | "overdue" | "pending" | "waived" | "paid";
  }>;
  overdueStudents: Array<{
    studentId: string;
    fullName: string;
    admissionNo: string;
    classLabel: string;
    dueDate: string;
    outstandingAmount: number;
  }>;
  importAnomalies: Array<{
    id: string;
    filename: string;
    issueCount: number;
    createdAt: string;
  }>;
  pendingConfigChanges: Awaited<ReturnType<typeof getRecentConfigChangeLog>>;
  ledgerRegenerationBatches: Array<{
    id: string;
    policyRevisionLabel: string;
    reason: string;
    status: LedgerRegenerationBatchRow["status"];
    createdAt: string;
    rowsRequiringReview: number;
    rowsRecalculated: number;
    affectedStudents: number;
  }>;
  todayCollection: {
    receiptCount: number;
    totalAmount: number;
    lastReceiptId: string | null;
    lastReceiptNumber: string | null;
  };
};

export async function getOfficeHomeData(): Promise<OfficeHomeData> {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const sessionLabel = policy.academicSessionLabel;
  const today = getSchoolDateStamp();

  const [
    dashboard,
    recentConfigChanges,
    openInstallments,
    overdueInstallments,
    todayTransactions,
    { data: importRowsRaw, error: importRowsError },
    { data: regenRowsRaw, error: regenRowsError },
  ] = await Promise.all([
    getDashboardPageData(),
    getRecentConfigChangeLog(6),
    getWorkbookInstallmentRows({ pendingOnly: true, sessionLabel }),
    getWorkbookInstallmentRows({ overdueOnly: true, pendingOnly: true, sessionLabel }),
    getWorkbookTransactions({ todayOnly: true, sessionLabel }),
    supabase
      .from("import_batches")
      .select("id, filename, status, invalid_rows, duplicate_rows, failed_rows, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("ledger_regeneration_batches")
      .select("id, policy_revision_label, reason, status, created_at, preview_summary")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (importRowsError) {
    throw new Error(`Unable to load import anomalies: ${importRowsError.message}`);
  }

  if (regenRowsError) {
    throw new Error(`Unable to load ledger recalculation history: ${regenRowsError.message}`);
  }

  const importRows = (importRowsRaw ?? []) as ImportBatchRow[];
  const regenRows = (regenRowsRaw ?? []) as LedgerRegenerationBatchRow[];

  return {
    today,
    dashboard,
    studentsDueToday: openInstallments
      .filter((row) => row.pendingAmount > 0 && row.dueDate === today)
      .slice(0, 8)
      .map((row) => ({
        studentId: row.studentId,
        fullName: row.studentName,
        admissionNo: row.admissionNo,
        classLabel: row.classLabel,
        dueDate: row.dueDate,
        outstandingAmount: row.pendingAmount,
        balanceStatus: row.balanceStatus,
      })),
    overdueStudents: overdueInstallments.slice(0, 8).map((row) => ({
      studentId: row.studentId,
      fullName: row.studentName,
      admissionNo: row.admissionNo,
      classLabel: row.classLabel,
      dueDate: row.dueDate,
      outstandingAmount: row.pendingAmount,
    })),
    importAnomalies: importRows
      .filter((row) => row.invalid_rows + row.duplicate_rows + row.failed_rows > 0)
      .map((row) => ({
        id: row.id,
        filename: row.filename,
        issueCount: row.invalid_rows + row.duplicate_rows + row.failed_rows,
        createdAt: row.created_at,
      })),
    pendingConfigChanges: recentConfigChanges.filter((item) => item.status === "preview_ready"),
    ledgerRegenerationBatches: regenRows.map((row) => ({
      id: row.id,
      policyRevisionLabel: row.policy_revision_label,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      rowsRequiringReview: Number(row.preview_summary?.rowsRequiringReview ?? 0),
      rowsRecalculated: Number(row.preview_summary?.rowsRecalculated ?? 0),
      affectedStudents: Number(row.preview_summary?.affectedStudents ?? 0),
    })),
    todayCollection: {
      receiptCount: todayTransactions.length,
      totalAmount: todayTransactions.reduce((sum, row) => sum + row.totalAmount, 0),
      lastReceiptId: todayTransactions[0]?.receiptId ?? null,
      lastReceiptNumber: todayTransactions[0]?.receiptNumber ?? null,
    },
  };
}
