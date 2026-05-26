import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ReceiptDocument, type ReceiptTranslator } from "@/components/receipts/receipt-document";
import { ReceiptDocumentV2 } from "@/components/receipts/receipt-document-v2";
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
    receiptNumber: "SVP-V2-001",
    paymentDate: "2026-05-21",
    paymentMode: "cash",
    totalAmount: 5000,
    referenceNumber: null,
    notes: null,
    receivedBy: "Office",
    createdAt: "2026-05-21T00:00:00.000Z",
    createdByName: "Accountant",
    studentFullName: "TEST Student V2",
    admissionNo: "SR-V2",
    fatherName: "TEST Father",
    fatherPhone: "8123456789",
    parentEmail: null,
    classLabel: "Class 9",
    sessionLabel: "TEST-2026-27",
    transportRouteLabel: "No Transport",
    studentStatusLabel: "Old",
    feeSummary: [{ label: "Tuition fee", amount: 5000 }],
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

describe("ReceiptDocumentV2 — direct render", () => {
  it("renders the school header, student strip, installment table, and totals footer", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);

    // School header
    expect(html).toContain("SVP-V2-001");
    expect(html).toContain("Fee Receipt");
    // Student strip
    expect(html).toContain("TEST Student V2");
    expect(html).toContain("SR-V2");
    expect(html).toContain("Class 9");
    expect(html).toContain("TEST Father");
    // Installment table columns
    expect(html).toContain("Pending Before");
    expect(html).toContain("Paid");
    expect(html).toContain("Balance After");
    // Totals footer
    expect(html).toContain("Total Paid Today");
    expect(html).toContain("Balance Due After");
    expect(html).toContain("Amount in Words");
    // Signature
    expect(html).toContain("Authorised Signature");
    // Collapsed fee detail
    expect(html).toContain("Fee detail");
    expect(html).toContain('data-receipt-fee-detail="v2"');
  });

  it("marks the document with data-receipt-layout='v2'", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    expect(html).toContain('data-receipt-layout="v2"');
  });

  it("hides the Fee detail section on 80mm thermal prints via @media print CSS", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    // The Fee detail block exists in the markup but is `display: none` on
    // narrow print media. Verify the CSS contract is shipped.
    expect(html).toContain('[data-receipt-fee-detail="v2"] {');
    expect(html).toContain("display: none !important;");
  });
});

describe("ReceiptDocument switch — RECEIPT_LAYOUT_V2 flag", () => {
  const originalFlag = process.env.NEXT_PUBLIC_RECEIPT_LAYOUT_V2;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RECEIPT_LAYOUT_V2;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_RECEIPT_LAYOUT_V2;
    } else {
      process.env.NEXT_PUBLIC_RECEIPT_LAYOUT_V2 = originalFlag;
    }
  });

  it("renders V1 layout when the flag is off (default in production)", () => {
    const html = renderToStaticMarkup(<ReceiptDocument t={t} receipt={receipt()} />);
    // V1 has the four-card totals strip (Total Fee Due / Paid Till Date /
    // Paid Today / Balance Due) — V2 does not.
    expect(html).toContain("Total Fee Due");
    expect(html).not.toContain('data-receipt-layout="v2"');
  });

  it("renders V2 layout when NEXT_PUBLIC_RECEIPT_LAYOUT_V2 is truthy", () => {
    process.env.NEXT_PUBLIC_RECEIPT_LAYOUT_V2 = "1";
    const html = renderToStaticMarkup(<ReceiptDocument t={t} receipt={receipt()} />);
    expect(html).toContain('data-receipt-layout="v2"');
    expect(html).toContain("Pending Before");
    expect(html).toContain("Total Paid Today");
    // V1 four-card totals strip is gone.
    expect(html).not.toContain("Total Fee Due");
  });
});
