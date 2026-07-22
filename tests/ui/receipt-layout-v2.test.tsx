import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptDocumentV2 } from "@/components/receipts/receipt-document-v2";
import { createBilingualReceiptTranslator } from "@/lib/i18n/bilingual-receipt";
import type { ReceiptDetail } from "@/lib/receipts/types";

// Parent-facing receipts always render English + Devanagari Hindi together.
const t = createBilingualReceiptTranslator();

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
    installmentStatus: [],
    previousReceipts: [],
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
    // Annual fee summary is now printed in the body (no longer a screen-only
    // disclosure) — total expected for the year is prominent.
    expect(html).toContain("Fee summary");
    expect(html).toContain("Total expected this year");
    // Payment progress block
    expect(html).toContain("Paid so far");
    expect(html).toContain("Remaining");
    // The old screen-only fee-detail disclosure is gone.
    expect(html).not.toContain('data-receipt-fee-detail="v2"');
    // Bilingual: the Devanagari Hindi line renders alongside English.
    expect(html).toContain("शुल्क रसीद"); // Fee Receipt
    expect(html).toContain("रसीद संख्या"); // Receipt No
    expect(html).toContain("शुल्क सारांश"); // Fee summary
    expect(html).toContain('lang="hi"');
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

  it("prints on A4 (the receipt is now a full page, not an 80mm thermal slip)", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    expect(html).toContain("size: A4;");
    expect(html).not.toContain("size: 80mm auto;");
  });

  it("shows every installment with a green tick when paid or the amount still due", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocumentV2
        t={t}
        receipt={receipt({
          installmentStatus: [
            {
              installmentNo: 1,
              label: "Installment 1",
              dueDate: "2026-04-20",
              expected: 3000,
              paid: 3000,
              pending: 0,
              lateFee: 0,
              status: "paid",
            },
            {
              installmentNo: 2,
              label: "Installment 2",
              dueDate: "2026-07-20",
              expected: 3000,
              paid: 0,
              pending: 3000,
              lateFee: 0,
              status: "overdue",
            },
          ],
        })}
      />,
    );
    expect(html).toContain("Installment status");
    // Installment 2 still owes money — the due amount is surfaced.
    expect(html).toContain("due");
  });

  it("renders discount, late fee, and late-fee waiver as separate signed lines", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocumentV2
        t={t}
        receipt={receipt({ discountAmount: 1000, lateFeeAmount: 500, lateFeeWaived: 200 })}
      />,
    );
    expect(html).toContain("Discount");
    expect(html).toContain("Late Fee");
    expect(html).toContain("Late Fee Waived");
    // Signed amounts: discount/waiver are negative, applied late fee is positive.
    expect(html).toContain("−₹1,000");
    expect(html).toContain("+₹500");
    expect(html).toContain("−₹200");
  });

  it("lists previous receipts for the student when present", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocumentV2
        t={t}
        receipt={receipt({
          previousReceipts: [
            { id: "r0", receiptNumber: "SVP-OLD-001", paymentDate: "2026-04-22", totalAmount: 3000 },
          ],
        })}
      />,
    );
    expect(html).toContain("Previous receipts");
    expect(html).toContain("SVP-OLD-001");
  });
});

describe("ReceiptDocument shim — V3 by default, V2 for reprints", () => {
  it("renders the Ledger Calm V3 layout by default", () => {
    const html = renderToStaticMarkup(<ReceiptDocument t={t} receipt={receipt()} />);
    expect(html).toContain('data-receipt-layout="v3"');
    // Bilingual + core V3 sections.
    expect(html).toContain("Fee Receipt");
    expect(html).toContain("शुल्क रसीद");
    expect(html).toContain("What this receipt paid");
    expect(html).toContain("Total paid");
    expect(html).toContain("Authorised Signature");
    // A4 print rules travel with the document.
    expect(html).toContain("size: A4;");
    // The old V1-only string is gone with the legacy layout.
    expect(html).not.toContain("Total Fee Due");
  });

  it("keeps the V2 layout reachable for reprints via layout='v2'", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocument t={t} receipt={receipt()} layout="v2" />,
    );
    expect(html).toContain('data-receipt-layout="v2"');
    expect(html).toContain("Payment date");
    expect(html).toContain("Total paid");
  });
});

describe("ReceiptDocumentV2 — VOID banner for reversed receipts", () => {
  it("renders the REVERSED watermark and banner when the receipt is voided", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocumentV2
        t={t}
        receipt={receipt({ isVoided: true, reversedAmount: 5000, voidReason: "Payment undone — accidental posting" })}
      />,
    );
    expect(html).toContain("REVERSED · VOID");
    expect(html).toContain("reversed in full");
    expect(html).toContain("Payment undone — accidental posting");
  });

  it("renders no VOID artifacts for a normal receipt", () => {
    const html = renderToStaticMarkup(<ReceiptDocumentV2 t={t} receipt={receipt()} />);
    expect(html).not.toContain("REVERSED · VOID");
    expect(html).not.toContain("reversed in full");
  });

  it("partial reversals do not mark the receipt VOID", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocumentV2
        t={t}
        receipt={receipt({ isVoided: false, reversedAmount: 2000 })}
      />,
    );
    expect(html).not.toContain("REVERSED · VOID");
  });
});
