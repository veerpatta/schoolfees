import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPaymentDeskSearchIndex,
  buildPaymentConfirmationSummary,
  buildStudentSelectLabel,
  filterPaymentDeskStudents,
  paymentModeNeedsReference,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  validatePaymentDraft,
} from "@/lib/payments/payment-desk-workflow";
import type { SelectedStudentSummary } from "@/lib/payments/types";
import { buildReceiptPreviewAllocation } from "@/lib/payments/allocation";

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
  breakdown: [
    {
      installmentId: "installment-1",
      installmentNo: 1,
      installmentLabel: "Installment 1",
      dueDate: "2026-04-20",
      amountDue: 1100,
      paymentsTotal: 0,
      adjustmentsTotal: 0,
      outstandingAmount: 1100,
      rawLateFee: 100,
      waiverApplied: 0,
      finalLateFee: 100,
      balanceStatus: "pending",
    },
  ],
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
      pendingBeforeDiscount: 4000,
      quickDiscountApplied: 0,
      lateFeeWaivedApplied: 0,
      revisedPendingBeforePayment: 4000,
      paymentDate: "2026-04-25",
      paymentModeLabel: "Cash",
      referenceNumber: "UPI-1",
      receivedBy: "Office Staff",
      remainingBalance: 2500,
    });
  });

  it("shows revised payable when cashier applies a quick discount", () => {
    expect(
      buildPaymentConfirmationSummary({
        selectedStudent: { ...selectedStudent, totalPending: 1000 },
        amountInput: "900",
        quickDiscountInput: "100",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 1000,
      }),
    ).toMatchObject({
      pendingBeforeDiscount: 1000,
      quickDiscountApplied: 100,
      lateFeeWaivedApplied: 0,
      revisedPendingBeforePayment: 900,
      amount: 900,
      remainingBalance: 0,
    });
  });

  it("blocks overpayment against revised payable after discount", () => {
    expect(
      validatePaymentDraft({
        selectedStudent: { ...selectedStudent, totalPending: 1000 },
        amountInput: "1000",
        quickDiscountInput: "100",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 1000,
      }),
    ).toEqual({ ok: false, message: "Payment amount exceeds net payable after discount." });
  });

  it("late fee waiver reduces payable in the confirmation summary", () => {
    expect(
      buildPaymentConfirmationSummary({
        selectedStudent: { ...selectedStudent, totalPending: 1100 },
        amountInput: "1000",
        quickLateFeeWaiverInput: "100",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentModeLabel: "Cash",
        referenceNumber: "",
        receivedBy: "Office Staff",
        previewTotalPending: 1100,
      }),
    ).toMatchObject({
      pendingBeforeDiscount: 1100,
      quickDiscountApplied: 0,
      lateFeeWaivedApplied: 100,
      revisedPendingBeforePayment: 1000,
      amount: 1000,
      remainingBalance: 0,
    });
  });

  it("builds receipt preview allocation with discount waiver cash and remaining columns", () => {
    expect(
      buildReceiptPreviewAllocation({
        installments: selectedStudent.breakdown,
        paymentAmount: 900,
        quickDiscountAmount: 100,
        quickLateFeeWaiverAmount: 100,
      }),
    ).toEqual([
      {
        installmentId: "installment-1",
        installmentLabel: "Installment 1",
        dueDate: "2026-04-20",
        pendingBefore: 1100,
        discountApplied: 100,
        lateFeeWaived: 100,
        amountReceived: 900,
        remaining: 0,
      },
    ]);
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

  it("payment_reference_required_for_upi_bank_and_cheque", () => {
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

  it("marks reference-required payment modes for desk safety prompts", () => {
    expect(paymentModeNeedsReference("upi")).toBe(true);
    expect(paymentModeNeedsReference("bank_transfer")).toBe(true);
    expect(paymentModeNeedsReference("cheque")).toBe(true);
    expect(paymentModeNeedsReference("cash")).toBe(false);
  });

  it("student labels stay short and show SR no", () => {
    expect(
      buildStudentSelectLabel({
        id: "student-1",
        fullName: "Asha Sharma",
        admissionNo: "SR-1",
        classId: "class-1",
        classLabel: "Class 1",
        fatherName: null,
        fatherPhone: null,
        motherPhone: null,
        studentStatus: "active",
        pendingAmount: null,
      }),
    ).toBe("Asha Sharma — SR: SR-1");
  });

  it("payment_search_matches_name_sr_father_phone", () => {
    const students = [
      {
        id: "s1",
        fullName: "Asha Sharma",
        admissionNo: "SR-001",
        classId: "c1",
        classLabel: "Class 1",
        fatherName: "Ramesh Sharma",
        fatherPhone: "9999999999",
        motherPhone: null,
        studentStatus: "active",
      },
      {
        id: "s2",
        fullName: "Bhavesh Patel",
        admissionNo: "SR-099",
        classId: "c1",
        classLabel: "Class 1",
        fatherName: "Mahesh Patel",
        fatherPhone: "8888888888",
        motherPhone: null,
        studentStatus: "active",
      },
    ];
    const searchIndex = buildPaymentDeskSearchIndex(students);

    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "SR-099" })).toHaveLength(1);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "Asha" })).toHaveLength(1);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "Ramesh" })).toHaveLength(1);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "8888" })).toHaveLength(1);
  });

  it("payment_search_not_limited_to_first_80", () => {
    const students = Array.from({ length: 120 }, (_, index) => ({
      id: `s-${index + 1}`,
      fullName: `Student ${String(index + 1).padStart(3, "0")}`,
      admissionNo: `SR-${String(index + 1).padStart(3, "0")}`,
      classId: "c1",
      classLabel: "Class 1",
      fatherName: null,
      fatherPhone: null,
      motherPhone: null,
      studentStatus: "active",
    }));
    const searchIndex = buildPaymentDeskSearchIndex(students);
    const matches = filterPaymentDeskStudents({
      students,
      searchIndex,
      selectedClassId: "c1",
      query: "SR-120",
      limit: 200,
    });

    expect(matches.map((item) => item.admissionNo)).toContain("SR-120");
  });

  it("payment_search_handles_large_list_with_index_reuse", () => {
    const students = Array.from({ length: 5000 }, (_, index) => ({
      id: `s-${index + 1}`,
      fullName: `Student ${String(index + 1).padStart(4, "0")}`,
      admissionNo: `SR-${String(index + 1).padStart(4, "0")}`,
      classId: "c1",
      classLabel: "Class 1",
      fatherName: `Father ${index + 1}`,
      fatherPhone: `98${String(index).padStart(8, "0")}`,
      motherPhone: null,
      studentStatus: "active",
    }));
    const searchIndex = buildPaymentDeskSearchIndex(students);

    const matches = filterPaymentDeskStudents({
      students,
      searchIndex,
      selectedClassId: "c1",
      query: "SR-4999",
      limit: 20,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.admissionNo).toBe("SR-4999");
  });

  it("payment desk component contains the required cashier dialogs and locked states", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain("Receipt Preview");
    expect(component).toContain("Confirm Payment");
    expect(component).toContain("Collect");
    expect(component).toContain("Dues Details");
    expect(component).toContain("Recent Receipt");
    expect(component).toContain("Notes");
    expect(component).toContain("Confirm & Save Receipt");
    expect(component).toContain("Posting payment...");
    expect(component).toContain("Payment Successful");
    expect(component).toContain("Receipt has been saved.");
    expect(component).toContain("Collect Another Payment");
    expect(component).toContain("Latest receipt:");
    expect(component).toContain("Amount to refund/adjust");
    expect(component).toContain("Reference number");
    expect(component).toContain("Copy WhatsApp Message");
    expect(component).toContain("animate-bottom-sheet-up");
    expect(component).toContain("animate-success-check");
    expect(component).toContain("Similar payment already recorded");
    expect(component).toContain("isLockedAfterSuccess");
  });

  it("late fee waiver is a checkbox and not a normal free text amount field", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain("Waive full pending late fee");
    expect(component).toContain('type="checkbox"');
    expect(component).toContain('type="hidden" name="quickLateFeeWaiverAmount"');
    expect(component).not.toContain('id="quick-late-fee-waiver-amount"');
  });

  it("quick discount and late fee waiver update locally without refetching dues", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).not.toContain('quickDiscountAmount: String(quickDiscountAmount)');
    expect(component).not.toContain('quickLateFeeWaiverAmount: String(quickLateFeeWaiverAmount)');
    expect(component).not.toContain("}, [paymentDate, quickDiscountAmount, quickLateFeeWaiverAmount");
  });

  it("payment desk student picker uses accessible combobox with virtualized result rows", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain('role="combobox"');
    expect(component).toContain('role="listbox"');
    expect(component).toContain("studentComboboxRowHeight");
    expect(component).toContain("filteredStudents.slice");
    expect(component).toContain("Selected:");
    expect(component).toContain("Clear");
    expect(component).toContain("setIsStudentPickerOpen(false)");
    expect(component).toContain("setActiveStudentOptionIndex(-1)");
    expect(component).toContain("studentSearchInputRef.current?.blur()");
    expect(component).not.toContain("scrollIntoView");
    expect(component).not.toContain("amountSectionRef");
    expect(component).toContain("amountInputRef.current?.focus({ preventScroll: true })");
    expect(component).toContain("useDeferredValue(studentSearchQuery)");
    expect(component).toContain("query: deferredStudentSearchQuery");
  });

  it("class selection auto-opens student picker without jumping the page", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain("setIsStudentPickerOpen(true)");
    expect(component).toContain("setActiveStudentOptionIndex(0)");
    expect(component).toContain("setStudentListScrollTop(0)");
    expect(component).toContain("studentListRef.current?.scrollTo({ top: 0 })");
    expect(component).toContain("studentSearchInputRef.current?.focus({ preventScroll: true })");
    expect(component).not.toContain("studentPickerRef.current?.scrollIntoView");
  });

  it("fast payment form keeps amount entry ahead of dues review and does not auto-fill amount", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component.indexOf('title="3. Fast Payment"')).toBeLessThan(
      component.indexOf('title="3. Review Dues"'),
    );
    expect(component).toContain('title="3. Fast Payment"');
    expect(component).toContain("Loading dues...");
    expect(component).toContain("Pending:");
    expect(component).toContain("Overdue:");
    expect(component).toContain("Next due:");
    expect(component).not.toContain("setPaymentAmountInput(payload.suggestedDefaultAmount");
  });

  it("mobile cashier CTA remains disabled while summary or preview is loading", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(component).toContain("previewLoading ||");
    expect(component).toContain("studentSummaryLoading ||");
    expect(component).toContain("Enter amount to continue");
    expect(component).toContain("desktop-payment-class-id");
    expect(component).toContain("Mobile amount received");
    expect(component).toContain("Mobile discount");
    expect(component).toContain("Mobile payment mode");
  });

  it("mobile navigation and payment entry remain optimized for fast cashier flow", () => {
    const paymentDesk = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );
    const topbar = readFileSync(
      join(process.cwd(), "components/admin/app-topbar.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      join(process.cwd(), "components/admin/dashboard-shell.tsx"),
      "utf8",
    );
    const mobileNav = readFileSync(
      join(process.cwd(), "components/admin/mobile-bottom-nav.tsx"),
      "utf8",
    );

    expect(topbar).not.toContain("hideMobileBottomNav");
    expect(topbar).not.toContain("fixed inset-x-0 bottom-0");
    expect(shell).toContain("<MobileBottomNav staffRole={staffRole} />");
    expect(mobileNav).toContain("fixed inset-x-0 bottom-0");
    expect(paymentDesk).not.toContain('className="sticky top-[72px] z-[5] bg-white/95 md:static md:bg-white"');
    expect(paymentDesk).toContain("Amount received");
    expect(paymentDesk.indexOf('title=\"3. Fast Payment\"')).toBeLessThan(
      paymentDesk.indexOf('title=\"3. Review Dues\"'),
    );
    expect(paymentDesk).toContain("setPaymentAmountInput(\"\");");
    expect(paymentDesk).not.toContain("payload.suggestedDefaultAmount && payload.suggestedDefaultAmount > 0");
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
