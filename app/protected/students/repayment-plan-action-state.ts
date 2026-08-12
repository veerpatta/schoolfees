/**
 * Split out of `repayment-plan-actions.ts` because a `"use server"` module may
 * only export async functions — the state type and its initial value have to
 * live somewhere a client component can import them from.
 */

export type RepaymentPlanActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  /** Set on success so the caller can deep-link to the plan it just created. */
  planId: string | null;
  /** Which action produced this state, so one banner can serve every form. */
  action: "activate" | "reschedule" | "cancel" | "waive_late_fee" | null;
};

export const INITIAL_REPAYMENT_PLAN_ACTION_STATE: RepaymentPlanActionState = {
  status: "idle",
  message: null,
  planId: null,
  action: null,
};

export const REPAYMENT_PLAN_FORM_IDS = {
  activate: "student-repayment-plan-activate-form",
  reschedule: "student-repayment-plan-reschedule-form",
  cancel: "student-repayment-plan-cancel-form",
} as const;
