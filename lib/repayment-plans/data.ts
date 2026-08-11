import "server-only";

import { createClient } from "@/lib/supabase/server";

import type {
  RepaymentPlanCollectionContext,
  RepaymentPlanDetail,
  RepaymentPlanItem,
  RepaymentPlanPreview,
  RepaymentPlanSummary,
  RepaymentScheduleRow,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Every column of `v_student_repayment_plan_status`. Selecting explicitly keeps
 * the mapper honest when the view grows.
 */
const PLAN_STATUS_COLUMNS = `
  plan_id, student_id, session_label, scope, lifecycle,
  opening_balance, monthly_amount, first_due_date, term_months,
  final_installment_amount, waived_late_fee_total, reason,
  supersedes_plan_id, superseded_by_plan_id,
  activated_at, activated_by, activated_by_label,
  cancelled_at, cancellation_reason,
  item_count, remaining_balance, paid_to_date,
  expected_to_date, expected_overdue, catch_up_amount,
  missed_installment_count, paid_installment_count,
  next_due_sequence_no, next_due_date, next_due_amount,
  end_date, payment_status, plan_review_needed
`;

type PlanStatusRow = Record<string, unknown>;

function toInt(value: unknown) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toNullableInt(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapPlanSummary(row: PlanStatusRow): RepaymentPlanSummary {
  return {
    planId: String(row.plan_id),
    studentId: String(row.student_id),
    sessionLabel: String(row.session_label ?? ""),
    scope: row.scope === "old_balance_only" ? "old_balance_only" : "old_and_current",
    lifecycle:
      row.lifecycle === "cancelled" || row.lifecycle === "superseded"
        ? row.lifecycle
        : "active",
    paymentStatus:
      row.payment_status === "upcoming" ||
      row.payment_status === "due" ||
      row.payment_status === "behind" ||
      row.payment_status === "completed"
        ? row.payment_status
        : "on_track",

    openingBalance: toInt(row.opening_balance),
    monthlyAmount: toInt(row.monthly_amount),
    firstDueDate: String(row.first_due_date ?? ""),
    termMonths: toInt(row.term_months),
    finalInstallmentAmount: toInt(row.final_installment_amount),
    endDate: toText(row.end_date),

    waivedLateFeeTotal: toInt(row.waived_late_fee_total),

    itemCount: toInt(row.item_count),
    remainingBalance: toInt(row.remaining_balance),
    paidToDate: toInt(row.paid_to_date),
    expectedToDate: toInt(row.expected_to_date),
    catchUpAmount: toInt(row.catch_up_amount),
    missedInstallmentCount: toInt(row.missed_installment_count),
    paidInstallmentCount: toInt(row.paid_installment_count),

    nextDueSequenceNo: toNullableInt(row.next_due_sequence_no),
    nextDueDate: toText(row.next_due_date),
    nextDueAmount: toNullableInt(row.next_due_amount),

    reason: String(row.reason ?? ""),
    activatedAt: String(row.activated_at ?? ""),
    activatedByLabel: toText(row.activated_by_label),
    cancelledAt: toText(row.cancelled_at),
    cancellationReason: toText(row.cancellation_reason),
    supersedesPlanId: toText(row.supersedes_plan_id),
    supersededByPlanId: toText(row.superseded_by_plan_id),

    planReviewNeeded: row.plan_review_needed === true,
  };
}

/**
 * Price each scheduled row against money actually collected.
 *
 * The schedule is a running total, so a row is settled once `paidToDate`
 * reaches its cumulative amount. "Late" is decided by whether the row's due
 * date has already passed at the moment it gets covered — which is why a fully
 * paid plan can still show late rows in its history.
 */
export function buildScheduleRows(payload: {
  schedule: Array<{ sequenceNo: number; dueDate: string; amount: number }>;
  paidToDate: number;
  today: string;
}): RepaymentScheduleRow[] {
  let cumulative = 0;

  return payload.schedule
    .slice()
    .sort((left, right) => left.sequenceNo - right.sequenceNo)
    .map((row) => {
      const coveredBefore = cumulative;
      cumulative += row.amount;

      const paidAmount = Math.max(
        Math.min(payload.paidToDate - coveredBefore, row.amount),
        0,
      );
      const isPast = row.dueDate < payload.today;

      let status: RepaymentScheduleRow["status"];

      if (paidAmount >= row.amount) {
        status = isPast ? "paid_late" : "paid_on_time";
      } else if (paidAmount > 0) {
        status = "partial";
      } else if (isPast) {
        status = "missed";
      } else {
        status = "upcoming";
      }

      return { ...row, paidAmount, status };
    });
}

/**
 * `buildScheduleRows` cannot tell "paid before the due date" from "paid after"
 * on its own, because the plan only knows totals. A row that is fully covered
 * and whose due date has passed is reported `paid_late` only when the money
 * arrived after that date; receipts settle that question.
 */
function refineLatePayments(
  rows: RepaymentScheduleRow[],
  receipts: Array<{ paymentDate: string; contributionAmount: number }>,
) {
  const ordered = receipts
    .slice()
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate));

  let cumulativeTarget = 0;
  let receiptIndex = 0;
  let runningPaid = 0;

  return rows.map((row) => {
    cumulativeTarget += row.amount;

    if (row.status !== "paid_late" && row.status !== "paid_on_time") {
      return row;
    }

    while (runningPaid < cumulativeTarget && receiptIndex < ordered.length) {
      runningPaid += ordered[receiptIndex].contributionAmount;
      receiptIndex += 1;
    }

    const settlingReceipt = ordered[Math.max(receiptIndex - 1, 0)];

    if (!settlingReceipt) {
      return row;
    }

    return {
      ...row,
      status: settlingReceipt.paymentDate > row.dueDate ? "paid_late" : "paid_on_time",
    } satisfies RepaymentScheduleRow;
  });
}

async function fetchPlanSummary(
  supabase: SupabaseServerClient,
  filters: { studentId?: string; planId?: string; activeOnly?: boolean },
) {
  let query = supabase.from("v_student_repayment_plan_status").select(PLAN_STATUS_COLUMNS);

  if (filters.planId) {
    query = query.eq("plan_id", filters.planId);
  }

  if (filters.studentId) {
    query = query.eq("student_id", filters.studentId);
  }

  if (filters.activeOnly !== false) {
    query = query.eq("lifecycle", "active");
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPlanSummary(data as PlanStatusRow);
}

/** The student's active plan, or null. Safe to call for every student. */
export async function getActiveRepaymentPlan(studentId: string) {
  const supabase = await createClient();

  return fetchPlanSummary(supabase, { studentId, activeOnly: true });
}

/** Active plans for a batch of students, keyed by student id. */
export async function getActiveRepaymentPlansForStudents(studentIds: string[]) {
  const unique = Array.from(new Set(studentIds.filter(Boolean)));

  if (unique.length === 0) {
    return new Map<string, RepaymentPlanSummary>();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_student_repayment_plan_status")
    .select(PLAN_STATUS_COLUMNS)
    .eq("lifecycle", "active")
    .in("student_id", unique);

  if (error || !data) {
    return new Map<string, RepaymentPlanSummary>();
  }

  return new Map(
    (data as PlanStatusRow[]).map((row) => {
      const summary = mapPlanSummary(row);

      return [summary.studentId, summary] as const;
    }),
  );
}

/**
 * Active plans plus the installments they cover, for a batch of students.
 *
 * Defaulters and the exports need both halves at once: the summary to score the
 * EMI calendar, and the covered ids to exclude those installments from ordinary
 * due-date scoring.
 */
export type RepaymentPlanCoverage = {
  summary: RepaymentPlanSummary;
  coveredInstallmentIds: Set<string>;
};

export async function getRepaymentPlanCoverageForStudents(
  studentIds: string[],
): Promise<Map<string, RepaymentPlanCoverage>> {
  const summaries = await getActiveRepaymentPlansForStudents(studentIds);

  if (summaries.size === 0) {
    return new Map<string, RepaymentPlanCoverage>();
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_repayment_plan_items")
    .select("plan_id, student_id, installment_id")
    .in(
      "plan_id",
      Array.from(summaries.values()).map((summary) => summary.planId),
    );

  const coverage = new Map<string, RepaymentPlanCoverage>();

  summaries.forEach((summary, studentId) => {
    coverage.set(studentId, { summary, coveredInstallmentIds: new Set<string>() });
  });

  (data ?? []).forEach((row) => {
    coverage.get(String(row.student_id))?.coveredInstallmentIds.add(String(row.installment_id));
  });

  return coverage;
}

/** Every plan a student has ever had, newest first. Drives the audit trail. */
export async function getRepaymentPlanHistory(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_student_repayment_plan_status")
    .select(PLAN_STATUS_COLUMNS)
    .eq("student_id", studentId)
    .order("activated_at", { ascending: false });

  if (error || !data) {
    return [] as RepaymentPlanSummary[];
  }

  return (data as PlanStatusRow[]).map(mapPlanSummary);
}

/** Summary + priced schedule + covered installments for the Student surfaces. */
export async function getRepaymentPlanDetail(payload: {
  studentId?: string;
  planId?: string;
  today: string;
}): Promise<RepaymentPlanDetail | null> {
  const supabase = await createClient();
  const summary = await fetchPlanSummary(supabase, {
    studentId: payload.studentId,
    planId: payload.planId,
    activeOnly: !payload.planId,
  });

  if (!summary) {
    return null;
  }

  const [scheduleResult, itemsResult, receiptsResult] = await Promise.all([
    supabase
      .from("student_repayment_schedule")
      .select("sequence_no, due_date, amount")
      .eq("plan_id", summary.planId)
      .order("sequence_no", { ascending: true }),
    supabase
      .from("student_repayment_plan_items")
      .select(
        "installment_id, installment_no, installment_label, due_date, is_carry_forward, snapshot_base_charge, included_base_balance, waived_late_fee",
      )
      .eq("plan_id", summary.planId)
      .order("due_date", { ascending: true }),
    supabase
      .from("student_repayment_receipt_links")
      .select("contribution_amount, receipts!inner(payment_date)")
      .eq("plan_id", summary.planId),
  ]);

  const schedule = (scheduleResult.data ?? []).map((row) => ({
    sequenceNo: toInt(row.sequence_no),
    dueDate: String(row.due_date),
    amount: toInt(row.amount),
  }));

  const receipts = (receiptsResult.data ?? [])
    .map((row) => {
      const receipt = row.receipts as unknown as { payment_date?: string } | null;

      return {
        paymentDate: String(receipt?.payment_date ?? ""),
        contributionAmount: toInt(row.contribution_amount),
      };
    })
    .filter((row) => row.paymentDate && row.contributionAmount > 0);

  const items: RepaymentPlanItem[] = (itemsResult.data ?? []).map((row) => ({
    installmentId: String(row.installment_id),
    installmentNo: toNullableInt(row.installment_no),
    installmentLabel: toText(row.installment_label),
    dueDate: String(row.due_date),
    isCarryForward: row.is_carry_forward === true,
    snapshotBaseCharge: toInt(row.snapshot_base_charge),
    includedBaseBalance: toInt(row.included_base_balance),
    waivedLateFee: toInt(row.waived_late_fee),
  }));

  return {
    summary,
    schedule: refineLatePayments(
      buildScheduleRows({
        schedule,
        paidToDate: summary.paidToDate,
        today: payload.today,
      }),
      receipts,
    ),
    items,
  };
}

/** What the Payment Desk needs to steer a collection against an active plan. */
export async function getRepaymentPlanCollectionContext(
  studentId: string,
): Promise<RepaymentPlanCollectionContext | null> {
  const supabase = await createClient();
  const summary = await fetchPlanSummary(supabase, { studentId, activeOnly: true });

  if (!summary) {
    return null;
  }

  const { data } = await supabase
    .from("student_repayment_plan_items")
    .select("installment_id")
    .eq("plan_id", summary.planId);

  return {
    planId: summary.planId,
    scope: summary.scope,
    paymentStatus: summary.paymentStatus,
    monthlyAmount: summary.monthlyAmount,
    remainingBalance: summary.remainingBalance,
    catchUpAmount: summary.catchUpAmount,
    nextDueDate: summary.nextDueDate,
    nextDueAmount: summary.nextDueAmount,
    missedInstallmentCount: summary.missedInstallmentCount,
    planReviewNeeded: summary.planReviewNeeded,
    coveredInstallmentIds: (data ?? []).map((row) => String(row.installment_id)),
    currentYearRemainsUnpaid: summary.scope === "old_balance_only",
  };
}

/**
 * What the desk should put in the amount box.
 *
 * Behind → the catch-up amount, because that is what puts the family back on
 * the calendar. Otherwise the next EMI. Never more than the plan balance.
 */
export function suggestRepaymentPlanAmount(plan: RepaymentPlanCollectionContext) {
  if (plan.remainingBalance <= 0) {
    return 0;
  }

  const target =
    plan.catchUpAmount > 0 ? plan.catchUpAmount : (plan.nextDueAmount ?? plan.monthlyAmount);

  return Math.min(Math.max(target, 0), plan.remainingBalance);
}

/** Read-only impact preview. Admin-only — the RPC refuses anyone else. */
export async function previewRepaymentPlan(payload: {
  studentId: string;
  sessionLabel: string;
  scope: string;
  monthlyAmount: number | null;
  firstDueDate: string | null;
}): Promise<{ ok: true; preview: RepaymentPlanPreview } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_student_repayment_plan", {
    p_student_id: payload.studentId,
    p_session_label: payload.sessionLabel,
    p_scope: payload.scope,
    p_monthly_amount: payload.monthlyAmount,
    p_first_due_date: payload.firstDueDate,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, preview: data as unknown as RepaymentPlanPreview };
}

const SCOPE_EXPORT_LABEL: Record<string, string> = {
  old_balance_only: "Previous-year balance only",
  old_and_current: "Previous year + full current year",
};

const STATUS_EXPORT_LABEL: Record<string, string> = {
  upcoming: "Starts soon",
  on_track: "On track",
  due: "Due now",
  behind: "Behind",
  completed: "Completed",
};

/**
 * One row per plan, every lifecycle. Cancelled and superseded plans are
 * included on purpose: an EMI export that only shows live plans cannot answer
 * "what did we agree with this family in September".
 */
export async function getRepaymentPlanExportRows(sessionLabel: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_student_repayment_plan_status")
    .select(`${PLAN_STATUS_COLUMNS}, students!inner(admission_no, full_name)`)
    .eq("session_label", sessionLabel)
    .order("activated_at", { ascending: false });

  if (error || !data) {
    return [] as Array<Record<string, string | number>>;
  }

  return (data as PlanStatusRow[]).map((row) => {
    const summary = mapPlanSummary(row);
    const student = row.students as unknown as {
      admission_no?: string;
      full_name?: string;
    } | null;

    return {
      "SR no": student?.admission_no ?? "",
      "Student": student?.full_name ?? "",
      "Scope": SCOPE_EXPORT_LABEL[summary.scope] ?? summary.scope,
      "Lifecycle": summary.lifecycle,
      "Payment standing": STATUS_EXPORT_LABEL[summary.paymentStatus] ?? summary.paymentStatus,
      "Opening balance": summary.openingBalance,
      "Monthly EMI": summary.monthlyAmount,
      "Term (months)": summary.termMonths,
      "Final instalment": summary.finalInstallmentAmount,
      "First due": summary.firstDueDate,
      "Ends": summary.endDate ?? "",
      "Paid to date": summary.paidToDate,
      "Remaining": summary.remainingBalance,
      "Catch up now": summary.catchUpAmount,
      "EMIs missed": summary.missedInstallmentCount,
      "Next due date": summary.nextDueDate ?? "",
      "Next due amount": summary.nextDueAmount ?? "",
      "Late fee waived": summary.waivedLateFeeTotal,
      "Installments covered": summary.itemCount,
      "Plan review needed": summary.planReviewNeeded ? "yes" : "no",
      "Reason": summary.reason,
      "Activated at": summary.activatedAt,
      "Activated by": summary.activatedByLabel ?? "",
      "Cancelled at": summary.cancelledAt ?? "",
      "Cancellation reason": summary.cancellationReason ?? "",
      "Plan id": summary.planId,
    } satisfies Record<string, string | number>;
  });
}

/** One row per scheduled monthly instalment, priced against money collected. */
export async function getRepaymentScheduleExportRows(sessionLabel: string, today: string) {
  const supabase = await createClient();
  const { data: planRows, error } = await supabase
    .from("v_student_repayment_plan_status")
    .select(`${PLAN_STATUS_COLUMNS}, students!inner(admission_no, full_name)`)
    .eq("session_label", sessionLabel)
    .order("activated_at", { ascending: false });

  if (error || !planRows || planRows.length === 0) {
    return [] as Array<Record<string, string | number>>;
  }

  const plans = (planRows as PlanStatusRow[]).map((row) => ({
    summary: mapPlanSummary(row),
    student: row.students as unknown as { admission_no?: string; full_name?: string } | null,
  }));

  const { data: scheduleRows } = await supabase
    .from("student_repayment_schedule")
    .select("plan_id, sequence_no, due_date, amount")
    .in(
      "plan_id",
      plans.map((plan) => plan.summary.planId),
    )
    .order("sequence_no", { ascending: true });

  const byPlan = new Map<string, Array<{ sequenceNo: number; dueDate: string; amount: number }>>();

  (scheduleRows ?? []).forEach((row) => {
    const planId = String(row.plan_id);
    const bucket = byPlan.get(planId) ?? [];

    bucket.push({
      sequenceNo: toInt(row.sequence_no),
      dueDate: String(row.due_date),
      amount: toInt(row.amount),
    });
    byPlan.set(planId, bucket);
  });

  return plans.flatMap(({ summary, student }) =>
    buildScheduleRows({
      schedule: byPlan.get(summary.planId) ?? [],
      paidToDate: summary.paidToDate,
      today,
    }).map((row) => ({
      "SR no": student?.admission_no ?? "",
      "Student": student?.full_name ?? "",
      "Plan lifecycle": summary.lifecycle,
      "EMI no": row.sequenceNo,
      "Due date": row.dueDate,
      "Amount": row.amount,
      "Paid": row.paidAmount,
      "Status": row.status.replace(/_/g, " "),
      "Plan id": summary.planId,
    })),
  );
}

/** Session-wide EMI metrics for the Dashboard card. */
export async function getRepaymentDashboardSummary(sessionLabel: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_repayment_summary", {
    p_session_label: sessionLabel,
  });

  if (error || !data) {
    return null;
  }

  return data as unknown as {
    sessionLabel: string;
    activePlans: number;
    onTrack: number;
    dueNow: number;
    missed: number;
    completed: number;
    planReviewNeeded: number;
    openingBalanceTotal: number;
    remainingTotal: number;
    catchUpTotal: number;
    expectedThisMonth: number;
    collectedThisMonth: number;
    topPriorityStudents: Array<{
      studentId: string;
      planId: string;
      studentName: string;
      admissionNo: string;
      paymentStatus: string;
      missedInstallmentCount: number;
      catchUpAmount: number;
      remainingBalance: number;
      nextDueDate: string | null;
    }>;
  };
}
