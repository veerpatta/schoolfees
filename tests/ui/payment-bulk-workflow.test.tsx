import { describe, expect, it } from "vitest";

import { getDefaultSelectedPaymentRowIds } from "@/components/payments/bulk/bulk-payment-workflow";
import type { PaymentImportBatchSummary, PaymentImportRowView } from "@/lib/payments/bulk/types";

function paymentRow(overrides: Partial<PaymentImportRowView>): PaymentImportRowView {
  return {
    id: "row-1",
    rowNumber: 2,
    admissionNo: "TEST-2486",
    studentId: "student-1",
    studentName: "Test Student",
    paymentDate: "2026-07-31",
    paymentMode: "cash",
    amount: 6300,
    remarks: null,
    validationStatus: "valid",
    validationMessages: [],
    duplicateAcknowledged: false,
    intraFileDuplicate: false,
    existingReceiptDuplicate: false,
    receiptId: null,
    receiptNumber: null,
    postedAt: null,
    postError: null,
    ...overrides,
  };
}

function summary(rows: PaymentImportRowView[]): PaymentImportBatchSummary {
  return {
    batchId: "00000000-0000-4000-8000-000000000001",
    sessionLabel: "TEST-2026-27",
    fileName: "test-payments.xlsx",
    status: "validated",
    totalRows: rows.length,
    validRows: rows.filter((row) => row.validationStatus === "valid").length,
    warningRows: rows.filter((row) => row.validationStatus === "warning").length,
    errorRows: rows.filter((row) => row.validationStatus === "error").length,
    postedRows: rows.filter((row) => row.postedAt).length,
    rows,
  };
}

describe("bulk payment review defaults", () => {
  it("selects only valid unposted rows by default", () => {
    const selected = getDefaultSelectedPaymentRowIds(
      summary([
        paymentRow({ id: "valid" }),
        paymentRow({ id: "warning", validationStatus: "warning" }),
        paymentRow({ id: "error", validationStatus: "error" }),
        paymentRow({ id: "posted", postedAt: "2026-07-31T06:00:00Z" }),
      ]),
    );

    expect([...selected]).toEqual(["valid"]);
  });

  it("restores a previously acknowledged warning as selectable", () => {
    const selected = getDefaultSelectedPaymentRowIds(
      summary([
        paymentRow({
          id: "acknowledged-warning",
          validationStatus: "warning",
          duplicateAcknowledged: true,
        }),
      ]),
    );

    expect([...selected]).toEqual(["acknowledged-warning"]);
  });
});
