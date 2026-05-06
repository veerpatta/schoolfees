import { describe, expect, it } from "vitest";

import { buildReceiptAdjustmentTotals } from "@/lib/receipts/amounts";

describe("receipt display adjustment totals", () => {
  it("keeps the waived late fee visible when the current financial late fee is zero", () => {
    const totals = buildReceiptAdjustmentTotals({
      currentReceiptId: "receipt-2",
      receiptIdsUpToCurrent: ["receipt-1", "receipt-2"],
      financialLateFeeTotal: 0,
      adjustments: [
        {
          receiptId: "receipt-1",
          adjustmentType: "discount",
          amountDelta: 500,
        },
        {
          receiptId: "receipt-2",
          adjustmentType: "writeoff",
          amountDelta: 1000,
        },
        {
          receiptId: "receipt-3",
          adjustmentType: "writeoff",
          amountDelta: 2000,
        },
      ],
    });

    expect(totals.receiptDiscountAmount).toBe(0);
    expect(totals.receiptLateFeeWaived).toBe(1000);
    expect(totals.receiptLateFeeAmount).toBe(1000);
    expect(totals.adjustmentsUpToCurrent).toBe(1500);
  });
});
