import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Render the two parent documents to disk so a person can look at them.
 *
 * Not an assertion suite — a proof sheet. The layout questions these documents
 * raise ("does the signature sit on the rule?", "does the rupee glyph render or
 * is it a blank box?") cannot be answered by a string comparison, and the only
 * way they were ever answered before was by sending one to a parent.
 *
 *   npx vitest run --config scripts/smoke/vitest.smoke.config.ts \
 *     scripts/smoke/render-parent-documents.smoke.ts
 *
 * Writes into the directory named by SMOKE_OUT_DIR, defaulting to a gitignored
 * scratch folder.
 */

const OUT = process.env.SMOKE_OUT_DIR ?? path.join(process.cwd(), ".smoke-out");

/** Pages in a rendered PDF, read off the catalogue rather than rasterised. */
function pageCount(pdf: Buffer): number {
  const match = /\/Count\s+(\d+)/.exec(pdf.toString("latin1"));
  return match ? Number(match[1]) : 0;
}

const RECEIPT = {
  id: "00000000-0000-4000-8000-000000000001",
  studentId: "00000000-0000-4000-8000-000000000002",
  receiptNumber: "SVP20260912-0010",
  paymentDate: "2026-09-12",
  paymentMode: "bank_transfer" as const,
  totalAmount: 4500,
  referenceNumber: null,
  notes: null,
  receivedBy: "raj@vpps.co.in",
  createdAt: "2026-09-12T12:00:00.000Z",
  createdByName: "raj@vpps.co.in",
  studentFullName: "SMOKE TEST STUDENT",
  admissionNo: "TEST-2485",
  fatherName: "SMOKE TEST PARENT",
  fatherPhone: "9829142626",
  motherPhone: null,
  familyGroupId: null,
  parentEmail: null,
  classLabel: "Class 3",
  sessionLabel: "2026-27",
  transportRouteLabel: "-",
  studentStatusLabel: "Old" as const,
  feeSummary: [],
  totalDue: 47500,
  totalPaidBeforeReceipt: 28000,
  totalPaidToDate: 32500,
  outstandingAfterReceipt: 22000,
  currentOutstanding: 22000,
  discountAmount: 0,
  lateFeeAmount: 0,
  lateFeeWaived: 0,
  breakdown: [
    {
      paymentId: "00000000-0000-4000-8000-000000000003",
      installmentNo: 2,
      installmentLabel: "Installment 2",
      sessionLabel: "2026-27",
      dueDate: "2026-07-20",
      amount: 4500,
      originalAmount: 4500,
      adjustmentAmount: 0,
      effectiveAmount: 4500,
      notes: null,
      pendingBeforePosting: 11000,
      pendingAfterPosting: 6500,
    },
  ],
  installmentStatus: [
    { installmentNo: 1, label: "Installment 1", dueDate: "2026-04-20", pending: 0, status: "paid" as const },
    { installmentNo: 2, label: "Installment 2", dueDate: "2026-07-20", pending: 6500, status: "overdue" as const },
    { installmentNo: 3, label: "Installment 3", dueDate: "2026-10-20", pending: 6500, status: "pending" as const },
    { installmentNo: 4, label: "Installment 4", dueDate: "2027-01-20", pending: 6500, status: "pending" as const },
    {
      installmentNo: 5,
      label: "Previous year tuition balance from 2025-26",
      dueDate: "2026-04-01",
      pending: 0,
      status: "paid" as const,
    },
  ],
  previousReceipts: [],
  conventionalDiscountAssignments: [],
  isVoided: false,
  reversedAmount: 0,
  voidReason: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const STATEMENT_STUDENT = {
  fullName: "SMOKE TEST STUDENT",
  admissionNo: "TEST-2485",
  classLabel: "Class 3",
  fatherName: "SMOKE TEST PARENT",
  phones: ["9829142626"],
  summary: {
    rows: [],
    expectedGross: 47500,
    conventionalDiscount: 0,
    manualDiscount: 0,
    totalDiscount: 0,
    expectedNet: 47500,
    lateFeeCharged: 1000,
    lateFeeWaiver: 0,
    discountCloseouts: 0,
    paid: 32500,
    pending: 22000,
  },
  installments: [
    { label: "Installment 1", dueDate: "2026-04-20", baseCharge: 11000, lateFee: 0, paid: 11000, pending: 0, status: "paid" },
    { label: "Installment 2", dueDate: "2026-07-20", baseCharge: 11000, lateFee: 1000, paid: 4500, pending: 6500, status: "overdue" },
    { label: "Installment 3", dueDate: "2026-10-20", baseCharge: 6500, lateFee: 0, paid: 0, pending: 6500, status: "pending" },
    { label: "Installment 4", dueDate: "2027-01-20", baseCharge: 6500, lateFee: 0, paid: 0, pending: 6500, status: "pending" },
  ],
  receipts: [
    { number: "SVP20260912-0010", date: "2026-09-12", modeLabel: "Bank transfer", amount: 4500 },
    { number: "SVP20260420-0031", date: "2026-04-20", modeLabel: "Cash", amount: 11000 },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("parent documents render", () => {
  it("writes a receipt and a statement to look at", async () => {
    fs.mkdirSync(OUT, { recursive: true });

    const { renderReceiptPdf } = await import("@/modules/receipts/domain/receipt-pdf");
    const receipt = await renderReceiptPdf({ receipt: RECEIPT });
    fs.writeFileSync(path.join(OUT, "receipt.pdf"), receipt);

    const { renderFeeStatementPdf } = await import(
      "@/modules/students/domain/fee-statement-pdf"
    );
    const single = await renderFeeStatementPdf({
      students: [STATEMENT_STUDENT],
      sessionLabel: "2026-27",
      title: "Fee statement: SMOKE TEST STUDENT",
    });
    fs.writeFileSync(path.join(OUT, "statement.pdf"), single);

    // Two students is the family statement, which is the same renderer with a
    // longer list — the shape most likely to break a per-student page.
    const family = await renderFeeStatementPdf({
      students: [STATEMENT_STUDENT, { ...STATEMENT_STUDENT, fullName: "SMOKE TEST SIBLING", admissionNo: "TEST-2486" }],
      sessionLabel: "2026-27",
      title: "Family fee statement",
    });
    fs.writeFileSync(path.join(OUT, "family-statement.pdf"), family);

    expect(receipt.byteLength).toBeGreaterThan(1000);
    expect(single.byteLength).toBeGreaterThan(1000);
    expect(family.byteLength).toBeGreaterThan(single.byteLength);

    // A receipt is ONE page, and the fixture above is the worst realistic case:
    // five year tiles including a carry-forward row, plus the explanatory note
    // that only prints when the three summary figures do not subtract.
    //
    // This is not a style preference. The parent stub lives at the bottom, so a
    // receipt that spills is a receipt whose stub is on a page nobody prints —
    // and on WhatsApp a second page is a second swipe most people never take.
    expect(pageCount(receipt), "the receipt must fit one page").toBe(1);
    expect(pageCount(single), "a single-student statement must fit one page").toBe(1);
  });
});
