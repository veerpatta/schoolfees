/**
 * Receipts, and the two rules that apply to every collection figure.
 *
 * 1. A `discount`-mode receipt is a write-off, not cash. Adding it to "collected"
 *    overstates what came through the door.
 * 2. A fully reversed receipt stays visible and marked, and is excluded from
 *    every collection figure. It is never deleted and never silently subtracted.
 *
 * `get_dashboard_summary` applies both. The old MCP applied neither, so its
 * "recent payments" total and the Dashboard's could not agree.
 */

import { number } from "../format.mjs";
import { chunk, selectAll } from "../supabase.mjs";

export const RECEIPT_FIELDS = [
  "id",
  "receipt_number",
  "student_id",
  "payment_date",
  "created_at",
  "payment_mode",
  "total_amount",
  "reference_number",
  "notes",
  "received_by",
].join(", ");

export function isWriteOff(row) {
  return row.payment_mode === "discount";
}

/**
 * Reversal totals for a set of receipts. A receipt is fully reversed when the
 * reversed amount covers it; partial reversals reduce it without hiding it.
 */
export async function getReversalTotals(env, receiptIds) {
  const totals = new Map();
  if (receiptIds.length === 0) return totals;

  for (const ids of chunk(receiptIds, 100)) {
    const { rows } = await selectAll(env, "v_receipt_reversal_totals", {
      select: "receipt_id,reversed_amount",
      receipt_id: `in.(${ids.join(",")})`,
    });
    for (const row of rows) {
      totals.set(row.receipt_id, number(row.reversed_amount));
    }
  }

  return totals;
}

export function mapReceiptRow(row, { reversedAmount = 0, student = null } = {}) {
  const total = number(row.total_amount);
  const writeOff = isWriteOff(row);
  const fullyReversed = reversedAmount >= total && total > 0;

  return {
    receiptId: row.id,
    receiptNumber: row.receipt_number,
    studentId: row.student_id,
    studentName: student?.full_name ?? student?.studentName ?? null,
    admissionNo: student?.admission_no ?? student?.admissionNo ?? null,
    classLabel: student?.classLabel ?? null,
    fatherName: student?.father_name ?? null,
    fatherPhone: student?.primary_phone ?? null,
    paymentDate: row.payment_date,
    createdAt: row.created_at,
    paymentMode: row.payment_mode,
    receiptTotalAmount: total,
    // The three amounts a collection report must keep apart.
    cashCollectedAmount: writeOff || fullyReversed ? 0 : total - reversedAmount,
    writeOffAmount: writeOff ? total : 0,
    reversedAmount,
    isWriteOff: writeOff,
    isFullyReversed: fullyReversed,
    isPartlyReversed: reversedAmount > 0 && !fullyReversed,
    referenceNumber: row.reference_number || null,
    receivedBy: row.received_by || null,
    notes: row.notes || null,
  };
}

/** Totals over mapped receipts, with the buckets kept separate. */
export function summarizeReceipts(receipts) {
  return receipts.reduce(
    (acc, receipt) => {
      acc.receiptCount += 1;
      acc.cashCollected += receipt.cashCollectedAmount;
      acc.writeOffAmount += receipt.writeOffAmount;
      acc.reversedAmount += receipt.reversedAmount;
      acc.byMode[receipt.paymentMode] =
        (acc.byMode[receipt.paymentMode] || 0) + receipt.cashCollectedAmount;
      acc.students.add(receipt.studentId);
      return acc;
    },
    {
      receiptCount: 0,
      cashCollected: 0,
      writeOffAmount: 0,
      reversedAmount: 0,
      byMode: {},
      students: new Set(),
    },
  );
}

export function finalizeReceiptSummary(summary) {
  const { students, ...rest } = summary;
  return {
    ...rest,
    studentCount: students.size,
    note: "cashCollected excludes discount-mode write-offs and reversed amounts. Those are reported separately and never folded into collection.",
  };
}

/** Identity for a set of student ids, for labelling receipts. */
export async function getStudentIdentities(env, studentIds) {
  const identities = new Map();
  if (studentIds.length === 0) return identities;

  for (const ids of chunk([...new Set(studentIds)], 100)) {
    const { rows } = await selectAll(env, "students", {
      select: "id,full_name,admission_no,father_name,primary_phone,status",
      id: `in.(${ids.join(",")})`,
    });
    for (const row of rows) identities.set(row.id, row);
  }

  return identities;
}

/** Payment allocations for receipts — which installment each rupee landed on. */
export async function getAllocationsByReceipt(env, receiptIds) {
  const byReceipt = new Map();
  if (receiptIds.length === 0) return byReceipt;

  for (const ids of chunk(receiptIds, 100)) {
    const { rows } = await selectAll(env, "payments", {
      select:
        "id,receipt_id,student_id,installment_id,amount,notes,created_at,discount_applied_at_posting,waiver_applied_at_posting,pending_before_posting,pending_after_posting",
      receipt_id: `in.(${ids.join(",")})`,
      order: "created_at.asc",
    });
    for (const row of rows) {
      const bucket = byReceipt.get(row.receipt_id) || [];
      bucket.push(row);
      byReceipt.set(row.receipt_id, bucket);
    }
  }

  return byReceipt;
}

export function mapAllocation(row, installment) {
  return {
    paymentId: row.id,
    installmentId: row.installment_id,
    installmentLabel: installment?.installmentLabel || null,
    dueDate: installment?.dueDate || null,
    amount: number(row.amount),
    discountAppliedAtPosting: number(row.discount_applied_at_posting),
    lateFeeWaivedAtPosting: number(row.waiver_applied_at_posting),
    // Frozen at posting time, so a reprinted receipt shows the balance the
    // parent was told — it never re-reads today's views.
    pendingBeforePosting:
      row.pending_before_posting === null || row.pending_before_posting === undefined
        ? null
        : number(row.pending_before_posting),
    pendingAfterPosting:
      row.pending_after_posting === null || row.pending_after_posting === undefined
        ? null
        : number(row.pending_after_posting),
    notes: row.notes || null,
  };
}

export function mapAdjustment(row) {
  return {
    adjustmentId: row.id,
    paymentId: row.payment_id,
    installmentId: row.installment_id,
    adjustmentType: row.adjustment_type,
    amountDelta: number(row.amount_delta),
    reason: row.reason,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapRefund(row) {
  return {
    refundId: row.id,
    receiptId: row.receipt_id,
    refundDate: row.refund_date,
    requestedAmount: number(row.requested_amount),
    refundMethod: row.refund_method,
    refundReference: row.refund_reference,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    processedAt: row.processed_at,
  };
}

/** Public receipt verification page, useful to hand a parent. */
export function verifyUrl(env, receiptNumber) {
  const base = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return base && receiptNumber ? `${base}/r/${encodeURIComponent(receiptNumber)}` : null;
}
