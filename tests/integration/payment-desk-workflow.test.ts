import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPaymentDeskSearchIndex,
  buildPaymentConfirmationSummary,
  buildStudentSelectLabel,
  filterPaymentDeskStudents,
  getNextStudentOptionIndex,
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
    expect(body).toContain('if (activeStudentPickerMode === "desktop")');
    expect(body).toContain("focusStudentSearch(activeStudentPickerMode)");
  });

  it("mobile class stats use cached summaries and report zero pending when all cached students are paid", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const statsBody = component.match(
      /function getClassStats\(classId: string\): \{ total: number; pendingCount: number; pendingTotal: number \| null \} \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(component).toContain("function getStudentPendingAmount(studentId: string): number | null");
    expect(component).toContain("summaryCache.current.get(key) ?? cardOnlyCache.current.get(key)");
    expect(statsBody).toContain("const amt = getStudentPendingAmount(s.id)");
    expect(statsBody).toContain("pendingTotal: allKnown ? (pendingTotal ?? 0) : null");
  });

  it("mobile class streak skips the class picker after repeated same-class use", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const restoreEffect = component.match(
      /useEffect\(\(\) => \{\r?\n    if \(isMobileView\) return;[\s\S]*?lastClassRestoreAttemptedRef\.current = true;[\s\S]*?\}, \[classOptions, data\.initialClassId, isMobileView, selectedClassId\]\);/,
    )?.[0] ?? "";
    const autoOpenEffect = component.match(
      /const streak = getClassStreak\(\);[\s\S]*?setMobileSheetView\("class-picker"\);/,
    )?.[0] ?? "";
    const selectMobileClass = component.match(
      /function selectMobileClass\(nextClassId: string\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(component).toContain('paymentDeskClassStreakStorageKey = "vpps.paymentDesk.classStreak"');
    expect(component).toContain("type ClassStreak = { classId: string; count: number }");
    expect(component).toContain("function recordClassUsed(classId: string)");
    expect(component).toContain("function getClassStreak(): ClassStreak | null");
    expect(restoreEffect).toContain("if (isMobileView) return;");
    expect(selectMobileClass).toContain("recordClassUsed(nextClassId)");
    expect(autoOpenEffect).toContain("streak.count >= 3");
    expect(autoOpenEffect).toContain("setSelectedClassId(streak.classId)");
    expect(autoOpenEffect).toContain('setMobileSheetView("student-picker")');
    expect(autoOpenEffect).not.toContain("storedClassId");
  });

  it("all classes reset keeps the student picker open and searchable", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const body = component.match(
      /function handleClassChange\(nextClassId: string, mode: "mobile" \| "desktop"\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(body).toContain("setIsStudentPickerOpen(true)");
    expect(body).toContain("setActiveStudentOptionIndex(0)");
    expect(body).toContain('if (mode === "desktop")');
    expect(body).toContain("focusStudentSearch(mode)");
    expect(body).not.toContain("setIsStudentPickerOpen(false)");
    expect(body).not.toContain("desktopStudentSearchInputRef.current?.blur()");
    expect(component).toContain("lastClassRestoreAttemptedRef.current");
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
    const sheet = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );

    expect(sheet).toContain('aria-label="Change student"');
    expect(sheet).toContain("onChangeStudent");
    expect(component).toContain("clearSelectedStudent()");
    expect(component).toContain('setMobileSheetView("student-picker")');
  });

  it("cash payments under the fast-post threshold submit without opening the confirm sheet", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const openConfirmationBody = component.match(
      /function openConfirmationDialog\(\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";
    const submitBody = component.match(
      /onSubmit=\{\(event\) => \{([\s\S]*?)\n              \}\}/,
    )?.[1] ?? "";

    expect(component).toContain("const CASH_FAST_POST_THRESHOLD = 15000");
    expect(component).toContain("const fastPostRequestedRef = useRef(false)");
    expect(openConfirmationBody).toContain("paymentMode === \"cash\"");
    expect(openConfirmationBody).toContain("paymentAmount <= CASH_FAST_POST_THRESHOLD");
    expect(openConfirmationBody).toContain("fastPostRequestedRef.current = true");
    expect(openConfirmationBody).toContain("form.requestSubmit()");
    expect(submitBody).toContain("!isConfirmOpen && !fastPostRequestedRef.current");
    expect(submitBody).toContain("fastPostRequestedRef.current = false");
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

  it("success handling stores the last amount and triggers mobile haptics once per receipt", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const successEffect = component.match(
      /if \(state\.status === "success"\) \{[\s\S]*?navigator\.vibrate/,
    )?.[0] ?? "";

    expect(component).toContain("const [lastPostedAmount, setLastPostedAmount] = useState<number | null>(null)");
    expect(successEffect).toContain("setLastPostedAmount(state.amountReceived)");
    expect(successEffect).toContain("navigator.vibrate");
    expect(successEffect).toContain("optimisticReceiptKeyRef.current = actionStateKey");
    expect(component).toContain("lastPostedAmount={lastPostedAmount}");
    expect(component).toContain("setPaymentAmountInput(String(lastPostedAmount))");
  });

  it("payment date backdated warning is visible and non-dismissable", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const backdatedBlock = component.match(
      /paymentDateIsBackdated \? \([\s\S]*?BACKDATED[\s\S]*?\) : null/,
    )?.[0] ?? "";

    expect(component).toContain("const paymentDateIsBackdated = paymentDate !== todayDateString");
    expect(backdatedBlock).toContain("BACKDATED");
    expect(backdatedBlock).not.toContain("setDismissed");
  });

  it("desktop amount input supports F1-F4 payment mode hotkeys and Enter to review", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const desktopAmountInput = component.match(
      /aria-label="Amount received"[\s\S]*?onKeyDown=\{\(event\) => \{([\s\S]*?)\n                    \}\}/,
    )?.[0] ?? "";

    expect(desktopAmountInput).toContain('event.key === "F1"');
    expect(desktopAmountInput).toContain('event.key === "F2"');
    expect(desktopAmountInput).toContain('event.key === "F3"');
    expect(desktopAmountInput).toContain('event.key === "F4"');
    expect(desktopAmountInput).toContain('event.key === "Enter"');
    expect(desktopAmountInput.indexOf("draftValidation.ok")).toBeLessThan(
      desktopAmountInput.indexOf("openConfirmationDialog()"),
    );
    expect(component).toContain("F1 Cash");
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

  it("payment_search_all_classes_returns_the_full_index_by_default", () => {
    const students = Array.from({ length: 260 }, (_, index) => ({
      id: `s-${index + 1}`,
      fullName: `Student ${String(index + 1).padStart(3, "0")}`,
      admissionNo: `TEST-${String(index + 1).padStart(3, "0")}`,
      classId: index % 2 === 0 ? "nursery" : "class-1",
      classLabel: index % 2 === 0 ? "Nursery" : "Class 1",
      studentStatus: "active",
    }));
    const searchIndex = buildPaymentDeskSearchIndex(students);

    expect(
      filterPaymentDeskStudents({
        students,
        searchIndex,
        selectedClassId: "",
        query: "",
      }),
    ).toHaveLength(260);
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
    const success = readFileSync(
      join(process.cwd(), "components/payments/success-receipt-sheet.tsx"),
      "utf8",
    );
    const mobileSheet = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );
    const component = [wrapper, mobile, desktop, duplicate, success, mobileSheet].join("\n");

    expect(component).toContain("Receipt Preview");
    expect(component).toContain("Confirm Payment");
    expect(component).toContain("Collect");
    expect(component).toContain("Total pending");
    expect(component).toContain("Recent Receipt");
    expect(component).toContain("Notes");
    expect(component).toContain("Confirm & Save Receipt");
    expect(component).toContain("Posting payment...");
    expect(component).toContain("Payment Successful");
    expect(component).toContain("Receipt has been saved.");
    expect(component).toContain("Collect Another Payment");
    expect(component).toContain("Latest receipt:");
    expect(component).toContain("Amount to refund/adjust");
    expect(component).toContain("referenceNumber");
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
    expect(component).toContain("Clears");
    expect(component).toContain("createPortal");
    expect(component).toContain("form={formId}");
    expect(component).toContain('formId = "payment-entry-form"');
    expect(component).toContain("mounted && isConfirmOpen");
    expect(component).toContain("mounted && isSuccessOpen");
    expect(component).toContain("mounted && isDuplicateOpen");
    expect(component).toContain("Dear Parent,");
    expect(component).toContain("Payment received:");
    expect(component).toContain("Receipt:");
    expect(component).toContain("Veer Patta School");
  });

  it("payment desk entry keeps one client state owner for mobile and desktop", () => {
    const wrapper = readFileSync(
      join(process.cwd(), "components/payments/payment-entry-client.tsx"),
      "utf8",
    );
    const desktop = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-desktop.tsx"),
      "utf8",
    );
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(wrapper).toContain("PaymentDeskClient");
    expect(wrapper).not.toContain("PaymentDeskDesktop");
    expect(wrapper).not.toContain("dynamic(");
    expect(wrapper).not.toContain("md:hidden");
    expect(wrapper).not.toContain("hidden md:block");
    expect(component).toContain("export function PaymentDeskClient");
    expect(component).toContain("export const PaymentDeskMobile = PaymentDeskClient");
    expect(desktop).toContain("PaymentDeskClient");
    expect(component).toContain("PaymentDeskRoot");
    expect(component).toContain("DesktopPaymentDeskSection");
    expect(component).toContain("DesktopPaymentDeskStudentPanel");
    expect(wrapper).not.toContain("isMobileView ? (");
  });

  it("student combobox keyboard movement is bounded and starts from the first result", () => {
    expect(getNextStudentOptionIndex({ currentIndex: -1, resultCount: 5, key: "ArrowDown" })).toBe(0);
    expect(getNextStudentOptionIndex({ currentIndex: 4, resultCount: 5, key: "ArrowDown" })).toBe(4);
    expect(getNextStudentOptionIndex({ currentIndex: 0, resultCount: 5, key: "ArrowUp" })).toBe(0);
    expect(getNextStudentOptionIndex({ currentIndex: -1, resultCount: 0, key: "ArrowDown" })).toBe(-1);
  });

  it("student combobox declares listbox popup semantics for mobile and desktop search", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const mobileSheet = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );
    const combined = `${component}\n${mobileSheet}`;

    expect(combined.match(/aria-haspopup="listbox"/g)).toHaveLength(2);
    expect(combined).toContain('role="combobox"');
    expect(combined).toContain('role="listbox"');
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

  it("success receipt sheet offers a WhatsApp deep link only when a phone is available", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/success-receipt-sheet.tsx"),
      "utf8",
    );

    expect(component).toContain("const rawPhone = (whatsappPhone ?? \"\").replace(/\\D/g, \"\")");
    expect(component).toContain("https://wa.me/${normalizedWhatsappPhone}?text=${encodeURIComponent(whatsappMessage)}");
    expect(component).toContain("whatsappHref ? (");
    expect(component).toContain("Send WhatsApp");
    expect(component).toContain("Copy WhatsApp Message");
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
    const mobileSheet = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );
    const combined = `${component}\n${mobileSheet}`;

    expect(combined).toContain('role="combobox"');
    expect(combined).toContain('role="listbox"');
    expect(component).toContain("studentComboboxRowHeight");
    expect(component).toContain("filteredStudents.slice");
    expect(mobileSheet).toContain("Recent");
    expect(mobileSheet).toContain("No matching students.");
    expect(component).toContain("setIsStudentPickerOpen(false)");
    expect(component).toContain("setActiveStudentOptionIndex(-1)");
    expect(component).toContain("mobileStudentSearchInputRef.current?.blur()");
    expect(component).toContain("desktopStudentSearchInputRef.current?.blur()");
    expect(component).toContain("amountSectionRef");
    expect(mobileSheet).toContain("onMouseDown={(event) => event.preventDefault()}");
    expect(component).toContain("useDeferredValue(studentSearchQuery)");
    expect(component).toContain("query: deferredStudentSearchQuery");
  });

  it("class selection auto-opens student picker without jumping the page", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const body = component.match(
      /function handleClassChange\(nextClassId: string, mode: "mobile" \| "desktop"\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(body).toContain("setIsStudentPickerOpen(true)");
    expect(body).toContain("setActiveStudentOptionIndex(0)");
    expect(body).toContain("setStudentListScrollTop(0)");
    expect(component).toContain("studentList?.scrollTo({ top: 0 })");
    expect(body).toContain('if (mode === "desktop")');
    expect(body).toContain("focusStudentSearch(mode);");
    expect(component).toContain("desktopStudentSearchInputRef.current?.focus({ preventScroll: false })");
    expect(component).not.toContain('preventScroll: mode === "mobile"');
    expect(component).toContain('setMobileSheetView("student-picker")');
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
    const mobileSheet = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );

    expect(component).toContain("previewLoading ||");
    expect(component).toContain("studentSummaryLoading ||");
    expect(mobileSheet).toContain("Enter amount");
    expect(component).toContain("desktop-payment-class-id");
    expect(component).toContain("<MobilePaymentFlowSheet");
    expect(mobileSheet).toContain('type="text"');
    expect(mobileSheet).toContain("onAmountChange(sanitizeDecimalInput(e.target.value))");
    expect(mobileSheet).not.toContain("<MobileNumPad");
    expect(mobileSheet).toContain("disabled={confirmDisabled || !draftValidationOk || isLockedAfterSuccess || studentSummaryLoading}");
  });

  it("desktop desk shows a selected-student loading state immediately", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("selectedStudentIndexItem && studentSummaryLoading");
    expect(component).toContain("Loading dues for");
  });

  it("student selection retries when a prefetch summary was empty", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain("payload ??");
    expect(component).toContain("fetchStudentSummary({");
    expect(component).toContain("prefetchCache.current.delete(prefetchKey)");
    expect(component).toContain("prefetchCache.current.delete(cacheKey)");
  });

  it("student selection clears stale dues immediately and caches successful summaries", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const selectBody = component.match(
      /function selectStudent\(studentId: string\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";

    expect(component).toContain("summaryCache.current");
    expect(component).toContain("applyStudentSummaryPayload");
    expect(component).toContain("summaryCache.current.set(prefetchKey, payload)");
    expect(selectBody).toContain("setSelectedStudent(null)");
    expect(selectBody).toContain("setDateAwareBreakdown(null)");
    expect(selectBody).toContain("setStudentSummaryLoading(true)");
  });

  it("records selected-student timing marks and persists successful summaries", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );

    expect(component).toContain('performance.mark("vpps:payment-desk:student_click")');
    expect(component).toContain('performance.mark("vpps:payment-desk:summary_fetch_start")');
    expect(component).toContain('performance.mark("vpps:payment-desk:summary_fetch_end")');
    expect(component).toContain('performance.mark("vpps:payment-desk:summary_paint")');
    expect(component).toContain("loadCachedPaymentDeskStudentSummary");
    expect(component).toContain("saveCachedPaymentDeskStudentSummary");
    expect(component).toContain("clearCachedPaymentDeskStudentSummary");
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
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );

    // formError display must come before the review button in source order
    expect(component.indexOf("formError")).toBeLessThan(
      component.indexOf("Review Receipt"),
    );
    // Must have role="alert" for accessibility
    expect(component).toContain('role="alert"');
  });

  it("review button lives inside the full-screen mobile sheet", () => {
    const component = readFileSync(
      join(process.cwd(), "components/payments/mobile-payment-flow-sheet.tsx"),
      "utf8",
    );

    expect(component).toContain("fixed inset-0 z-[45] md:hidden");
    expect(component).toContain("Review Receipt");
  });
});
