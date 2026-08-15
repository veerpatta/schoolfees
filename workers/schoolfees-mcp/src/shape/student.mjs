/**
 * Turning a financial view row into something an assistant can answer from.
 *
 * The bug this file exists to end: three unrelated columns in
 * `v_workbook_student_financials` are all called some flavour of "status", and
 * the old mapper picked the wrong one.
 *
 *   record_status         active | inactive | left | graduated   <- enrollment
 *   student_status_label  New | Old                              <- academic-fee tier
 *   status_label          PAID | OVERDUE | PARTLY PAID | ...     <- payment state
 *
 * It exposed `studentStatus: row.student_status_label`, so every question of the
 * form "has this child left?" was answered with the fee tier — live, in
 * production, for admission 2682: `"studentStatus": "New"`. Meanwhile
 * `record_status`, the column that actually answers it, was fetched and dropped.
 *
 * So: `studentStatus` is gone rather than aliased. A wrong name that still
 * resolves keeps producing wrong answers; a missing one produces a question.
 */

import { ENROLLMENT_LABELS } from "../scope.mjs";
import { money, nullableNumber, number } from "../format.mjs";

/** Columns the financial reads need. Kept here so it stays next to the mapper. */
export const FINANCIAL_FIELDS = [
  "student_id",
  "admission_no",
  "student_name",
  "date_of_birth",
  "father_name",
  "mother_name",
  "father_phone",
  "mother_phone",
  "record_status",
  "class_id",
  "class_name",
  "class_label",
  "sort_order",
  "session_label",
  "transport_route_id",
  "transport_route_name",
  "transport_route_code",
  "student_status_code",
  "student_status_label",
  "tuition_fee",
  "transport_fee",
  "academic_fee",
  "gross_base_before_discount",
  "discount_amount",
  "conventional_discount_amount",
  "student_discount_amount",
  "conventional_discount_labels",
  "late_fee_total",
  "late_fee_waiver_amount",
  "total_due",
  "total_paid",
  "total_discount_closeouts",
  "outstanding_amount",
  "base_charge_total",
  "base_outstanding_amount",
  "late_fee_outstanding_amount",
  "next_due_date",
  "next_due_amount",
  "next_due_label",
  "last_payment_date",
  "paid_installment_count",
  "partly_paid_installment_count",
  "overdue_installment_count",
  "inst1_pending",
  "inst2_pending",
  "inst3_pending",
  "inst4_pending",
  "status_label",
  "duplicate_sr_flag",
  "missing_dob_flag",
].join(", ");

export function routeLabel(row) {
  if (!row.transport_route_name) {
    // Transport can be charged without a route being assigned, via a custom
    // amount on the student's fee override. Saying "No Transport" there would
    // contradict the money.
    if (number(row.transport_fee) > 0) {
      return `Custom transport (${money(row.transport_fee)} annual)`;
    }
    return "No Transport";
  }

  return row.transport_route_code
    ? `${row.transport_route_name} (${row.transport_route_code})`
    : row.transport_route_name;
}

/**
 * Where a family sits in the year, derived from money rather than from the
 * timing-oriented status label. Matches the app's money buckets.
 */
export function moneySegment(row) {
  const baseChargeTotal = number(row.base_charge_total ?? row.total_due);
  const totalPaid = number(row.total_paid);
  const closeouts = number(row.total_discount_closeouts);
  const outstanding = number(row.outstanding_amount);

  if (totalPaid === 0 && baseChargeTotal > 0) return "never_paid";
  if (totalPaid > 0 && outstanding > 0) return "partly_paid";
  if (outstanding <= 0 && totalPaid + closeouts > 0 && baseChargeTotal > 0) return "year_clear";
  return "unclassified";
}

export function enrollmentOf(row) {
  const status = row.record_status || null;
  return {
    status,
    label: ENROLLMENT_LABELS[status] || status || "Unknown",
    onRoll: status === "active",
    stillCollectable: status === "active" || number(row.total_paid) > 0,
  };
}

export function mapFinancialRow(row) {
  const baseChargeTotal = number(row.base_charge_total ?? row.total_due);
  const totalPaid = number(row.total_paid);
  const closeouts = number(row.total_discount_closeouts);
  const feesPending = number(row.outstanding_amount);
  const lateFeePending = number(row.late_fee_outstanding_amount);

  return {
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.student_name,
    dateOfBirth: row.date_of_birth || null,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.father_phone,
    motherPhone: row.mother_phone,
    classId: row.class_id,
    classLabel: row.class_label || row.class_name,
    routeLabel: routeLabel(row),
    transportRouteId: row.transport_route_id || null,
    sessionLabel: row.session_label,

    // Enrollment: is this child on the roll, or have they left?
    enrollment: enrollmentOf(row),
    // Fee tier: which academic-fee amount applies. NOT enrollment status.
    feeTier: row.student_status_label || null,
    // Payment state, as the app labels it.
    paymentStatus: row.status_label || "",

    grossBaseBeforeDiscount: number(row.gross_base_before_discount),
    discountAmount: number(row.discount_amount),
    conventionalDiscountAmount: number(row.conventional_discount_amount),
    studentDiscountAmount: number(row.student_discount_amount),
    conventionalDiscountLabels: row.conventional_discount_labels || null,

    // Fees and late fee never merge. `feesExpectedAmount` excludes late fee by
    // design (20260808170000); `totalCollectableAmount` is what a cashier can
    // actually take today.
    feesExpectedAmount: baseChargeTotal,
    baseChargeTotal,
    totalDue: number(row.total_due),
    totalPaid,
    discountCloseoutAmount: closeouts,
    feesPendingAmount: feesPending,
    outstandingAmount: feesPending,
    baseOutstandingAmount: number(row.base_outstanding_amount ?? row.outstanding_amount),
    lateFeeChargedAmount: number(row.late_fee_total),
    lateFeeWaivedAmount: number(row.late_fee_waiver_amount),
    lateFeePendingAmount: lateFeePending,
    totalCollectableAmount: feesPending + lateFeePending,

    nextDueDate: row.next_due_date,
    nextDueAmount: nullableNumber(row.next_due_amount),
    nextDueLabel: row.next_due_label,
    lastPaymentDate: row.last_payment_date,
    paidInstallmentCount: number(row.paid_installment_count),
    partlyPaidInstallmentCount: number(row.partly_paid_installment_count),
    overdueInstallmentCount: number(row.overdue_installment_count),
    installmentPending: {
      inst1: number(row.inst1_pending),
      inst2: number(row.inst2_pending),
      inst3: number(row.inst3_pending),
      inst4: number(row.inst4_pending),
    },
    moneySegment: moneySegment(row),
    dataQuality: {
      duplicateSrFlag: row.duplicate_sr_flag === true,
      missingDobFlag: row.missing_dob_flag === true,
    },
  };
}

/**
 * The two explanations every student row used to carry.
 *
 * They are constant, ~390 characters together, and were emitted per row. In
 * `daily_recovery_digest`, which serialises the same families across several
 * lists, that came to roughly 39 KB of a 44 KB payload — the single largest
 * thing this server sent. A response says them once, in `howToReadThis`.
 */
export const ROW_FIELD_NOTES = {
  feeTier:
    "New or Old decides which academic fee applies (new admission vs returning student). It says nothing about whether the student is still enrolled — read enrollment.status for that.",
  installmentPending:
    "The four scheduled installments only. A carry-forward row from last year is separate and is not included here — compare against feesPendingAmount.",
};

/** Session-wide totals. Fees and late fee stay in separate buckets throughout. */
export function summarizeFinancialRows(rows) {
  const summary = {
    studentCount: 0,
    onRollCount: 0,
    notOnRollCount: 0,
    pendingStudentCount: 0,
    overdueStudentCount: 0,
    lateFeePendingStudentCount: 0,
    totalExpectedFees: 0,
    totalPaid: 0,
    totalFeesPending: 0,
    totalLateFeeCharged: 0,
    totalLateFeeWaived: 0,
    totalLateFeePending: 0,
    totalCollectable: 0,
    totalDiscount: 0,
    totalDiscountCloseouts: 0,
    moneySegments: { never_paid: 0, partly_paid: 0, year_clear: 0, unclassified: 0 },
  };

  for (const row of rows) {
    const feesPending = number(row.outstanding_amount);
    const lateFeePending = number(row.late_fee_outstanding_amount);

    summary.studentCount += 1;
    if (row.record_status === "active") summary.onRollCount += 1;
    else summary.notOnRollCount += 1;

    summary.totalExpectedFees += number(row.base_charge_total ?? row.total_due);
    summary.totalPaid += number(row.total_paid);
    summary.totalFeesPending += feesPending;
    summary.totalLateFeeCharged += number(row.late_fee_total);
    summary.totalLateFeeWaived += number(row.late_fee_waiver_amount);
    summary.totalLateFeePending += lateFeePending;
    summary.totalCollectable += feesPending + lateFeePending;
    summary.totalDiscount += number(row.discount_amount);
    summary.totalDiscountCloseouts += number(row.total_discount_closeouts);
    summary.moneySegments[moneySegment(row)] += 1;

    if (feesPending > 0) summary.pendingStudentCount += 1;
    if (number(row.overdue_installment_count) > 0) summary.overdueStudentCount += 1;
    if (lateFeePending > 0) summary.lateFeePendingStudentCount += 1;
  }

  return summary;
}

/** Grouped rollups (class, route, enrollment status) over the same rows. */
export function groupFinancialRows(rows, keySelector, labelSelector) {
  const groups = new Map();

  for (const row of rows) {
    const key = keySelector(row) || "unknown";
    const current = groups.get(key) || {
      key,
      label: labelSelector(row) || key,
      studentCount: 0,
      onRollCount: 0,
      pendingStudentCount: 0,
      overdueStudentCount: 0,
      totalExpectedFees: 0,
      totalPaid: 0,
      totalFeesPending: 0,
      totalLateFeePending: 0,
      totalDiscount: 0,
    };

    current.studentCount += 1;
    if (row.record_status === "active") current.onRollCount += 1;
    current.totalExpectedFees += number(row.base_charge_total ?? row.total_due);
    current.totalPaid += number(row.total_paid);
    current.totalFeesPending += number(row.outstanding_amount);
    current.totalLateFeePending += number(row.late_fee_outstanding_amount);
    current.totalDiscount += number(row.discount_amount);
    if (number(row.outstanding_amount) > 0) current.pendingStudentCount += 1;
    if (number(row.overdue_installment_count) > 0) current.overdueStudentCount += 1;
    groups.set(key, current);
  }

  return [...groups.values()].sort((left, right) => {
    if (right.totalFeesPending !== left.totalFeesPending) {
      return right.totalFeesPending - left.totalFeesPending;
    }
    return String(left.label).localeCompare(String(right.label), "en", { numeric: true });
  });
}

/** Directory rows carry the segment booleans; the financial view does not. */
export function mapDirectoryRow(row) {
  const segments = Object.keys(row)
    .filter((key) => key.startsWith("seg_") && row[key] === true)
    .map((key) => key.slice(4));

  return {
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.full_name,
    dateOfBirth: row.date_of_birth || null,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.primary_phone,
    motherPhone: row.secondary_phone,
    classId: row.class_id,
    classLabel: row.class_label,
    sessionLabel: row.session_label,
    routeLabel: row.transport_route_name
      ? row.transport_route_code
        ? `${row.transport_route_name} (${row.transport_route_code})`
        : row.transport_route_name
      : number(row.transport_fee) > 0
        ? `Custom transport (${money(row.transport_fee)} annual)`
        : "No Transport",
    enrollment: enrollmentOf({ record_status: row.record_status, total_paid: row.total_paid }),
    feeTier: row.student_status_label || null,
    paymentStatus: row.status_label || "",
    feesExpectedAmount: number(row.base_charge_total),
    totalPaid: number(row.total_paid),
    feesPendingAmount: number(row.outstanding_amount),
    lateFeePendingAmount: number(row.late_fee_outstanding_amount),
    oldBalanceAmount: number(row.old_balance_amount),
    overdueBaseAmount: number(row.overdue_base_amount),
    totalCollectableAmount: number(row.outstanding_amount) + number(row.late_fee_outstanding_amount),
    discountAmount: number(row.discount_amount),
    conventionalDiscountLabels: row.conventional_discount_labels || null,
    lastPaymentDate: row.last_payment_date,
    repaymentPlan: row.repayment_plan_id
      ? {
          planId: row.repayment_plan_id,
          scope: row.repayment_scope,
          paymentStatus: row.repayment_payment_status,
          monthlyAmount: number(row.repayment_monthly_amount),
          remainingBalance: number(row.repayment_remaining_balance),
          catchUpAmount: number(row.repayment_catch_up_amount),
          missedInstallmentCount: number(row.repayment_missed_count),
          nextDueDate: row.repayment_next_due_date,
          endDate: row.repayment_end_date,
          reviewNeeded: row.repayment_plan_review_needed === true,
        }
      : null,
    segments,
  };
}
