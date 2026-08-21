import type { PaymentEntryActionState } from "@/modules/payments/domain/types";

export type PaymentDeskPhase =
  | "select-student"
  | "entry"
  | "review"
  | "posting"
  | "duplicate"
  | "receipt"
  | "failed";

export type PaymentDeskControllerState = {
  phase: PaymentDeskPhase;
  errorMessage: string | null;
};

export type PaymentDeskControllerEvent =
  | { type: "student_selected" }
  | { type: "review_requested" }
  | { type: "review_closed" }
  | { type: "post_started" }
  | { type: "post_result"; result: PaymentEntryActionState }
  | { type: "duplicate_closed" }
  | { type: "validation_failed"; message: string }
  | { type: "restart"; hasSelectedClass: boolean };

export function initialPaymentDeskControllerState(
  hasSelectedStudent: boolean,
): PaymentDeskControllerState {
  return {
    phase: hasSelectedStudent ? "entry" : "select-student",
    errorMessage: null,
  };
}

/**
 * One workflow contract for the desktop desk and the mobile step flow.
 *
 * Layout components may present these phases differently, but posting,
 * duplicate protection, retry, receipt locking, and restart always transition
 * through this reducer.
 */
export function paymentDeskControllerReducer(
  state: PaymentDeskControllerState,
  event: PaymentDeskControllerEvent,
): PaymentDeskControllerState {
  switch (event.type) {
    case "student_selected":
      return { phase: "entry", errorMessage: null };
    case "review_requested":
      return { phase: "review", errorMessage: null };
    case "review_closed":
    case "duplicate_closed":
      return { phase: "entry", errorMessage: null };
    case "post_started":
      if (state.phase === "receipt") return state;
      return { phase: "posting", errorMessage: null };
    case "validation_failed":
      return { phase: "failed", errorMessage: event.message };
    case "post_result":
      if (event.result.status === "success") {
        return { phase: "receipt", errorMessage: null };
      }
      if (event.result.status === "duplicate") {
        return { phase: "duplicate", errorMessage: null };
      }
      if (event.result.status === "error") {
        return { phase: "failed", errorMessage: event.result.message };
      }
      return state;
    case "restart":
      return {
        phase: "select-student",
        errorMessage: null,
      };
    default:
      return state;
  }
}

export function derivePaymentDeskControllerView(state: PaymentDeskControllerState) {
  return {
    isConfirmOpen: state.phase === "review",
    isDuplicateOpen: state.phase === "duplicate",
    isSuccessOpen: state.phase === "receipt",
    isPosting: state.phase === "posting",
    isLockedAfterSuccess: state.phase === "receipt",
    canRetry: state.phase === "failed",
  };
}
