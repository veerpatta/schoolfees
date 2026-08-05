/**
 * A `"use server"` module may export only async functions, so the action-state
 * type and its initial value live here rather than beside the action itself.
 * Same split as app/protected/payments/waive-late-fee-action-state.ts.
 */
export type StudentFeePlanActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  /** True when the dues rebuild finished but flagged the student for review. */
  duesNeedAttention: boolean;
};

export const INITIAL_STUDENT_FEE_PLAN_ACTION_STATE: StudentFeePlanActionState = {
  status: "idle",
  message: null,
  duesNeedAttention: false,
};

/** Keeps the editor, the action and the tests on one limit. */
export const MAX_CUSTOM_FEE_HEADS = 8;
export const MAX_FEE_HEAD_LABEL_LENGTH = 60;
