"use server";

import { after } from "next/server";

import { recordActivity } from "@/lib/activity/events";
import { isRepaymentPlanCreationEnabled } from "@/lib/env";
import {
  REPAYMENT_PLAN_MIN_REASON_LENGTH,
  isRepaymentPlanScope,
} from "@/lib/repayment-plans/types";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { drainFinancialViewRefresh } from "@/lib/system-sync/financial-view-refresh";
import { publishOfficeSyncEvent } from "@/lib/system-sync/office-sync-events";

import type { RepaymentPlanActionState } from "./repayment-plan-action-state";

function fail(
  message: string,
  action: RepaymentPlanActionState["action"],
): RepaymentPlanActionState {
  return { status: "error", message, planId: null, action };
}

function readText(formData: FormData, key: string) {
  return (formData.get(key) ?? "").toString().trim();
}

/**
 * One `dueDate` field per instalment, in row order. Empty entries mean "use the
 * generated date", and an all-empty list means the admin never touched them —
 * send null so the database generates the whole calendar.
 */
function readDueDates(formData: FormData) {
  const raw = formData.getAll("dueDate").map((value) => value.toString().trim());

  if (raw.length === 0 || raw.every((value) => !value)) {
    return null;
  }

  return raw;
}

function readInteger(formData: FormData, key: string) {
  const raw = readText(formData, key);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Side effects shared by all three actions. The materialised financial views
 * have to be drained because activation writes late-fee waivers, which change
 * what every other surface reports as owed.
 */
function scheduleSideEffects(payload: {
  staffId: string | null;
  studentId: string;
  sessionLabel: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  after(async () => {
    await drainFinancialViewRefresh();

    try {
      await publishOfficeSyncEvent({
        sessionLabel: payload.sessionLabel,
        entityType: "student",
        entityId: payload.studentId,
        action: payload.action,
        affectedStudentIds: [payload.studentId],
        metadata: payload.metadata,
      });
    } catch {
      // Office sync is best-effort.
    }

    try {
      await recordActivity({
        userId: payload.staffId,
        kind: "student_edited",
        refId: payload.studentId,
        payload: { action: payload.action, ...payload.metadata },
      });
    } catch {
      // Activity logging is best-effort.
    }
  });
}

/**
 * Convert a student's outstanding dues into a monthly EMI plan.
 *
 * `expectedOpeningBalance` is the figure the admin was actually shown. The RPC
 * refuses if the dues moved since the preview, rather than silently building
 * the plan on a number nobody agreed to.
 */
export async function activateRepaymentPlanAction(
  _previous: RepaymentPlanActionState,
  formData: FormData,
): Promise<RepaymentPlanActionState> {
  try {
    const staff = await requireStaffPermission("fees:repayment_plan");

    if (!isRepaymentPlanCreationEnabled()) {
      return fail(
        "EMI plan creation is not enabled in this environment yet.",
        "activate",
      );
    }

    const studentId = readText(formData, "studentId");
    const sessionLabel = readText(formData, "sessionLabel");
    const scope = readText(formData, "scope");
    const reason = readText(formData, "reason");
    const monthlyAmount = readInteger(formData, "monthlyAmount");
    const firstDueDate = readText(formData, "firstDueDate");
    const expectedOpeningBalance = readInteger(formData, "expectedOpeningBalance");
    const clientRequestId = readText(formData, "clientRequestId");
    const acknowledged = formData.get("acknowledged") === "on";

    if (!studentId) return fail("Student is required.", "activate");
    if (!sessionLabel) return fail("Academic session is required.", "activate");
    if (!isRepaymentPlanScope(scope)) return fail("Choose what the plan covers.", "activate");
    if (monthlyAmount === null || monthlyAmount <= 0) {
      return fail("Enter a whole rupee monthly EMI amount greater than 0.", "activate");
    }
    if (!firstDueDate) return fail("Choose the first EMI due date.", "activate");
    if (reason.length < REPAYMENT_PLAN_MIN_REASON_LENGTH) {
      return fail(
        `Add a reason (at least ${REPAYMENT_PLAN_MIN_REASON_LENGTH} characters) so the audit trail explains the plan.`,
        "activate",
      );
    }
    if (!acknowledged) {
      return fail(
        "Confirm you understand that payments clear EMI debt before any other fees.",
        "activate",
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_student_repayment_plan", {
      p_student_id: studentId,
      p_session_label: sessionLabel,
      p_scope: scope,
      p_monthly_amount: monthlyAmount,
      p_first_due_date: firstDueDate,
      p_reason: reason,
      p_expected_opening_balance: expectedOpeningBalance,
      p_client_request_id: clientRequestId || null,
      p_supersedes_plan_id: null,
      p_due_dates: readDueDates(formData),
    });

    if (error) {
      return fail(error.message, "activate");
    }

    const planId = typeof data === "string" ? data : null;

    scheduleSideEffects({
      staffId: (staff.id as string | undefined) ?? null,
      studentId,
      sessionLabel,
      action: "repayment_plan_activated",
      metadata: { planId, scope, monthlyAmount, firstDueDate, reason },
    });

    return {
      status: "success",
      message:
        "EMI plan activated. Late fees on the covered installments are permanently waived, and payments will clear this plan first.",
      planId,
      action: "activate",
    };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Unable to activate the EMI plan right now.",
      "activate",
    );
  }
}

/**
 * Replace an active plan with a new one built from what is still owed. The old
 * plan is marked superseded, never edited — the schedule a parent was shown
 * stays on file.
 */
export async function rescheduleRepaymentPlanAction(
  _previous: RepaymentPlanActionState,
  formData: FormData,
): Promise<RepaymentPlanActionState> {
  try {
    const staff = await requireStaffPermission("fees:repayment_plan");

    if (!isRepaymentPlanCreationEnabled()) {
      return fail(
        "EMI plan changes are not enabled in this environment yet.",
        "reschedule",
      );
    }

    const planId = readText(formData, "planId");
    const studentId = readText(formData, "studentId");
    const sessionLabel = readText(formData, "sessionLabel");
    const reason = readText(formData, "reason");
    const monthlyAmount = readInteger(formData, "monthlyAmount");
    const firstDueDate = readText(formData, "firstDueDate");
    const expectedRemainingBalance = readInteger(formData, "expectedRemainingBalance");

    if (!planId) return fail("EMI plan is required.", "reschedule");
    if (monthlyAmount === null || monthlyAmount <= 0) {
      return fail("Enter a whole rupee monthly EMI amount greater than 0.", "reschedule");
    }
    if (!firstDueDate) return fail("Choose the first EMI due date.", "reschedule");
    if (reason.length < REPAYMENT_PLAN_MIN_REASON_LENGTH) {
      return fail(
        `Add a reason (at least ${REPAYMENT_PLAN_MIN_REASON_LENGTH} characters) so the audit trail explains the reschedule.`,
        "reschedule",
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reschedule_student_repayment_plan", {
      p_plan_id: planId,
      p_monthly_amount: monthlyAmount,
      p_first_due_date: firstDueDate,
      p_reason: reason,
      p_expected_remaining_balance: expectedRemainingBalance,
      p_client_request_id: null,
      p_due_dates: readDueDates(formData),
    });

    if (error) {
      return fail(error.message, "reschedule");
    }

    const newPlanId = typeof data === "string" ? data : null;

    scheduleSideEffects({
      staffId: (staff.id as string | undefined) ?? null,
      studentId,
      sessionLabel,
      action: "repayment_plan_rescheduled",
      metadata: { supersededPlanId: planId, planId: newPlanId, monthlyAmount, firstDueDate, reason },
    });

    return {
      status: "success",
      message: "EMI plan rescheduled. The previous plan is kept on file as superseded.",
      planId: newPlanId,
      action: "reschedule",
    };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Unable to reschedule the EMI plan right now.",
      "reschedule",
    );
  }
}

/**
 * End a plan. Remaining dues go back to their own due dates for follow-up. The
 * late fees already waived stay waived — the school forgave them, and
 * re-charging a family for a plan the school itself ended is not automatic.
 */
export async function cancelRepaymentPlanAction(
  _previous: RepaymentPlanActionState,
  formData: FormData,
): Promise<RepaymentPlanActionState> {
  try {
    const staff = await requireStaffPermission("fees:repayment_plan");

    const planId = readText(formData, "planId");
    const studentId = readText(formData, "studentId");
    const sessionLabel = readText(formData, "sessionLabel");
    const reason = readText(formData, "reason");

    if (!planId) return fail("EMI plan is required.", "cancel");
    if (reason.length < REPAYMENT_PLAN_MIN_REASON_LENGTH) {
      return fail(
        `Add a reason (at least ${REPAYMENT_PLAN_MIN_REASON_LENGTH} characters) so the audit trail explains the cancellation.`,
        "cancel",
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_student_repayment_plan", {
      p_plan_id: planId,
      p_reason: reason,
    });

    if (error) {
      return fail(error.message, "cancel");
    }

    const result = (data ?? {}) as { remainingBalance?: number; lateFeeWaiversKept?: number };

    scheduleSideEffects({
      staffId: (staff.id as string | undefined) ?? null,
      studentId,
      sessionLabel,
      action: "repayment_plan_cancelled",
      metadata: { planId, reason, remainingBalance: result.remainingBalance ?? null },
    });

    return {
      status: "success",
      message: `EMI plan cancelled. Rs ${result.remainingBalance ?? 0} goes back to the original due dates; Rs ${result.lateFeeWaiversKept ?? 0} of waived late fees stays waived.`,
      planId,
      action: "cancel",
    };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Unable to cancel the EMI plan right now.",
      "cancel",
    );
  }
}
