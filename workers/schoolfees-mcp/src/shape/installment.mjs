/**
 * Installment rows, and the reads that fetch them.
 *
 * Two things the old server got wrong here:
 *
 * 1. `getInstallmentRows` filtered on `student_id` alone, with no
 *    `session_label`. A student promoted from an earlier session therefore had
 *    every session's installments returned inside a payload whose surrounding
 *    financial row was session-scoped — the parts of one answer disagreed.
 * 2. Nothing said that a carry-forward row is last year's tuition riding on this
 *    year's ledger. `inst1..4` plus the carry-forward is the real total, and a
 *    reader who assumed four installments got a short number.
 */

import { chunk, rpc, selectAll } from "../supabase.mjs";
import { number } from "../format.mjs";

export const INSTALLMENT_FIELDS = [
  "installment_id",
  "student_id",
  "admission_no",
  "student_name",
  "session_label",
  "class_id",
  "class_label",
  "installment_no",
  "installment_label",
  "is_carry_forward",
  "source_session_label",
  "is_emi_late_fee",
  "due_date",
  "base_charge",
  "paid_amount",
  "applied_amount",
  "discount_closeout_amount",
  "adjustment_amount",
  "raw_late_fee",
  "waiver_applied",
  "final_late_fee",
  "total_charge",
  "pending_amount",
  "late_fee_pending",
  "total_pending",
  "balance_status",
  "late_fee_status",
  "last_payment_date",
].join(", ");

export function mapInstallmentRow(row) {
  const feesPending = number(row.pending_amount);
  const lateFeePending = number(row.late_fee_pending);

  return {
    installmentId: row.installment_id,
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.student_name,
    sessionLabel: row.session_label,
    classId: row.class_id,
    classLabel: row.class_label,
    installmentNo: row.installment_no,
    installmentLabel: row.installment_label,
    isCarryForward: row.is_carry_forward === true,
    sourceSessionLabel: row.source_session_label || null,
    isEmiLateFee: row.is_emi_late_fee === true,
    dueDate: row.due_date,
    baseCharge: number(row.base_charge),
    paidAmount: number(row.paid_amount),
    appliedAmount: number(row.applied_amount ?? row.paid_amount),
    discountCloseoutAmount: number(row.discount_closeout_amount),
    adjustmentAmount: number(row.adjustment_amount),
    lateFeeRawAmount: number(row.raw_late_fee),
    lateFeeWaivedAmount: number(row.waiver_applied),
    lateFeeAmount: number(row.final_late_fee),
    totalCharge: number(row.total_charge),
    feesPendingAmount: feesPending,
    lateFeePendingAmount: lateFeePending,
    totalCollectableAmount: number(row.total_pending ?? feesPending + lateFeePending),
    // balance_status describes the base charge only, and 'overdue' outranks
    // 'partial' — a partly paid past-due installment reads overdue, not partial.
    balanceStatus: row.balance_status,
    lateFeeStatus: row.late_fee_status || "none",
    lastPaymentDate: row.last_payment_date,
  };
}

/** One student's installments, for one session. The session filter is the fix. */
export async function getStudentInstallments(env, studentId, sessionLabel) {
  const params = {
    select: INSTALLMENT_FIELDS,
    student_id: `eq.${studentId}`,
    order: "due_date.asc,installment_no.asc",
  };
  if (sessionLabel) params.session_label = `eq.${sessionLabel}`;

  const { rows } = await selectAll(env, "v_workbook_installment_balances", params);
  return rows.map(mapInstallmentRow);
}

/**
 * Installments for a named set of students, indexed by student.
 *
 * One chunked query per 100 ids, run together, instead of one request per
 * student one after another. The caller that needed this was issuing up to 50
 * serial round trips to decorate a 50-row list.
 */
export async function getInstallmentsForStudents(env, studentIds, sessionLabel) {
  const byStudent = new Map();
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (ids.length === 0) return byStudent;

  const pages = await Promise.all(
    chunk(ids, 100).map((idChunk) =>
      selectAll(env, "v_workbook_installment_balances", {
        select: INSTALLMENT_FIELDS,
        session_label: `eq.${sessionLabel}`,
        student_id: `in.(${idChunk.join(",")})`,
        order: "due_date.asc,installment_no.asc,installment_id.asc",
      }),
    ),
  );

  for (const page of pages) {
    for (const row of page.rows) {
      const mapped = mapInstallmentRow(row);
      const bucket = byStudent.get(mapped.studentId) || [];
      bucket.push(mapped);
      byStudent.set(mapped.studentId, bucket);
    }
  }

  return byStudent;
}

/** Every installment in a session, indexed by student. */
export async function getSessionInstallmentsByStudent(env, sessionLabel) {
  const { rows, truncated } = await selectAll(env, "v_workbook_installment_balances", {
    select: INSTALLMENT_FIELDS,
    session_label: `eq.${sessionLabel}`,
    order: "due_date.asc,installment_no.asc,installment_id.asc",
  });

  const byStudent = new Map();
  for (const row of rows) {
    const mapped = mapInstallmentRow(row);
    const bucket = byStudent.get(mapped.studentId) || [];
    bucket.push(mapped);
    byStudent.set(mapped.studentId, bucket);
  }

  return { byStudent, truncated };
}

/**
 * The Payment Desk's own read model, so an assistant can quote exactly what a
 * cashier would be shown for this student. Read-only: it previews an allocation,
 * it does not post one.
 */
export async function previewAllocation(env, studentId, paymentDate) {
  const rows = await rpc(env, "preview_workbook_payment_allocation", {
    p_student_id: studentId,
    ...(paymentDate ? { p_payment_date: paymentDate } : {}),
  });
  return (Array.isArray(rows) ? rows : []).map(mapInstallmentRow);
}

/** Splits current-year from carry-forward, which is `is_carry_forward`, never session_label. */
export function splitCurrentAndCarryForward(installments) {
  const currentYear = installments.filter((row) => !row.isCarryForward);
  const carryForward = installments.filter((row) => row.isCarryForward);
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

  return {
    currentYear: {
      installmentCount: currentYear.length,
      charged: sum(currentYear, "totalCharge"),
      paid: sum(currentYear, "appliedAmount"),
      feesPending: sum(currentYear, "feesPendingAmount"),
      lateFeePending: sum(currentYear, "lateFeePendingAmount"),
    },
    previousYear: {
      installmentCount: carryForward.length,
      sourceSessions: [...new Set(carryForward.map((row) => row.sourceSessionLabel).filter(Boolean))],
      charged: sum(carryForward, "totalCharge"),
      paid: sum(carryForward, "appliedAmount"),
      feesPending: sum(carryForward, "feesPendingAmount"),
      lateFeePending: sum(carryForward, "lateFeePendingAmount"),
      note: "Last year's unpaid tuition, carried onto this year's ledger. Carry-forward rows never accrue a late fee.",
    },
  };
}
