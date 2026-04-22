import "server-only";

import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getDashboardPageData } from "@/lib/dashboard/data";
import { createClient } from "@/lib/supabase/server";

type DueStudentRow = {
  student_id: string;
  full_name: string;
  admission_no: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  due_date: string;
  outstanding_amount: number;
  balance_status: "partial" | "overdue" | "pending";
};

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

type TodayReceiptRow = {
  id: string;
  receipt_number: string;
  total_amount: number;
};

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
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
    balanceStatus: "partial" | "overdue" | "pending";
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
  const today = getSchoolDateStamp();

  const [
    dashboard,
    recentConfigChanges,
    { data: dueRowsRaw, error: dueRowsError },
    { data: importRowsRaw, error: importRowsError },
    { data: regenRowsRaw, error: regenRowsError },
    { data: todayReceiptsRaw, error: todayReceiptsError },
  ] = await Promise.all([
    getDashboardPageData(),
    getRecentConfigChangeLog(6),
    supabase
      .from("v_installment_balances")
      .select(
        "student_id, full_name, admission_no, class_name, section, stream_name, due_date, outstanding_amount, balance_status",
      )
      .gt("outstanding_amount", 0)
      .in("balance_status", ["partial", "overdue", "pending"])
      .order("due_date", { ascending: true })
      .limit(40),
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
    supabase
      .from("receipts")
      .select("id, receipt_number, total_amount")
      .eq("payment_date", today)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (dueRowsError) {
    throw new Error(`Unable to load today’s due list: ${dueRowsError.message}`);
  }

  if (importRowsError) {
    throw new Error(`Unable to load import anomalies: ${importRowsError.message}`);
  }

  if (regenRowsError) {
    throw new Error(`Unable to load ledger recalculation history: ${regenRowsError.message}`);
  }

  if (todayReceiptsError) {
    throw new Error(`Unable to load today’s collection summary: ${todayReceiptsError.message}`);
  }

  const dueRows = (dueRowsRaw ?? []) as DueStudentRow[];
  const importRows = (importRowsRaw ?? []) as ImportBatchRow[];
  const regenRows = (regenRowsRaw ?? []) as LedgerRegenerationBatchRow[];
  const todayReceipts = (todayReceiptsRaw ?? []) as TodayReceiptRow[];

  return {
    today,
    dashboard,
    studentsDueToday: dueRows
      .filter((row) => row.due_date === today)
      .slice(0, 8)
      .map((row) => ({
        studentId: row.student_id,
        fullName: row.full_name,
        admissionNo: row.admission_no,
        classLabel: buildClassLabel(row),
        dueDate: row.due_date,
        outstandingAmount: row.outstanding_amount,
        balanceStatus: row.balance_status,
      })),
    overdueStudents: dueRows
      .filter((row) => row.due_date < today || row.balance_status === "overdue")
      .slice(0, 8)
      .map((row) => ({
        studentId: row.student_id,
        fullName: row.full_name,
        admissionNo: row.admission_no,
        classLabel: buildClassLabel(row),
        dueDate: row.due_date,
        outstandingAmount: row.outstanding_amount,
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
      receiptCount: todayReceipts.length,
      totalAmount: todayReceipts.reduce((sum, row) => sum + row.total_amount, 0),
      lastReceiptId: todayReceipts[0]?.id ?? null,
      lastReceiptNumber: todayReceipts[0]?.receipt_number ?? null,
    },
  };
}
