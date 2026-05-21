import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FamilyReceiptDocument } from "@/components/receipts/family-receipt-document";
import type { ReceiptDetail } from "@/lib/receipts/types";

function receipt(id: string, amount: number): ReceiptDetail {
  return {
    id,
    studentId: `student-${id}`,
    receiptNumber: `SVP-${id}`,
    paymentDate: "2026-05-21",
    paymentMode: "cash",
    totalAmount: amount,
    referenceNumber: null,
    notes: null,
    receivedBy: "Office",
    createdAt: "2026-05-21T00:00:00.000Z",
    createdByName: "Accountant",
    studentFullName: `TEST Student ${id}`,
    admissionNo: `SR${id}`,
    fatherName: "TEST Father",
    fatherPhone: "8123456789",
    classLabel: "Class 1",
    sessionLabel: "TEST-2026-27",
    transportRouteLabel: "No Transport",
    studentStatusLabel: "Old",
    feeSummary: [],
    totalDue: amount,
    totalPaidBeforeReceipt: 0,
    totalPaidToDate: amount,
    outstandingAfterReceipt: 0,
    currentOutstanding: 0,
    discountAmount: 0,
    lateFeeAmount: 0,
    lateFeeWaived: 0,
    breakdown: [
      {
        paymentId: `payment-${id}`,
        installmentNo: 1,
        installmentLabel: "Installment 1",
        sessionLabel: "TEST-2026-27",
        dueDate: "2026-04-20",
        amount,
        notes: null,
      },
    ],
    conventionalDiscountAssignments: [],
  };
}

describe("family receipt print", () => {
  it("renders child blocks and a family total", () => {
    const html = renderToStaticMarkup(
      <FamilyReceiptDocument
        familyPaymentId="family-payment-1"
        receipts={[receipt("001", 3000), receipt("002", 4000)]}
      />,
    );

    expect(html).toContain("Family Fee Statement");
    expect(html).toContain("TEST Student 001");
    expect(html).toContain("TEST Student 002");
    expect(html).toContain("₹7,000");
    expect(html).toContain("height: 277mm");
    expect(html).toContain("overflow: hidden");
  });
});
