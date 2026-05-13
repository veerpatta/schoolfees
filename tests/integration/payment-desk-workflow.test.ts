import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPaymentDeskSearchIndex,
  buildPaymentConfirmationSummary,
  buildStudentSelectLabel,
  filterPaymentDeskStudents,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  shouldShowPaymentActionState,
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

  it("payment_reference_optional_for_all_modes", () => {
    const result = validatePaymentDraft({
      selectedStudent,
      amountInput: "1500",
      paymentDate: "2026-04-25",
      paymentMode: "upi",
      paymentModeLabel: "UPI",
      referenceNumber: "",
      receivedBy: "Office Staff",
      previewTotalPending: 4000,
    });
    expect(result.ok).toBe(true);
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

  it("collect another payment hides the old submit result before the next student is selected", () => {
    const successState = {
      status: "success",
      message: "Payment posted successfully. Receipt SVP-1 generated.",
      receiptNumber: "SVP-1",
      receiptId: "receipt-1",
      studentId: "student-1",
      amountReceived: 1500,
      quickDiscountApplied: 0,
      lateFeeWaivedApplied: 0,
      paymentDate: "2026-04-25",
      paymentMode: "cash",
      referenceNumber: null,
      receivedBy: "Office Staff",
      clientRequestId: "attempt-1",
      remainingBalance: 2500,
      diagnostic: null,
    } as const;

    expect(
      shouldShowPaymentActionState({
        state: successState,
        dismissedActionStateKey: null,
      }),
    ).toBe(true);
    expect(
      shouldShowPaymentActionState({
        state: successState,
        dismissedActionStateKey: "success:receipt-1:SVP-1:attempt-1:Payment posted successfully. Receipt SVP-1 generated.",
      }),
    ).toBe(false);
  });

  it("collect another payment preserves class filter and re-opens student picker", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const body = component.match(
      /function handleCollectAnotherPayment\(\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(body).not.toContain("setSelectedClassId");
    expect(body).toContain("setStudentSearchQuery(\"\")");
    expect(body).toContain("setSelectedStudentId(\"\")");
    expect(body).toContain("setIsStudentPickerOpen(Boolean(selectedClassId))");
    expect(body.indexOf("setIsStudentPickerOpen(Boolean(selectedClassId))")).toBeLessThan(
      body.indexOf("setStudentListScrollTop(0)"),
    );
    expect(body).toContain("setActiveStudentOptionIndex(0)");
    expect(body).toContain("focusStudentSearch(activeStudentPickerMode)");
  });

  it("shows today receipt banner when same student has a receipt on payment date", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const collectAnotherBody = component.match(
      /function handleCollectAnotherPayment\(\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(component).toContain("const latestReceiptToday = (() =>");
    expect(component).toContain("dismissedTodayReceiptId");
    expect(collectAnotherBody).toContain("setDismissedTodayReceiptId(null)");
    expect(component).toContain("already issued today");
    expect(component).toContain("onClick={() => setDismissedTodayReceiptId(latestReceiptToday.id)}");
  });

  it("quick amount chips have priority visual ranking with full due as accent", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const chipHelpers = component.match(
      /function getQuickAmountChipVariant[\s\S]*?function getQuickAmountChipClassName/,
    )?.[0] ?? "";

    expect(chipHelpers).toContain('quickAmount.key === "full") return "accent"');
    expect(chipHelpers).toContain('quickAmount.key === "clear") return "ghost"');
    expect(chipHelpers).toContain("Full Due ${formatInr(quickAmount.amount)}");
  });

  it("mode kept reminder appears only before the next student is selected", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("Mode kept from last payment:");
    expect(component).toContain('!selectedStudentId && paymentMode !== "cash"');
    expect(component).toContain("{selectedPaymentModeLabel}");
  });

  it("selected student banner has an accessible change button that clears the student", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const selectedBanner = component.match(
      /Selected:\{" "\}[\s\S]*?studentSearchSectionRef\.current\?\.scrollIntoView[\s\S]*?<\/button>/,
    )?.[0] ?? "";

    expect(component).toContain('aria-label="Change student"');
    expect(selectedBanner).toContain("clearSelectedStudent()");
    expect(selectedBanner).toContain("setStudentSearchQuery(\"\")");
    expect(selectedBanner).toContain("studentSearchSectionRef.current?.scrollIntoView");
  });

  it("today collection ticker receives optimistic increment after success", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const successEffect = component.match(
      /if \(state\.status === "success"\) \{[\s\S]*?if \(state\.studentId\)/,
    )?.[0] ?? "";

    expect(component).toContain("optimisticCollectionAdd");
    expect(successEffect).toContain("setOptimisticCollectionAdd");
    expect(component).toContain("(data.todayCollection?.totalAmount ?? 0) + optimisticCollectionAdd");
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

  it("payment_search_matches_name_sr_and_class_label", () => {
    const students = [
      {
        id: "s1",
        fullName: "Asha Sharma",
        admissionNo: "SR-001",
        classId: "c1",
        classLabel: "Class 1",
        studentStatus: "active",
      },
      {
        id: "s2",
        fullName: "Bhavesh Patel",
        admissionNo: "SR-099",
        classId: "c1",
        classLabel: "Class 1",
        studentStatus: "active",
      },
    ];
    const searchIndex = buildPaymentDeskSearchIndex(students);

    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "SR-099" })).toHaveLength(1);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "Asha" })).toHaveLength(1);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "Ramesh" })).toHaveLength(0);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "8888" })).toHaveLength(0);
    expect(filterPaymentDeskStudents({ students, searchIndex, selectedClassId: "c1", query: "class 1" })).toHaveLength(2);
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

  it("payment desk split keeps the required cashier dialogs and locked states", () => {
    const wrapper = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );
    const mobile = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const desktop = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-desktop.tsx"),
      "utf8",
    );
    const duplicate = readFileSync(
      join(process.cwd(), "components/payments/duplicate-receipt-sheet.tsx"),
      "utf8",
    );
    const component = [wrapper, mobile, desktop, duplicate].join("\n");

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
    expect(component).toContain("PayeeSummaryStrip");
    expect(component).toContain("latestReceiptToday");
    expect(component).toContain("ConfirmReceiptSheet");
    expect(component).toContain("SuccessReceiptSheet");
    expect(component).toContain("Review Receipt");
    expect(component).toContain("Will leave");
    expect(component).toContain("Fully clears pending dues");
    expect(component).toContain("createPortal");
    expect(component).toContain("form={formId}");
    expect(component).toContain('formId = "payment-entry-form"');
    expect(component).toContain("mounted && isConfirmOpen");
    expect(component).toContain("mounted && isSuccessOpen");
    expect(component).toContain("mounted && isDuplicateOpen");
    expect(component).toContain("प्रिय अभिभावक / Dear Parent,");
    expect(component).toContain("शुल्क प्राप्त / Payment received:");
    expect(component).toContain("रसीद / Receipt:");
    expect(component).toContain("धन्यवाद — Veer Patta School");
  });

  it("payment desk wrapper emits mobile and desktop branches with responsive classes", () => {
    const wrapper = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );

    expect(wrapper).toContain("PaymentDeskMobile");
    expect(wrapper).toContain("PaymentDeskDesktop");
    expect(wrapper).toContain("md:hidden");
    expect(wrapper).toContain("hidden md:block");
    expect(wrapper).toContain("dynamic(");
    expect(wrapper).toContain("ssr: true");
    expect(wrapper).not.toContain("isMobileView ? (");
  });

  it("all three payment desk overlay dialogs are rendered via createPortal", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    // createPortal is used for viewport-level overlays
    // (fixes contain:layout containing block trap)
    const portalCount = (component.match(/createPortal\(/g) ?? []).length;
    expect(portalCount).toBeGreaterThanOrEqual(3);

    // Body scroll is locked while any dialog is open
    expect(component).toContain("document.body.style.overflow");
    expect(component).toContain("isConfirmOpen || isSuccessOpen || isDuplicateOpen");

    // SSR safety - portals are guarded by mounted state
    expect(component).toContain("setMounted(true)");
    expect(component).toContain("mounted &&");

    // form attribute connects portaled submit buttons to the form
    expect(component).toContain("form={formId}");
  });

  it("confirm receipt sheet has no horizontal scrolling allocation table", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/confirm-receipt-sheet.tsx"),
      "utf8",
    );

    expect(component).not.toContain("min-w-[760px]");
    expect(component).not.toContain("overflow-x-auto");
    expect(component).toContain("Installment");
    expect(component).toContain("Allocated");
    expect(component).toContain("Remaining");
    expect(component).toContain("Save & Print Receipt");
    expect(component).toContain("Save Only");
    expect(component).toContain("Back / Edit");
    expect(component).toContain("Posted receipts stay in history");
    // Change 2: Hindi toggle removed
    expect(component).not.toContain("screenLanguage");
    expect(component).not.toContain("aria-pressed");
    // Change 5: new simplified layout
    expect(component).toContain("Confirm & Save Payment");
    expect(component).toContain("Installment details");
    expect(component).toContain("Amount received");
    expect(component).toContain("Balance after");
  });

  it("success receipt sheet shows receipt number prominently and has collect another CTA", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/success-receipt-sheet.tsx"),
      "utf8",
    );

    expect(component).toContain("Payment Successful");
    expect(component).toContain("Receipt has been saved");
    expect(component).toContain("Print Receipt");
    expect(component).toContain("Open Receipt");
    expect(component).toContain("Copy WhatsApp Message");
    expect(component).toContain("Collect Another Payment");
    expect(component.indexOf("Print Receipt")).toBeLessThan(
      component.indexOf("Collect Another Payment"),
    );
    expect(component).toContain("autoPrint");
    expect(component).toContain("onCollectAnother");
  });

  it("payee summary strip component contains sticky header and risk pills", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payee-summary-strip.tsx"),
      "utf8",
    );

    expect(component).toContain("sticky");
    expect(component).toContain("latestReceiptToday");
    expect(component).toContain("Overdue");
    expect(component).toContain("Credit");
    expect(component).toContain("Paid today");
    expect(component).toContain("tel:");
    expect(component).toContain("fatherPhone");
    expect(component).toContain("totalPending");
    expect(component).toContain("creditBalance");
    expect(component).toContain("overdueAmount");
  });

  it("collect another payment dismisses stale receipt success state in the component", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("dismissedActionStateKey");
    expect(component).toContain("visibleActionState");
    expect(component).toContain("ActionNotice state={visibleActionState}");
    expect(component).toContain("setDismissedActionStateKey(actionStateKey)");
    expect(component).toContain("setPreviewNotice(null)");
    expect(component).toContain("const latestReceipt = selectedStudentId ? latestStudentReceipt : data.recentReceipts[0] ?? null");
  });

  it("keeps mobile and desktop student picker refs separate for touch selection", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("studentSearchSectionRef");
    expect(component).toContain("mobileStudentPickerRef");
    expect(component).toContain("desktopStudentPickerRef");
    expect(component).toContain("mobileStudentSearchInputRef");
    expect(component).toContain("desktopStudentSearchInputRef");
    expect(component).toContain("mobileStudentListRef");
    expect(component).toContain("desktopStudentListRef");
    expect(component).not.toContain("const studentPickerRef = useRef");
    expect(component).not.toContain("const studentSearchInputRef = useRef");
    expect(component).not.toContain("const studentListRef = useRef");
  });

  it("late fee waiver is a checkbox and not a normal free text amount field", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("Waive full pending late fee");
    expect(component).toContain('type="checkbox"');
    expect(component).toContain('type="hidden" name="quickLateFeeWaiverAmount"');
    expect(component).not.toContain('id="quick-late-fee-waiver-amount"');
    // Change 3: waiver must appear before the inline mode segment in source order
    expect(component.indexOf("Waive full pending late fee")).toBeLessThan(
      component.indexOf("grid-cols-4 divide-x divide-border"),
    );
  });

  it("quick discount and late fee waiver update locally without refetching dues", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).not.toContain('quickDiscountAmount: String(quickDiscountAmount)');
    expect(component).not.toContain('quickLateFeeWaiverAmount: String(quickLateFeeWaiverAmount)');
    expect(component).not.toContain("}, [paymentDate, quickDiscountAmount, quickLateFeeWaiverAmount");
  });

  it("payment desk student picker uses accessible combobox with virtualized result rows", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
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
    expect(component).toContain("mobileStudentSearchInputRef.current?.blur()");
    expect(component).toContain("desktopStudentSearchInputRef.current?.blur()");
    expect(component).toContain("scrollIntoView");
    expect(component).toContain("amountSectionRef");
    expect(component).toContain("amountInputRef.current?.focus({ preventScroll: true })");
    expect(component).toContain("useDeferredValue(studentSearchQuery)");
    expect(component).toContain("query: deferredStudentSearchQuery");
  });

  it("class selection auto-opens student picker without jumping the page", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("setIsStudentPickerOpen(true)");
    expect(component).toContain("setActiveStudentOptionIndex(0)");
    expect(component).toContain("setStudentListScrollTop(0)");
    expect(component).toContain("studentList?.scrollTo({ top: 0 })");
    expect(component).toContain("studentSearchInput?.focus({ preventScroll: mode === \"mobile\" })");
    expect(component).toContain("studentSearchSectionRef.current?.scrollIntoView({ behavior: \"smooth\", block: \"start\" })");
    expect(component).not.toContain("studentPickerRef.current?.scrollIntoView");
  });

  it("fast payment form keeps amount entry ahead of dues review and does not auto-fill amount", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
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
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("previewLoading ||");
    expect(component).toContain("studentSummaryLoading ||");
    expect(component).toContain("Enter amount");
    expect(component).toContain("desktop-payment-class-id");
    expect(component).toContain("Mobile amount received");
    expect(component).toContain("Mobile discount");
    expect(component).toContain("Mobile payment mode");
  });

  it("mobile navigation and payment entry remain optimized for fast cashier flow", () => {
    const paymentDesk = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
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

  it("mobile payment mode is an inline 4-button segment, not a sheet", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    // Inline segments present
    expect(component).toContain("grid-cols-4");
    expect(component).toContain('"cash"');
    expect(component).toContain('"upi"');
    expect(component).toContain('"bank_transfer"');
    expect(component).toContain('"cheque"');
    // MobilePaymentModeSheet no longer rendered inline
    expect(component).not.toContain("<MobilePaymentModeSheet");
  });

  it("error banner renders above the payment card, not below the review button", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    // formError display must come before the amount input in source order
    expect(component.indexOf("formError")).toBeLessThan(
      component.indexOf("Mobile amount received"),
    );
    // Must have role="alert" for accessibility
    expect(component).toContain('role="alert"');
  });

  it("review button is wrapped in a sticky container on mobile", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("sticky bottom-0");
  });
});
