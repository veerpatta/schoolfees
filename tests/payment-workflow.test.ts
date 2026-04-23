import { describe, expect, it } from "vitest";

import { buildPaymentDeskSuccessActions } from "@/lib/payments/workflow";

describe("payment desk success workflow", () => {
  it("returns the main next-step shortcuts after posting a payment", () => {
    expect(
      buildPaymentDeskSuccessActions({
        receiptId: "receipt-1",
        studentId: "student-1",
        nextPaymentHref: "/protected/payments",
      }),
    ).toEqual([
      {
        label: "Print receipt",
        href: "/protected/receipts/receipt-1",
      },
      {
        label: "Open receipt",
        href: "/protected/receipts/receipt-1",
      },
      {
        label: "Back to student",
        href: "/protected/students/student-1",
      },
      {
        label: "Post next payment",
        href: "/protected/payments",
      },
    ]);
  });
});
