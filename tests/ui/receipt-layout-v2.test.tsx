import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

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
        discountAppliedAtPosting: null,
        waiverAppliedAtPosting: null,
        pendingBeforePosting: null,
        pendingAfterPosting: null,
      },
    ],
    conventionalDiscountAssignments: [],
    ...overrides,
  };
}

describe("ReceiptDocumentV2 — simplified layout", () => {
  it("renders the school header, payment date subtitle, installment table, and totals block", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);

    // School header
    expect(html).toContain("SVP-V2-001");
    expect(html).toContain("Fee Receipt");
    // Payment date subtitle is the time-anchor for every figure on the receipt
    expect(html).toContain("Payment date");
    // Student strip
    expect(html).toContain("TEST Student V2");
    expect(html).toContain("SR-V2");
    expect(html).toContain("Class 9");
    expect(html).toContain("TEST Father");
    // Installment table — Installment / Due date / Paid only (Pending Before
    // and Balance After columns are gone in the simplified layout)
    expect(html).toContain("Installment");
    expect(html).toContain("Due date");
    expect(html).toContain("Paid");
    // Totals block uses time-neutral wording — never "Today"
    expect(html).toContain("Total paid");
    expect(html).toContain("Balance due");
    expect(html).toContain("Amount in Words");
    // Signature
    expect(html).toContain("Authorised Signature");
    // Fee detail disclosure (screen-only)
    expect(html).toContain("Fee detail");
    expect(html).toContain('data-receipt-fee-detail="v2"');
  });

  it("never prints 'Today' on the receipt body (so reprints from the past stay honest)", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    // The body must be time-neutral. Catalog keys that still say "Today"
    // (like the legacy `paidToday`) are not referenced by this layout.
    expect(html).not.toContain("Total Paid Today");
    expect(html).not.toContain("Balance Due After");
    expect(html).not.toContain("Pending Before");
    expect(html).not.toContain("Balance After");
  });

  it("marks the document with data-receipt-layout='v2'", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    expect(html).toContain('data-receipt-layout="v2"');
  });

  it("keeps the Fee detail disclosure off the print path via @media print CSS", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    // The Fee detail block exists in the markup but is `display: none` when
    // printing. Office staff still see it on screen for reference.
    expect(html).toContain('[data-receipt-fee-detail="v2"] {');
    expect(html).toContain("display: none !important;");
  });
});

describe("ReceiptDocument shim — always renders V2", () => {
  it("renders the simplified V2 layout regardless of any env state", () => {
    const html = renderToStaticMarkup(<ReceiptDocument t={t} receipt={receipt()} />);
    expect(html).toContain('data-receipt-layout="v2"');
    expect(html).toContain("Payment date");
    expect(html).toContain("Total paid");
    // The old V1-only string is gone with the legacy layout.
    expect(html).not.toContain("Total Fee Due");
  });
});
