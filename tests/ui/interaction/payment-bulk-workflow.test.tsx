import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkPaymentWorkflow } from "@/modules/payments/ui/bulk/bulk-payment-workflow";
import type { PaymentImportBatchSummary } from "@/modules/payments/domain/bulk/types";

const BATCH_SUMMARY: PaymentImportBatchSummary = {
  batchId: "00000000-0000-4000-8000-000000000001",
  sessionLabel: "TEST-2026-27",
  fileName: "test-payments.xlsx",
  status: "validated",
  totalRows: 2,
  validRows: 1,
  warningRows: 1,
  errorRows: 0,
  postedRows: 0,
  rows: [
    {
      id: "valid-row",
      rowNumber: 2,
      admissionNo: "TEST-2486",
      studentId: "student-1",
      studentName: "Test Student One",
      paymentDate: "2026-07-31",
      paymentMode: "cash",
      amount: 6300,
      remarks: "Installment",
      validationStatus: "valid",
      validationMessages: [],
      duplicateAcknowledged: false,
    intraFileDuplicate: false,
    existingReceiptDuplicate: false,
      receiptId: null,
      receiptNumber: null,
      postedAt: null,
      postError: null,
    },
    {
      id: "warning-row",
      rowNumber: 3,
      admissionNo: "TEST-2487",
      studentId: "student-2",
      studentName: "Test Student Two",
      paymentDate: "2026-07-31",
      paymentMode: "upi",
      amount: 5000,
      remarks: null,
      validationStatus: "warning",
      validationMessages: ["Possible duplicate."],
      duplicateAcknowledged: false,
    intraFileDuplicate: false,
    existingReceiptDuplicate: false,
      receiptId: null,
      receiptNumber: null,
      postedAt: null,
      postError: null,
    },
  ],
};

beforeEach(() => {
  window.history.replaceState(
    {},
    "",
    "/protected/payments/bulk?session=TEST-2026-27&batch=00000000-0000-4000-8000-000000000001",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ summary: BATCH_SUMMARY }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

describe("BulkPaymentWorkflow", () => {
  it("resumes a staged batch and gates posting behind selection and total reconciliation", async () => {
    const user = userEvent.setup();
    render(
      <BulkPaymentWorkflow
        sessionLabel="TEST-2026-27"
        initialBatchId="00000000-0000-4000-8000-000000000001"
      />,
    );

    await screen.findByText("2. Review and reconcile — test-payments.xlsx");
    expect(fetch).toHaveBeenCalledWith(
      "/api/imports/payments/batch/00000000-0000-4000-8000-000000000001/summary",
    );

    const validRow = screen.getByRole("checkbox", {
      name: "Select spreadsheet row 2 for posting",
    });
    const warningRow = screen.getByRole("checkbox", {
      name: "Select spreadsheet row 3 for posting",
    });
    expect(validRow).toBeChecked();
    expect(warningRow).toBeDisabled();
    expect(screen.getByRole("button", { name: "Post 1 · ₹6,300" })).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I checked the session, student matches, selected row count/i,
      }),
    );
    expect(screen.getByRole("button", { name: "Post 1 · ₹6,300" })).toBeEnabled();

    await user.click(
      screen.getByRole("checkbox", { name: "Confirmed as a separate payment" }),
    );
    await waitFor(() => expect(warningRow).toBeChecked());
    expect(screen.getByRole("button", { name: "Post 2 · ₹11,300" })).toBeDisabled();
  });
});
