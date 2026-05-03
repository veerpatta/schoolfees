import { describe, expect, it } from "vitest";

import {
  buildPaymentDeskSuccessActions,
  buildPaymentQuickAmounts,
} from "@/lib/payments/workflow";

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
        label: "Open student",
        href: "/protected/students/student-1",
      },
      {
        label: "Next payment",
        href: "/protected/payments",
      },
      {
        label: "Open Transactions",
        href: "/protected/transactions",
      },
    ]);
  });

  it("builds quick-fill amounts without posting anything", () => {
    expect(
      buildPaymentQuickAmounts({
        totalPending: 12000,
        nextDueAmount: 3000,
        overdueAmount: 5000,
        lateFeeAmount: 1000,
        lastPaidAmount: 2500,
      }),
    ).toEqual([
      {
        key: "full",
        label: "Full Due",
        amount: 12000,
        disabled: false,
      },
      {
        key: "next",
        label: "Next Installment",
        amount: 3000,
        disabled: false,
      },
      {
        key: "overdue",
        label: "Overdue",
        amount: 5000,
        disabled: false,
      },
      {
        key: "lateFee",
        label: "Late Fee",
        amount: 1000,
        disabled: false,
      },
      {
        key: "lastAmount",
        label: "Last Amount",
        amount: 2500,
        disabled: false,
      },
      {
        key: "clear",
        label: "Clear",
        amount: null,
        disabled: false,
      },
    ]);
  });
});
