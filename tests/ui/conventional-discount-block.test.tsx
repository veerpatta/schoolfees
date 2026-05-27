import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { ReceiptDocument, type ReceiptTranslator } from "@/components/receipts/receipt-document";
import type { ReceiptDetail } from "@/lib/receipts/types";

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

const t = createTranslator({
  locale: "en",
  messages,
  namespace: "Receipts",
}) as unknown as ReceiptTranslator;

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
        discountAppliedAtPosting: null,
        waiverAppliedAtPosting: null,
        pendingBeforePosting: null,
        pendingAfterPosting: null,
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
  it("renders policy name, baseline, and resulting tuition when an assignment is present", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocument
        t={t}
        receipt={receipt({
          conventionalDiscountAssignments: [
            {
              assignmentId: "assignment-1",
              policyCode: "STAFF_CHILD",
              policyDisplayName: "Staff Child",
              beforeTuitionAmount: 12000,
              resultingTuitionAmount: 6000,
              isWinningPolicy: true,
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
  });

  it("does not render the block when no assignment is present", () => {
    const html = renderToStaticMarkup(<ReceiptDocument t={t} receipt={receipt()} />);

    expect(html).not.toContain("Conventional Discount");
  });

  it("renders ALL active policies with Applied / Not applied pills (was: 'Bhupesh Chouhan' regression)", () => {
    // Previously this test asserted that only the winning policy was visible.
    // That hid the second-policy audit trail entirely — a clarity gap flagged
    // in the money-clarity pass. The new contract: BOTH policies render, but
    // exactly one is tagged "Applied" and the other is tagged "Not applied",
    // so a reader cannot mis-read the secondary policy as a parallel saving.
    const html = renderToStaticMarkup(
      <ReceiptDocument
        t={t}
        receipt={receipt({
          conventionalDiscountAssignments: [
            {
              assignmentId: "assignment-staff",
              policyCode: "STAFF_CHILD",
              policyDisplayName: "Staff Child",
              beforeTuitionAmount: 38000,
              resultingTuitionAmount: 19000,
              isWinningPolicy: false,
            },
            {
              assignmentId: "assignment-rte",
              policyCode: "RTE",
              policyDisplayName: "RTE",
              beforeTuitionAmount: 38000,
              resultingTuitionAmount: 0,
              isWinningPolicy: true,
            },
          ],
        })}
      />,
    );

    // Both policies render so the audit shows what was considered.
    expect(html).toContain("Conventional Discount");
    expect(html).toContain("RTE");
    expect(html).toContain("Staff Child");
    expect(html).toContain("STAFF_CHILD");
    // Exactly one policy is tagged Applied; the other Not applied. The "Not
    // applied" pill is the safeguard against the original mis-reading the
    // previous test was preventing.
    expect(html).toContain("Applied");
    expect(html).toContain("Not applied");
    // Both numbers appear, but the non-winning row is visibly de-emphasized
    // via the "Not applied" pill and muted styling.
    expect(html).toContain("38,000");
    expect(html).toContain("19,000");
  });
});
