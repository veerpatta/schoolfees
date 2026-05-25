import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReceiptDocument } from "@/components/receipts/receipt-document";
import type { ReceiptDetail } from "@/lib/receipts/types";

function receipt(overrides: Partial<ReceiptDetail> = {}): ReceiptDetail {
  return {
    id: "receipt-1",
    studentId: "student-1",
    receiptNumber: "SVP-001",
    paymentDate: "2026-05-21",
    paymentMode: "cash",
    totalAmount: 5000,
    referenceNumber: null,
    notes: null,
    receivedBy: "Office",
    createdAt: "2026-05-21T00:00:00.000Z",
    createdByName: "Accountant",
    studentFullName: "TEST Student One",
    admissionNo: "SR001",
    fatherName: "TEST Father",
    fatherPhone: "8123456789",
    parentEmail: null,
    classLabel: "Class 1",
    sessionLabel: "TEST-2026-27",
    transportRouteLabel: "No Transport",
    studentStatusLabel: "Old",
    feeSummary: [{ label: "Tuition fee", amount: 12000 }],
    totalDue: 12000,
    totalPaidBeforeReceipt: 0,
    totalPaidToDate: 5000,
    outstandingAfterReceipt: 7000,
    currentOutstanding: 7000,
    discountAmount: 0,
    lateFeeAmount: 0,
    lateFeeWaived: 0,
    breakdown: [
      {
        paymentId: "payment-1",
        installmentNo: 1,
        installmentLabel: "Installment 1",
        sessionLabel: "TEST-2026-27",
        dueDate: "2026-04-20",
        amount: 5000,
        notes: null,
      },
    ],
    conventionalDiscountAssignments: [],
    ...overrides,
  };
}

describe("receipt conventional discount block", () => {
  it("renders baseline, policy, resulting tuition, and savings when an assignment is present", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocument
        receipt={receipt({
          conventionalDiscountAssignments: [
            {
              assignmentId: "assignment-1",
              policyCode: "STAFF_CHILD",
              policyDisplayName: "Staff Child",
              beforeTuitionAmount: 12000,
              resultingTuitionAmount: 6000,
            },
          ],
        })}
      />,
    );

    expect(html).toContain("Conventional Discount");
    expect(html).toContain("STAFF_CHILD");
    expect(html).toContain("Staff Child");
    expect(html).toContain("12,000");
    expect(html).toContain("6,000");
    expect(html).toContain("you save");
    expect(html).toContain("6,000");
  });

  it("does not render the block when no assignment is present", () => {
    const html = renderToStaticMarkup(<ReceiptDocument receipt={receipt()} />);

    expect(html).not.toContain("Conventional Discount");
    expect(html).not.toContain("you save");
  });
});
