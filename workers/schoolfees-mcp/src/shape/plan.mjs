/**
 * EMI repayment plans.
 *
 * A plan is never edited in place: rescheduling writes a replacement and
 * supersedes the old one, so the schedule a parent was shown stays on file.
 * History therefore includes active, superseded and cancelled records, and a
 * tool that returned only the live plan would erase the earlier agreement.
 *
 * A family on an on-track plan must not be chased for the whole underlying
 * balance — only for what the plan says is due now, plus any dues the plan does
 * not cover. That is what `coveredInstallmentIds` is for.
 */

import { chunk, selectAll } from "../supabase.mjs";
import { nullableNumber, number } from "../format.mjs";

export const PLAN_FIELDS = [
  "plan_id",
  "student_id",
  "session_label",
  "scope",
  "lifecycle",
  "opening_balance",
  "monthly_amount",
  "first_due_date",
  "term_months",
  "final_installment_amount",
  "waived_late_fee_total",
  "reason",
  "supersedes_plan_id",
  "superseded_by_plan_id",
  "activated_at",
  "activated_by_label",
  "cancelled_at",
  "cancellation_reason",
  "item_count",
  "remaining_balance",
  "paid_to_date",
  "expected_to_date",
  "expected_overdue",
  "catch_up_amount",
  "missed_installment_count",
  "paid_installment_count",
  "next_due_sequence_no",
  "next_due_date",
  "next_due_amount",
  "end_date",
  "payment_status",
  "plan_review_needed",
].join(", ");

export function mapPlanRow(row) {
  return {
    planId: row.plan_id,
    studentId: row.student_id,
    sessionLabel: row.session_label,
    scope: row.scope,
    lifecycle: row.lifecycle,
    openingBalance: number(row.opening_balance),
    monthlyAmount: number(row.monthly_amount),
    firstDueDate: row.first_due_date,
    termMonths: number(row.term_months),
    finalInstallmentAmount: number(row.final_installment_amount),
    waivedLateFeeTotal: number(row.waived_late_fee_total),
    reason: row.reason,
    supersedesPlanId: row.supersedes_plan_id || null,
    supersededByPlanId: row.superseded_by_plan_id || null,
    activatedAt: row.activated_at,
    activatedByLabel: row.activated_by_label || null,
    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,
    itemCount: number(row.item_count),
    remainingBalance: number(row.remaining_balance),
    paidToDate: number(row.paid_to_date),
    expectedToDate: number(row.expected_to_date),
    expectedOverdue: number(row.expected_overdue),
    catchUpAmount: number(row.catch_up_amount),
    missedInstallmentCount: number(row.missed_installment_count),
    paidInstallmentCount: number(row.paid_installment_count),
    nextDueSequenceNo: nullableNumber(row.next_due_sequence_no),
    nextDueDate: row.next_due_date,
    nextDueAmount: nullableNumber(row.next_due_amount),
    endDate: row.end_date,
    paymentStatus: row.payment_status,
    reviewNeeded: Boolean(row.plan_review_needed),
  };
}

const MISSING_VIEW = /v_student_repayment_plan_status|PGRST205|42P01|404/i;

export async function getActivePlan(env, { studentId, sessionLabel }) {
  try {
    const { rows } = await selectAll(env, "v_student_repayment_plan_status", {
      select: PLAN_FIELDS,
      student_id: `eq.${studentId}`,
      session_label: `eq.${sessionLabel}`,
      lifecycle: "eq.active",
      limit: 1,
    });
    return { available: true, plan: rows[0] ? mapPlanRow(rows[0]) : null };
  } catch (error) {
    if (MISSING_VIEW.test(String(error?.message || error))) {
      return { available: false, plan: null, note: "Repayment-plan status is unavailable." };
    }
    throw error;
  }
}

/** Every plan for a student, newest first — the audit trail of rescheduling. */
export async function getPlanHistory(env, { studentId, sessionLabel }) {
  try {
    const { rows } = await selectAll(env, "v_student_repayment_plan_status", {
      select: PLAN_FIELDS,
      student_id: `eq.${studentId}`,
      session_label: `eq.${sessionLabel}`,
      order: "activated_at.desc",
      limit: 100,
    });
    return { available: true, plans: rows.map(mapPlanRow) };
  } catch (error) {
    if (MISSING_VIEW.test(String(error?.message || error))) {
      return { available: false, plans: [], note: "Repayment-plan history is unavailable." };
    }
    throw error;
  }
}

/**
 * Active plans for a session plus the installments each one covers, so recovery
 * can chase what falls outside the plan rather than the full balance.
 */
export async function getPlanCoverage(env, sessionLabel, wantedStudentIds) {
  const { rows } = await selectAll(env, "v_student_repayment_plan_status", {
    select: PLAN_FIELDS,
    session_label: `eq.${sessionLabel}`,
    lifecycle: "eq.active",
  });

  const wanted = new Set(wantedStudentIds);
  const plans = rows.filter((row) => wanted.has(row.student_id)).map(mapPlanRow);
  const coverage = new Map(
    plans.map((plan) => [plan.studentId, { plan, coveredInstallmentIds: new Set() }]),
  );

  for (const ids of chunk(plans.map((plan) => plan.planId), 100)) {
    if (ids.length === 0) continue;
    const { rows: items } = await selectAll(env, "student_repayment_plan_items", {
      select: "plan_id,student_id,installment_id",
      plan_id: `in.(${ids.join(",")})`,
    });
    for (const item of items) {
      coverage.get(item.student_id)?.coveredInstallmentIds.add(item.installment_id);
    }
  }

  return coverage;
}
