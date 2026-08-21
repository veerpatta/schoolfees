import { describe, expect, it } from "vitest";

import {
  derivePaymentDeskControllerView,
  initialPaymentDeskControllerState,
  paymentDeskControllerReducer,
} from "@/modules/payments/domain/payment-desk-controller";
import type { PaymentEntryActionState } from "@/modules/payments/domain/types";

function transition(
  events: Parameters<typeof paymentDeskControllerReducer>[1][],
  hasSelectedStudent = false,
) {
  return events.reduce(
    paymentDeskControllerReducer,
    initialPaymentDeskControllerState(hasSelectedStudent),
  );
}

describe("shared Payment Desk controller", () => {
  it("drives the same select, review, post, and receipt phases for both layouts", () => {
    const receipt = transition([
      { type: "student_selected" },
      { type: "review_requested" },
      { type: "post_started" },
      {
        type: "post_result",
        result: {
          status: "success",
          message: "Posted",
          receiptId: "receipt-1",
          receiptNumber: "SVP-1",
          clientRequestId: "request-1",
          studentId: "student-1",
          amountReceived: 1000,
          remainingBalance: 0,
          quickDiscountApplied: 0,
          lateFeeWaivedApplied: 0,
          diagnostic: null,
        } satisfies PaymentEntryActionState,
      },
    ]);

    expect(receipt.phase).toBe("receipt");
    expect(derivePaymentDeskControllerView(receipt)).toMatchObject({
      isSuccessOpen: true,
      isLockedAfterSuccess: true,
      isPosting: false,
    });
  });

  it("routes duplicate protection back to editable entry after acknowledgement", () => {
    const duplicate = transition([
      { type: "student_selected" },
      { type: "post_started" },
      {
        type: "post_result",
        result: {
          status: "duplicate",
          message: "Possible duplicate",
          receiptId: "receipt-1",
          receiptNumber: "SVP-1",
          clientRequestId: "request-2",
          studentId: "student-1",
          amountReceived: 1000,
          remainingBalance: null,
          quickDiscountApplied: 0,
          lateFeeWaivedApplied: 0,
          diagnostic: null,
        } satisfies PaymentEntryActionState,
      },
    ]);

    expect(derivePaymentDeskControllerView(duplicate).isDuplicateOpen).toBe(true);
    expect(
      paymentDeskControllerReducer(duplicate, { type: "duplicate_closed" }),
    ).toEqual({ phase: "entry", errorMessage: null });
  });

  it("keeps failures retryable and restart returns to student selection", () => {
    const failed = transition([
      { type: "student_selected" },
      { type: "post_started" },
      {
        type: "post_result",
        result: {
          status: "error",
          message: "Connection interrupted",
          receiptId: null,
          receiptNumber: null,
          clientRequestId: "request-3",
          studentId: "student-1",
          amountReceived: null,
          remainingBalance: null,
          quickDiscountApplied: 0,
          lateFeeWaivedApplied: 0,
          diagnostic: null,
        } satisfies PaymentEntryActionState,
      },
    ]);

    expect(derivePaymentDeskControllerView(failed).canRetry).toBe(true);
    expect(
      paymentDeskControllerReducer(failed, {
        type: "restart",
        hasSelectedClass: true,
      }),
    ).toEqual({ phase: "select-student", errorMessage: null });
  });
});
