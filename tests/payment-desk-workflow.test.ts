import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPaymentConfirmationSummary,
  buildStudentSelectLabel,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  validatePaymentDraft,
} from "@/lib/payments/payment-desk-workflow";
import type { SelectedStudentSummary } from "@/lib/payments/types";

const selectedStudent = {
  id: "student-1",
  fullName: "Asha Sharma",
  admissionNo: "SR-1",
  classLabel: "Class 1",
  fatherName: null,
  fatherPhone: null,
  motherPhone: null,
  studentStatusLabel: "Old",
  transportRouteLabel: "No Transport",
  breakdown: [],
  totalDue: 5000,
  totalPaid: 1000,
  totalPending: 4000,
  creditBalance: 0,
  overpaidAmount: 0,
  refundableAmount: 0,
  rowsKeptForReview: 0,
  overdueAmount: 0,
  nextDueInstallmentLabel: "Installment 1",
  nextDueDate: "2026-04-20",
  nextDueAmount: 4000,
} satisfies SelectedStudentSummary;

describe("payment desk cashier workflow", () => {
  it("builds the confirmation summary before submit", () => {
    expect(
      buildPaymentConfirmationSummary({
        selectedStudent,
        amountInput: "1500",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "UPI-1",
        receivedBy: "Office Staff",
        previewTotalPending: 4000,
      }),
    ).toEqual({
      studentName: "Asha Sharma",
      admissionNo: "SR-1",
      classLabel: "Class 1",
      amount: 1500,
      paymentDate: "2026-04-25",
      paymentModeLabel: "Cash",
      referenceNumber: "UPI-1",
      receivedBy: "Office Staff",
      remainingBalance: 2500,
    });
  });

  it("invalid amount does not allow confirmation", () => {
    expect(
      validatePaymentDraft({
        selectedStudent,
        amountInput: "0",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 4000,
      }),
    ).toEqual({ ok: false, message: "Enter a valid whole rupee payment amount." });
  });

  it("amount above pending is blocked before the dialog opens", () => {
    expect(
      validatePaymentDraft({
        selectedStudent,
        amountInput: "4500",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 4000,
      }),
    ).toEqual({ ok: false, message: "Payment amount exceeds pending amount." });
  });

  it("payment_confirm_disabled_while_preview_loading", () => {
    expect(
      validatePaymentDraft({
        selectedStudent,
        amountInput: "1500",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 4000,
        isPreviewRefreshing: true,
      }),
    ).toEqual({ ok: false, message: "Wait for the dues preview to finish refreshing." });
  });

  it("payment_confirm_requires_reference_for_non_cash", () => {
    expect(
      validatePaymentDraft({
        selectedStudent,
        amountInput: "1500",
        paymentDate: "2026-04-25",
        paymentMode: "upi",
        paymentModeLabel: "UPI",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 4000,
        referenceRequired: true,
      }),
    ).toEqual({
      ok: false,
      message: "Reference number is required for UPI, bank transfer, and cheque payments.",
    });
  });

  it("payment_desk_blocks_payment_when_credit_and_no_pending", () => {
    expect(
      validatePaymentDraft({
        selectedStudent: { ...selectedStudent, creditBalance: 500 },
        amountInput: "100",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 0,
        creditBalance: 500,
      }),
    ).toEqual({ ok: false, message: "No pending dues. Student has Rs 500 credit." });
  });

  it("blocks duplicate client submission while posting or after success lock", () => {
    expect(shouldBlockClientSubmission({ isSubmitting: true, isLockedAfterSuccess: false })).toBe(true);
    expect(shouldBlockClientSubmission({ isSubmitting: false, isLockedAfterSuccess: true })).toBe(true);
    expect(shouldBlockClientSubmission({ isSubmitting: false, isLockedAfterSuccess: false })).toBe(false);
  });

  it("collect another payment clears risky fields while keeping the last payment mode", () => {
    expect(
      resetPaymentDraftForNextPayment({
        keepPaymentMode: "upi",
        defaultReceivedBy: "Office Staff",
      }),
    ).toEqual({
      amountInput: "",
      referenceNumber: "",
      remarks: "",
      paymentMode: "upi",
      receivedBy: "Office Staff",
    });
  });

  it("student labels avoid fake dues before selection", () => {
    expect(
      buildStudentSelectLabel({
        id: "student-1",
        fullName: "Asha Sharma",
        admissionNo: "SR-1",
        classLabel: "Class 1",
        fatherName: null,
        fatherPhone: null,
        motherPhone: null,
        pendingAmount: null,
      }),
    ).toContain("dues load after selection");
  });

  it("payment desk component contains the required cashier dialogs and locked states", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain("Confirm Payment");
    expect(component).toContain("Generate Receipt");
    expect(component).toContain("Posting payment...");
    expect(component).toContain("Payment Successful");
    expect(component).toContain("Receipt has been saved.");
    expect(component).toContain("Collect Another Payment");
    expect(component).toContain("Latest receipt posted at desk");
    expect(component).toContain("Amount to refund/adjust");
    expect(component).toContain("Required for this mode");
    expect(component).toContain("Similar payment already recorded");
    expect(component).toContain("isLockedAfterSuccess");
  });

  it("receipt_view_labels_current_balance_vs_receipt_balance", () => {
    const component = readFileSync(
      join(process.cwd(), "components/receipts/receipt-document.tsx"),
      "utf8",
    );

    expect(component).toContain("Balance after this receipt");
    expect(component).toContain("Current outstanding now");
  });
});
