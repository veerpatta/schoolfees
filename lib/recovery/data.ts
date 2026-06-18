import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  RECOVERY_STUDENT_STATUSES,
  type RecoveryDue,
  type RecoveryQueueData,
  type RecoveryQueueFilters,
  type RecoveryStudentStatus,
  type StudentRecoveryDueRow,
} from "@/lib/recovery/types";

const STUDENT_ID_CHUNK_SIZE = 100;

type StudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  primary_phone: string | null;
  status: RecoveryStudentStatus;
  class_id: string | null;
  class_ref:
    | { class_name: string; section: string | null; stream_name: string | null }
    | { class_name: string; section: string | null; stream_name: string | null }[]
    | null;
};

type BalanceRow = {
  installment_id: string;
  student_id: string;
  installment_label: string | null;
  due_date: string | null;
  session_label: string | null;
  pending_amount: number | null;
  last_payment_date: string | null;
};

type InstallmentMetaRow = {
  id: string;
  is_carry_forward: boolean | null;
  source_session_label: string | null;
  carry_forward_balance_id: string | null;
};

function toSingleRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildClassLabel(
  ref: { class_name: string; section: string | null; stream_name: string | null } | null,
): string | null {
  if (!ref) {
    return null;
  }
  const segments = [ref.class_name];
  if (ref.section) {
    segments.push(`Section ${ref.section}`);
  }
  if (ref.stream_name) {
    segments.push(ref.stream_name);
  }
  return segments.join(" - ");
}

/** Earliest non-empty session label among a student's dues, for grouping/filtering. */
function earliestSessionLabel(dues: RecoveryDue[]): string | null {
  const labels = dues
    .map((due) => due.sourceSessionLabel ?? due.sessionLabel)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) {
    return null;
  }
  return labels.sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function latestPaymentDate(dues: RecoveryDue[], fallback: Map<string, string | null>): string | null {
  const dates = dues
    .map((due) => fallback.get(due.installmentId) ?? null)
    .filter((date): date is string => Boolean(date));
  if (dates.length === 0) {
    return null;
  }
  return dates.sort((left, right) => right.localeCompare(left))[0] ?? null;
}

/**
 * Builds the full set of recovery rows (all non-active students with pending dues),
 * before any display filter is applied. Returns [] when no student has left owing.
 */
async function loadAllRecoveryRows(studentScopeId?: string): Promise<StudentRecoveryDueRow[]> {
  const supabase = await createClient();

  let studentsQuery = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, father_name, primary_phone, status, class_id, class_ref:classes(class_name, section, stream_name)",
    )
    .in("status", [...RECOVERY_STUDENT_STATUSES]);

  if (studentScopeId) {
    studentsQuery = studentsQuery.eq("id", studentScopeId);
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;
  if (studentsError) {
    throw new Error(`Unable to load recovery students: ${studentsError.message}`);
  }

  const students = (studentsRaw ?? []) as StudentRow[];
  if (students.length === 0) {
    return [];
  }

  const studentById = new Map(students.map((student) => [student.id, student]));
  const studentIds = students.map((student) => student.id);

  // Pending installment balances for those students (any session — a left student's
  // dues live in the session they left from, not the active roster session).
  const balances: BalanceRow[] = [];
  for (const idChunk of chunk(studentIds, STUDENT_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("v_workbook_installment_balances")
      .select(
        "installment_id, student_id, installment_label, due_date, session_label, pending_amount, last_payment_date",
      )
      .in("student_id", idChunk)
      .gt("pending_amount", 0);

    if (error) {
      throw new Error(`Unable to load recovery balances: ${error.message}`);
    }
    balances.push(...((data ?? []) as BalanceRow[]));
  }

  if (balances.length === 0) {
    return [];
  }

  // Carry-forward metadata is on the installments table, not the snapshot view.
  const installmentIds = Array.from(new Set(balances.map((row) => row.installment_id)));
  const metaById = new Map<string, InstallmentMetaRow>();
  for (const idChunk of chunk(installmentIds, STUDENT_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("installments")
      .select("id, is_carry_forward, source_session_label, carry_forward_balance_id")
      .in("id", idChunk);

    if (error) {
      throw new Error(`Unable to load recovery installment metadata: ${error.message}`);
    }
    for (const row of (data ?? []) as InstallmentMetaRow[]) {
      metaById.set(row.id, row);
    }
  }

  const lastPaymentByInstallment = new Map(
    balances.map((row) => [row.installment_id, row.last_payment_date]),
  );
  const duesByStudent = new Map<string, RecoveryDue[]>();
  for (const balance of balances) {
    const meta = metaById.get(balance.installment_id);
    const due: RecoveryDue = {
      installmentId: balance.installment_id,
      installmentLabel: balance.installment_label ?? "Installment",
      dueDate: balance.due_date,
      sessionLabel: balance.session_label,
      sourceSessionLabel: meta?.source_session_label ?? null,
      isCarryForward: Boolean(meta?.is_carry_forward),
      carryForwardBalanceId: meta?.carry_forward_balance_id ?? null,
      remainingAmount: Math.max(0, Math.trunc(balance.pending_amount ?? 0)),
    };
    const list = duesByStudent.get(balance.student_id) ?? [];
    list.push(due);
    duesByStudent.set(balance.student_id, list);
  }

  const rows: StudentRecoveryDueRow[] = [];
  for (const [studentId, dues] of duesByStudent) {
    const student = studentById.get(studentId);
    if (!student) {
      continue;
    }
    const positiveDues = dues.filter((due) => due.remainingAmount > 0);
    const totalRemaining = positiveDues.reduce((sum, due) => sum + due.remainingAmount, 0);
    if (totalRemaining <= 0) {
      continue;
    }

    const carryForwardBalanceIds = Array.from(
      new Set(
        positiveDues
          .map((due) => due.carryForwardBalanceId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    rows.push({
      studentId,
      admissionNo: student.admission_no,
      fullName: student.full_name,
      fatherName: student.father_name,
      phone: student.primary_phone,
      status: student.status,
      classId: student.class_id,
      classLabel: buildClassLabel(toSingleRecord(student.class_ref)),
      sourceSessionLabel: earliestSessionLabel(positiveDues),
      totalRemaining,
      lastPaymentDate: latestPaymentDate(positiveDues, lastPaymentByInstallment),
      hasCarryForward: positiveDues.some((due) => due.isCarryForward),
      carryForwardBalanceIds,
      dues: positiveDues.sort((left, right) =>
        (left.dueDate ?? "").localeCompare(right.dueDate ?? ""),
      ),
      collectable: totalRemaining > 0,
    });
  }

  return rows.sort(
    (left, right) =>
      right.totalRemaining - left.totalRemaining || left.fullName.localeCompare(right.fullName),
  );
}

function matchesFilters(row: StudentRecoveryDueRow, filters: RecoveryQueueFilters): boolean {
  if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.includes(row.status)) {
    return false;
  }
  if (filters.classId && row.classId !== filters.classId) {
    return false;
  }
  if (filters.sourceSessionLabel) {
    const matchesSession = row.dues.some(
      (due) =>
        due.sourceSessionLabel === filters.sourceSessionLabel ||
        due.sessionLabel === filters.sourceSessionLabel,
    );
    if (!matchesSession) {
      return false;
    }
  }
  if (filters.query) {
    const needle = filters.query.trim().toLowerCase();
    if (needle) {
      const haystack = [row.admissionNo, row.fullName, row.phone ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
  }
  return true;
}

export async function getRecoveryQueue(
  filters: RecoveryQueueFilters = {},
): Promise<RecoveryQueueData> {
  const allRows = await loadAllRecoveryRows();

  const statusCounts: Record<RecoveryStudentStatus, number> = {
    left: 0,
    graduated: 0,
    inactive: 0,
  };
  const sessionSet = new Set<string>();
  const classMap = new Map<string, string>();
  for (const row of allRows) {
    statusCounts[row.status] += 1;
    for (const due of row.dues) {
      const session = due.sourceSessionLabel ?? due.sessionLabel;
      if (session) {
        sessionSet.add(session);
      }
    }
    if (row.classId) {
      classMap.set(row.classId, row.classLabel ?? row.classId);
    }
  }

  const rows = allRows.filter((row) => matchesFilters(row, filters));

  return {
    rows,
    totalStudents: rows.length,
    totalRemaining: rows.reduce((sum, row) => sum + row.totalRemaining, 0),
    statusCounts,
    sessionOptions: Array.from(sessionSet).sort((left, right) => right.localeCompare(left)),
    classOptions: Array.from(classMap.entries())
      .map(([classId, classLabel]) => ({ classId, classLabel }))
      .sort((left, right) => left.classLabel.localeCompare(right.classLabel)),
  };
}

/**
 * A single left student's recoverable position — used by the recovery payment flow
 * to confirm the student has left and has existing pending dues to allocate to.
 */
export async function getStudentRecoveryDues(
  studentId: string,
): Promise<StudentRecoveryDueRow | null> {
  const normalized = studentId.trim();
  if (!normalized) {
    return null;
  }
  const rows = await loadAllRecoveryRows(normalized);
  return rows[0] ?? null;
}
