import { describe, expect, it } from "vitest";

import { renderFeeStatementPdf, type FeePdfStudent } from "@/lib/students/fee-statement-pdf";
import type { FeeBreakdownSummary } from "@/lib/fees/fee-breakdown-summary";

function summary(): FeeBreakdownSummary {
  return {
    rows: [
      { id: "tuition", label: "Tuition fee", amount: 12000, kind: "charge" },
      { id: "transport", label: "Transport fee", amount: 3000, kind: "charge" },
    ] as FeeBreakdownSummary["rows"],
    expectedGross: 15000,
    conventionalDiscount: 0,
    manualDiscount: 0,
    totalDiscount: 0,
    expectedNet: 15000,
    lateFeeCharged: 1000,
    lateFeeWaiver: 0,
    discountCloseouts: 0,
    paid: 5000,
    pending: 11000,
  };
}

const student: FeePdfStudent = {
  fullName: "TEST Student",
  admissionNo: "TEST-SR-001",
  classLabel: "Class 9",
  fatherName: "TEST Father",
  phones: ["9876543210"],
  summary: summary(),
  installments: [
    {
      label: "Installment 1",
      dueDate: "2026-04-20",
      baseCharge: 3750,
      lateFee: 1000,
      paid: 3750,
      pending: 1000,
      status: "partial",
    },
  ],
  receipts: [
    { number: "SVP-001", date: "2026-04-21", modeLabel: "Cash", amount: 5000 },
  ],
};

describe("renderFeeStatementPdf (bilingual)", () => {
  it("registers the Devanagari font and renders a valid PDF buffer", async () => {
    const buffer = await renderFeeStatementPdf({
      students: [student],
      sessionLabel: "TEST-2026-27",
      title: "Fee statement: TEST Student",
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF magic header — proves render() completed without throwing on the
    // Font.register path (i.e. the TTFs were found and embedded).
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
