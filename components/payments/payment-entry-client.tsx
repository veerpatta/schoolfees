"use client";

import { useActionState, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeRecentActions, OfficeRecentTracker, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/loading-skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MobilePaymentModeSheet } from "@/components/payments/mobile-payment-mode-sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useScrollIntoView } from "@/hooks/use-scroll-into-view";
import { buildPaymentAllocation, buildReceiptPreviewAllocation } from "@/lib/payments/allocation";
import { buildPaymentQuickAmounts } from "@/lib/payments/workflow";
import {
  buildPaymentConfirmationSummary,
  buildPaymentDeskSearchIndex,
  buildStudentSelectLabel,
  filterPaymentDeskStudents,
  buildPaymentActionStateKey,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  shouldShowPaymentActionState,
  validatePaymentDraft,
} from "@/lib/payments/payment-desk-workflow";
import type {
  PaymentDeskIssue,
  PaymentDeskStudentSummary,
  InstallmentBalanceItem,
  PaymentEntryActionState,
  PaymentEntryPageData,
} from "@/lib/payments/types";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

type PaymentEntryClientProps = {
  data: PaymentEntryPageData;
  canPost: boolean;
  canViewDiagnostics: boolean;
  classOptions: Array<{ id: string; label: string }>;
  workflowGuard: {
    title: string;
    detail: string;
    actionLabel: string | null;
    actionHref: string | null;
  } | null;
  initialState: PaymentEntryActionState;
  defaultReceivedBy: string;
  submitPaymentEntryAction: (
    previous: PaymentEntryActionState,
    formData: FormData,
  ) => Promise<PaymentEntryActionState>;
  repairPaymentDeskStudentDuesAction: (formData: FormData) => Promise<void>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const studentComboboxRowHeight = 52;
const studentComboboxPanelHeight = 312;
const studentComboboxOverscan = 4;
const paymentDeskLastClassStorageKey = "vpps.paymentDesk.lastClassId";
const paymentDeskLastModeStorageKey = "vpps.paymentDesk.lastPaymentMode";
const paymentDeskRecentStudentsStorageKey = "vpps.paymentDesk.recentStudents";
const mobilePresetAmounts = [500, 1000, 2000, 5000, 10000];

function desktopTabButtonClass(active: boolean) {
  return cn(
    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
  );
}

function createClientRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ActionNotice({
  state,
  canViewDiagnostics,
}: {
  state: PaymentEntryActionState;
  canViewDiagnostics: boolean;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={
        state.status === "error"
          ? "rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground"
          : state.status === "duplicate"
            ? "rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground"
          : "rounded-md bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
      }
    >
      {state.message}
      {state.status === "error" && state.diagnostic && canViewDiagnostics ? (
        <details className="mt-2 rounded border border-destructive/30 bg-card/70 px-2 py-2 text-xs text-destructive-soft-foreground">
          <summary className="cursor-pointer font-medium">Technical details</summary>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>Reason: {state.diagnostic.reason}</div>
            <div>Student: {state.diagnostic.studentId ?? "Not set"}</div>
            <div>Fee Setup year: {state.diagnostic.activeFeeSetupSession ?? "Not set"}</div>
            <div>Student year: {state.diagnostic.studentClassSession ?? "Not set"}</div>
            <div>Dues rows: {state.diagnostic.installmentCount ?? "Not checked"}</div>
            <div>Preview pending: {state.diagnostic.previewPendingAmount ?? "Not checked"}</div>
            <div>Payment date: {state.diagnostic.selectedPaymentDate ?? "Not set"}</div>
            <div>Preview worked: {state.diagnostic.previewWorked ? "Yes" : "No"}</div>
            <div>Posting worked: {state.diagnostic.postStudentPaymentWorked ? "Yes" : "No"}</div>
            <div>Auto-prepare tried: {state.diagnostic.autoPrepareAttempted ? "Yes" : "No"}</div>
            <div>
              Auto-prepare worked:{" "}
              {state.diagnostic.autoPrepareWorked == null
                ? "Not tried"
                : state.diagnostic.autoPrepareWorked
                  ? "Yes"
                  : "No"}
            </div>
            <div>Update code: {state.diagnostic.rawRpcErrorCode ?? "None"}</div>
          </dl>
          {state.diagnostic.rawRpcErrorMessage ? (
            <p className="mt-2 break-words">Update message: {state.diagnostic.rawRpcErrorMessage}</p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export function PaymentEntryClient({
  data,
  canPost,
  canViewDiagnostics,
  classOptions,
  workflowGuard,
  initialState,
  defaultReceivedBy,
  submitPaymentEntryAction,
  repairPaymentDeskStudentDuesAction,
}: PaymentEntryClientProps) {
  const [state, formAction, pending] = useActionState(
    submitPaymentEntryAction,
    initialState,
  );
  const [selectedClassId, setSelectedClassId] = useState(data.initialClassId);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const deferredStudentSearchQuery = useDeferredValue(studentSearchQuery);
  const [selectedStudentId, setSelectedStudentId] = useState(data.initialStudentId ?? "");
  const [isStudentPickerOpen, setIsStudentPickerOpen] = useState(false);
  const [activeStudentOptionIndex, setActiveStudentOptionIndex] = useState(-1);
  const [studentListScrollTop, setStudentListScrollTop] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(data.initialStudentSummary);
  const [selectedStudentIssue, setSelectedStudentIssue] = useState<PaymentDeskIssue | null>(
    data.initialStudentIssue,
  );
  const [studentSummaryLoading, setStudentSummaryLoading] = useState(false);
  const [studentSummaryNotice, setStudentSummaryNotice] = useState<string | null>(null);
  const [latestStudentReceipt, setLatestStudentReceipt] = useState(data.initialLatestReceipt);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [quickDiscountInput, setQuickDiscountInput] = useState("");
  const [waiveFullLateFee, setWaiveFullLateFee] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateAwareBreakdown, setDateAwareBreakdown] = useState<InstallmentBalanceItem[] | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState(() => {
    const defaultMode = data.modeOptions[0]?.value ?? "cash";
    if (typeof window === "undefined") return defaultMode;
    const stored = window.localStorage.getItem(paymentDeskLastModeStorageKey);
    return stored && data.modeOptions.some((m) => m.value === stored) ? stored : defaultMode;
  });
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedBy, setReceivedBy] = useState(defaultReceivedBy);
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isLockedAfterSuccess, setIsLockedAfterSuccess] = useState(false);
  const [desktopPanelTab, setDesktopPanelTab] = useState<"collect" | "dues" | "receipt" | "notes">("collect");
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(createClientRequestId);
  const [dismissedActionStateKey, setDismissedActionStateKey] = useState<string | null>(null);
  const isMobileView = useMediaQuery("(max-width: 767px)");
  const { ref: amountInputRef, scrollIntoView: scrollAmountInputIntoView } = useScrollIntoView<HTMLInputElement>();
  const { ref: refInputRef, scrollIntoView: scrollReferenceInputIntoView } = useScrollIntoView<HTMLInputElement>();
  const submittingRef = useRef(false);
  const amountSectionRef = useRef<HTMLDivElement>(null);
  const classSectionRef = useRef<HTMLDivElement>(null);
  const studentSearchSectionRef = useRef<HTMLDivElement>(null);
  const mobileStudentPickerRef = useRef<HTMLDivElement>(null);
  const desktopStudentPickerRef = useRef<HTMLDivElement>(null);
  const mobileStudentSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopStudentSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileStudentListRef = useRef<HTMLDivElement>(null);
  const desktopStudentListRef = useRef<HTMLDivElement>(null);
  const summaryRequestRef = useRef(0);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const lastAmountFocusStudentIdRef = useRef<string | null>(null);
  const [activeStudentPickerMode, setActiveStudentPickerMode] = useState<"mobile" | "desktop">("mobile");
  const [recentStudentIds, setRecentStudentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(paymentDeskRecentStudentsStorageKey);
      return stored ? (JSON.parse(stored) as string[]).slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const mobileStudentListId = useId();
  const desktopStudentListId = useId();
  const studentIndex = data.studentIndex;

  const studentSearchIndex = useMemo(
    () => buildPaymentDeskSearchIndex(studentIndex),
    [studentIndex],
  );
  const recentStudents = useMemo(
    () =>
      recentStudentIds
        .map((id) => studentIndex.find((s) => s.id === id))
        .filter((s): s is typeof studentIndex[number] => Boolean(s))
        .filter((s) => !selectedClassId || s.classId === selectedClassId),
    [recentStudentIds, studentIndex, selectedClassId],
  );
  const filteredStudents = useMemo(
    () =>
      filterPaymentDeskStudents({
        students: studentIndex,
        searchIndex: studentSearchIndex,
        selectedClassId,
        query: deferredStudentSearchQuery,
      }),
    [studentIndex, deferredStudentSearchQuery, selectedClassId, studentSearchIndex],
  );
  const selectedStudentIndexItem = useMemo(
    () => studentIndex.find((student) => student.id === selectedStudentId) ?? null,
    [studentIndex, selectedStudentId],
  );
  const totalStudentRows = filteredStudents.length;
  const firstVisibleStudentIndex = Math.max(
    Math.floor(studentListScrollTop / studentComboboxRowHeight) - studentComboboxOverscan,
    0,
  );
  const visibleStudentRowCount =
    Math.ceil(studentComboboxPanelHeight / studentComboboxRowHeight) + studentComboboxOverscan * 2;
  const lastVisibleStudentIndex = Math.min(
    firstVisibleStudentIndex + visibleStudentRowCount,
    totalStudentRows,
  );
  const visibleStudentOptions = filteredStudents.slice(
    firstVisibleStudentIndex,
    lastVisibleStudentIndex,
  );
  const topVisibleOffset = firstVisibleStudentIndex * studentComboboxRowHeight;
  const bottomVisibleOffset =
    Math.max(totalStudentRows - lastVisibleStudentIndex, 0) * studentComboboxRowHeight;
  const previewBreakdown = useMemo(
    () => dateAwareBreakdown ?? selectedStudent?.breakdown ?? [],
    [dateAwareBreakdown, selectedStudent?.breakdown],
  );
  const previewTotalPending = previewBreakdown.reduce(
    (sum, item) => sum + item.outstandingAmount,
    0,
  );
  const previewOverdueAmount = previewBreakdown
    .filter((item) => item.balanceStatus === "overdue")
    .reduce((sum, item) => sum + item.outstandingAmount, 0);
  const previewNextDue =
    previewBreakdown.find((item) => item.outstandingAmount > 0) ?? null;
  const paymentAmount = Number(paymentAmountInput) || 0;
  const clientPreviewAmount = paymentAmount > 0 ? paymentAmount : null;
  const quickDiscountAmount = Number(quickDiscountInput) || 0;
  const pendingLateFeeAmount = previewBreakdown.reduce(
    (sum, item) => sum + Math.min(item.finalLateFee, item.outstandingAmount),
    0,
  );
  const quickLateFeeWaiverAmount = waiveFullLateFee ? pendingLateFeeAmount : 0;
  const quickLateFeeWaiverInput = quickLateFeeWaiverAmount > 0 ? String(quickLateFeeWaiverAmount) : "";
  const creditBalance = selectedStudent?.creditBalance ?? 0;
  const refundableAmount = selectedStudent?.refundableAmount ?? 0;
  const studentSelectedFromIndex = Boolean(selectedStudentId && selectedStudentIndexItem);
  const showReferenceField = paymentMode !== "cash";
  const referenceInputMode = paymentMode === "cheque" ? "numeric" : "text";

  useEffect(() => {
    if (!selectedStudentId) {
      setDateAwareBreakdown(null);
      setPreviewNotice(null);
      setPreviewUnavailable(false);
      setPreviewLoading(false);
      setSelectedStudent(null);
      setSelectedStudentIssue(null);
      setLatestStudentReceipt(null);
      return;
    }

    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const requestId = ++summaryRequestRef.current;
    const params = new URLSearchParams({
      studentId: selectedStudentId,
      paymentDate,
      includeLatestReceipt: "true",
    });

    setStudentSummaryLoading(true);
    setStudentSummaryNotice("Loading dues...");
    setPreviewNotice("Refreshing pending amount for selected payment date...");
    setPreviewLoading(true);

    fetch(`/protected/payments/student-summary?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to refresh payment preview.");
        }

        return response.json() as Promise<PaymentDeskStudentSummary>;
      })
      .then((payload) => {
        if (requestId !== summaryRequestRef.current) {
          return;
        }

        setSelectedStudent(payload.student);
        setSelectedStudentIssue(payload.issue);
        setLatestStudentReceipt(payload.latestReceipt);
        setDateAwareBreakdown(payload.student?.breakdown ?? []);
        setStudentSummaryLoading(false);
        setStudentSummaryNotice(null);
        setPreviewUnavailable(false);
        setPreviewLoading(false);
        setPreviewNotice(
          payload.student
            ? "Pending amount and late fee are recalculated for the selected payment date."
            : "No pending dues for selected payment date.",
        );
      })
      .catch((error) => {
        if (requestId !== summaryRequestRef.current) {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setDateAwareBreakdown(null);
        setStudentSummaryLoading(false);
        setStudentSummaryNotice("Unable to load dues. Ask admin to check Fee Setup.");
        setPreviewUnavailable(true);
        setPreviewLoading(false);
        setPreviewNotice("Unable to load dues. Ask admin to check Fee Setup.");
      });

    return () => {
      controller.abort();
    };
  }, [paymentDate, selectedStudentId]);

  const allocationPreview = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentAllocation(previewBreakdown, paymentAmount);
  }, [paymentAmount, previewBreakdown, selectedStudent]);
  const receiptPreviewAllocation = useMemo(
    () =>
      buildReceiptPreviewAllocation({
        installments: previewBreakdown,
        paymentAmount,
        quickDiscountAmount,
        quickLateFeeWaiverAmount,
      }),
    [paymentAmount, previewBreakdown, quickDiscountAmount, quickLateFeeWaiverAmount],
  );
  const latestReceipt = selectedStudentId ? latestStudentReceipt : data.recentReceipts[0] ?? null;
  const latestStudentPaymentAmount =
    latestStudentReceipt?.studentId === selectedStudentId ? latestStudentReceipt.totalAmount : null;
  const quickAmounts = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentQuickAmounts({
      totalPending: previewTotalPending,
      nextDueAmount: previewNextDue?.outstandingAmount ?? null,
      overdueAmount: previewOverdueAmount,
      lateFeeAmount: pendingLateFeeAmount,
      lastPaidAmount: latestStudentPaymentAmount,
    });
  }, [
    latestStudentPaymentAmount,
    pendingLateFeeAmount,
    previewNextDue,
    previewOverdueAmount,
    previewTotalPending,
    selectedStudent,
  ]);

  const allocatedPreviewTotal = allocationPreview.reduce(
    (sum, item) => sum + item.allocatedAmount,
    0,
  );
  const unallocatedAmount = Math.max(paymentAmount - allocatedPreviewTotal, 0);
  const actionStateKey = buildPaymentActionStateKey(state);
  const visibleActionState = shouldShowPaymentActionState({
    state,
    dismissedActionStateKey,
  })
    ? state
    : initialState;
  const visibleReceiptHref = visibleActionState.receiptId
    ? `/protected/receipts/${visibleActionState.receiptId}`
    : null;
  const printReceiptHref = visibleReceiptHref ? `${visibleReceiptHref}?print=1` : null;
  const selectedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === paymentMode)?.label ?? paymentMode;
  const postedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === visibleActionState.paymentMode)?.label ??
    visibleActionState.paymentMode ??
    selectedPaymentModeLabel;
  const draftValidation = validatePaymentDraft({
    selectedStudent,
    amountInput: paymentAmountInput,
    quickDiscountInput,
    quickLateFeeWaiverInput,
    paymentDate,
    paymentMode,
    paymentModeLabel: selectedPaymentModeLabel,
    referenceNumber,
    receivedBy,
    previewTotalPending,
    quickDiscountAmount,
    quickLateFeeWaiverAmount,
    isPreviewRefreshing: previewLoading,
    creditBalance,
  });
  const confirmDisabled =
    !canPost ||
    isLockedAfterSuccess ||
    previewLoading ||
    studentSummaryLoading ||
    previewUnavailable ||
    previewTotalPending <= 0;
  const confirmationSummary = buildPaymentConfirmationSummary({
    selectedStudent,
    amountInput: paymentAmountInput,
    quickDiscountInput,
    quickLateFeeWaiverInput,
    paymentDate,
    paymentMode,
    paymentModeLabel: selectedPaymentModeLabel,
    referenceNumber,
    receivedBy,
    previewTotalPending,
    quickDiscountAmount,
    quickLateFeeWaiverAmount,
    isPreviewRefreshing: previewLoading,
    creditBalance,
  });
  const netPayable = draftValidation.ok ? draftValidation.revisedPendingBeforePayment : Math.max(previewTotalPending - quickDiscountAmount - quickLateFeeWaiverAmount, 0);
  const remainingAfterPayment =
    draftValidation.ok ? draftValidation.remainingBalance : netPayable;
  const latestPayment = visibleActionState.status === "success" && visibleActionState.receiptId && visibleActionState.receiptNumber
    ? {
        id: visibleActionState.receiptId,
        receiptNumber: visibleActionState.receiptNumber,
        studentLabel: selectedStudent
          ? `${selectedStudent.fullName} (${selectedStudent.admissionNo})`
          : "Selected student",
        totalAmount: visibleActionState.amountReceived ?? paymentAmount,
        paymentMode: selectedPaymentModeLabel,
        paymentDate: visibleActionState.paymentDate ?? paymentDate,
        createdAt: null,
      }
    : latestReceipt
      ? {
          id: latestReceipt.id,
          receiptNumber: latestReceipt.receiptNumber,
          studentLabel: latestReceipt.studentLabel,
          totalAmount: latestReceipt.totalAmount,
          paymentMode: latestReceipt.paymentMode,
          paymentDate: latestReceipt.paymentDate,
          createdAt: latestReceipt.createdAt,
      }
      : null;
  const whatsappCopy =
    visibleActionState.status === "success" && visibleActionState.receiptNumber && selectedStudent
      ? `Dear Parent, Payment received: ${formatInr(visibleActionState.amountReceived ?? paymentAmount)}.${(visibleActionState.quickDiscountApplied ?? quickDiscountAmount) > 0 ? ` Discount applied: ${formatInr(visibleActionState.quickDiscountApplied ?? quickDiscountAmount)}.` : ""}${(visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount) > 0 ? ` Late fee waived: ${formatInr(visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount)}.` : ""} Receipt No: ${visibleActionState.receiptNumber}. Thank you - Shri Veer Patta Senior Secondary School.`
      : "";

  useEffect(() => {
    submittingRef.current = false;

    if (state.status === "success") {
      setDismissedActionStateKey(null);
      setIsConfirmOpen(false);
      setIsSuccessOpen(true);
      setIsDuplicateOpen(false);
      setIsLockedAfterSuccess(true);
      setFormError(null);
      return;
    }

    if (state.status === "duplicate") {
      setDismissedActionStateKey(null);
      setIsConfirmOpen(false);
      setIsSuccessOpen(false);
      setIsDuplicateOpen(true);
      setFormError(null);
      return;
    }

    if (state.status === "error") {
      setDismissedActionStateKey(null);
      setIsConfirmOpen(false);
      setFormError(state.message);
    }
  }, [state]);

  useEffect(() => {
    if (data.initialClassId || selectedClassId) {
      return;
    }

    const storedClassId = window.localStorage.getItem(paymentDeskLastClassStorageKey);
    if (!storedClassId || !classOptions.some((classOption) => classOption.id === storedClassId)) {
      return;
    }

    setSelectedClassId(storedClassId);
    setIsStudentPickerOpen(true);
    setActiveStudentOptionIndex(0);
    focusStudentSearch("mobile");
  }, [classOptions, data.initialClassId, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) {
      window.localStorage.removeItem(paymentDeskLastClassStorageKey);
      return;
    }

    window.localStorage.setItem(paymentDeskLastClassStorageKey, selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    window.localStorage.setItem(paymentDeskLastModeStorageKey, paymentMode);
  }, [paymentMode]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideMobilePicker = mobileStudentPickerRef.current?.contains(target);
      const isInsideDesktopPicker = desktopStudentPickerRef.current?.contains(target);

      if (!isInsideMobilePicker && !isInsideDesktopPicker) {
        setIsStudentPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!isStudentPickerOpen) {
      return;
    }
    if (activeStudentOptionIndex < 0) {
      return;
    }
    const targetRowTop = activeStudentOptionIndex * studentComboboxRowHeight;
    const targetRowBottom = targetRowTop + studentComboboxRowHeight;
    const activeStudentList =
      activeStudentPickerMode === "desktop"
        ? desktopStudentListRef.current
        : mobileStudentListRef.current;
    const listScrollTop = activeStudentList?.scrollTop ?? 0;
    const listBottom = listScrollTop + studentComboboxPanelHeight;

    if (targetRowTop < listScrollTop) {
      activeStudentList?.scrollTo({ top: targetRowTop });
    } else if (targetRowBottom > listBottom) {
      activeStudentList?.scrollTo({ top: targetRowBottom - studentComboboxPanelHeight });
    }
  }, [activeStudentOptionIndex, activeStudentPickerMode, isStudentPickerOpen]);

  useEffect(() => {
    setActiveStudentOptionIndex(filteredStudents.findIndex((student) => student.id === selectedStudentId));
  }, [filteredStudents, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudent || studentSummaryLoading || !isMobileView) {
      return;
    }

    if (lastAmountFocusStudentIdRef.current === selectedStudent.id) {
      return;
    }

    lastAmountFocusStudentIdRef.current = selectedStudent.id;
    scrollAmountInputIntoView();
    setTimeout(() => {
      amountInputRef.current?.focus({ preventScroll: true });
    }, 350);
  }, [amountInputRef, isMobileView, scrollAmountInputIntoView, selectedStudent, studentSummaryLoading]);

  useEffect(() => {
    if (isConfirmOpen && isMobileView) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [isConfirmOpen, isMobileView]);

  useEffect(() => {
    if (showReferenceField && isMobileView) {
      scrollReferenceInputIntoView();
      setTimeout(() => {
        refInputRef.current?.focus({ preventScroll: true });
      }, 300);
    }
  }, [isMobileView, refInputRef, scrollReferenceInputIntoView, showReferenceField]);

  function focusStudentSearch(mode: "mobile" | "desktop") {
    requestAnimationFrame(() => {
      const studentList =
        mode === "desktop" ? desktopStudentListRef.current : mobileStudentListRef.current;
      const studentSearchInput =
        mode === "desktop"
          ? desktopStudentSearchInputRef.current
          : mobileStudentSearchInputRef.current;

      studentList?.scrollTo({ top: 0 });
      if (mode === "mobile") {
        studentSearchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      studentSearchInput?.focus({ preventScroll: mode === "mobile" });
    });
  }

  function clearSelectedStudent() {
    setSelectedStudentId("");
    setSelectedStudent(null);
    setSelectedStudentIssue(null);
    setLatestStudentReceipt(null);
    setDateAwareBreakdown(null);
    setPaymentAmountInput("");
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
    setLatestStudentReceipt(null);
    setFormError(null);
    lastAmountFocusStudentIdRef.current = null;
  }

  function handleClassChange(nextClassId: string, mode: "mobile" | "desktop") {
    setActiveStudentPickerMode(mode);
    setSelectedClassId(nextClassId);
    setStudentSearchQuery("");
    setStudentListScrollTop(0);

    if (nextClassId) {
      setIsStudentPickerOpen(true);
      setActiveStudentOptionIndex(0);
      focusStudentSearch(mode);
    } else {
      setIsStudentPickerOpen(false);
      setActiveStudentOptionIndex(-1);
      mobileStudentSearchInputRef.current?.blur();
      desktopStudentSearchInputRef.current?.blur();
    }

    if (
      selectedStudentId &&
      studentIndex.some(
        (student) => student.id === selectedStudentId && student.classId !== nextClassId,
      )
    ) {
      clearSelectedStudent();
    }
  }

  function selectStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setPaymentAmountInput("");
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
    setFormError(null);
    setIsStudentPickerOpen(false);
    setActiveStudentOptionIndex(-1);
    lastAmountFocusStudentIdRef.current = null;
    mobileStudentSearchInputRef.current?.blur();
    desktopStudentSearchInputRef.current?.blur();

    setRecentStudentIds((prev) => {
      const next = [studentId, ...prev.filter((id) => id !== studentId)].slice(0, 5);
      try {
        window.localStorage.setItem(paymentDeskRecentStudentsStorageKey, JSON.stringify(next));
      } catch {
        // storage quota — ignore
      }
      return next;
    });
  }

  function openConfirmationDialog() {
    const validation = validatePaymentDraft({
      selectedStudent,
      amountInput: paymentAmountInput,
      quickDiscountInput,
      quickLateFeeWaiverInput,
      paymentDate,
      paymentMode,
      paymentModeLabel: selectedPaymentModeLabel,
      referenceNumber,
      receivedBy,
      previewTotalPending,
      quickDiscountAmount,
      quickLateFeeWaiverAmount,
      isPreviewRefreshing: previewLoading,
      creditBalance,
    });

    if (!validation.ok) {
      setFormError(validation.message);
      setIsConfirmOpen(false);
      return;
    }

    setFormError(null);
    setIsConfirmOpen(true);
  }

  function handleCollectAnotherPayment() {
    const resetValues = resetPaymentDraftForNextPayment({
      keepPaymentMode: paymentMode,
      defaultReceivedBy,
    });

    setPaymentAmountInput(resetValues.amountInput);
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
    setReferenceNumber(resetValues.referenceNumber);
    setRemarks(resetValues.remarks);
    setPaymentMode(resetValues.paymentMode as typeof paymentMode);
    setReceivedBy(resetValues.receivedBy);
    setClientRequestId(createClientRequestId());
    setDateAwareBreakdown(null);
    setPreviewNotice(null);
    setPreviewUnavailable(false);
    setPreviewLoading(false);
    setStudentSummaryLoading(false);
    setStudentSummaryNotice(null);
    setDismissedActionStateKey(actionStateKey);
    setIsLockedAfterSuccess(false);
    setIsSuccessOpen(false);
    setIsDuplicateOpen(false);
    setCopyStatus("idle");
    setStudentSearchQuery("");
    setSelectedStudentId("");
    setSelectedStudent(null);
    setSelectedStudentIssue(null);
    setLatestStudentReceipt(null);
    lastAmountFocusStudentIdRef.current = null;
    setIsStudentPickerOpen(Boolean(selectedClassId));
    if (selectedClassId) {
      setActiveStudentOptionIndex(0);
      focusStudentSearch(activeStudentPickerMode);
    }
  }

  return (
    <div className="payment-entry-mobile-layout space-y-6 mobile-payment-with-nav-clearance md:pb-4">
      <OfficeRecentTracker
        student={
          selectedStudent
            ? {
                id: selectedStudent.id,
                fullName: selectedStudent.fullName,
                admissionNo: selectedStudent.admissionNo,
              }
            : undefined
        }
        receipt={
            visibleActionState.status === "success" &&
            visibleActionState.receiptId &&
            visibleActionState.receiptNumber &&
            visibleActionState.studentId
            ? {
                id: visibleActionState.receiptId,
                receiptNumber: visibleActionState.receiptNumber,
                studentId: visibleActionState.studentId,
              }
            : undefined
        }
      />

      <div ref={classSectionRef} className="md:hidden">
      <SectionCard
        title="1. Select Class"
        description="Start with class, then choose the student."
      >
        <div className="grid gap-2 md:gap-3 md:grid-cols-[minmax(220px,320px)_1fr] md:items-end">
          <div>
            <Label htmlFor="payment-class-id">Class</Label>
            <select
              id="payment-class-id"
              value={selectedClassId}
              className={`${selectClassName} mt-2`}
              onChange={(event) => {
                const nextClassId = event.target.value;
                handleClassChange(nextClassId, "mobile");
              }}
            >
              <option value="">Select class</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            Student list stays ready for the selected class and remains in alphabetical order with SR no.
          </p>
        </div>
      </SectionCard>
      </div>

      <div ref={studentSearchSectionRef} className="md:hidden">
      <SectionCard
        title="2. Search Student"
        description="Use SR no, student name, father name, or phone number to reach the right student quickly."
      >
            <div className="space-y-2 md:space-y-4">
              <div className="grid gap-2 md:gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="payment-student-query">Search</Label>
              <Input
                id="payment-student-query"
                value={studentSearchQuery}
                onChange={(event) => {
                  setActiveStudentPickerMode("mobile");
                  setStudentSearchQuery(event.target.value);
                  setIsStudentPickerOpen(true);
                  setStudentListScrollTop(0);
                }}
                placeholder="SR no, student, father, or phone"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="payment-student-id">Student</Label>
              <div ref={mobileStudentPickerRef} className="relative mt-2 space-y-2">
                <input type="hidden" id="payment-student-id" value={selectedStudentId} readOnly />
                {selectedStudentIndexItem ? (
                  <div className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
                    <span className="truncate">
                      {buildStudentSelectLabel({ ...selectedStudentIndexItem, pendingAmount: null })}
                    </span>
                    <button
                      type="button"
                      className="rounded-full border border-info/40 bg-card px-2 py-1 text-xs font-semibold text-info-soft-foreground transition hover:bg-info-soft"
                      onClick={() => {
                        clearSelectedStudent();
                        setIsStudentPickerOpen(false);
                        mobileStudentSearchInputRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                <Input
                  ref={mobileStudentSearchInputRef}
                  id={`${mobileStudentListId}-input`}
                  role="combobox"
                  aria-expanded={isStudentPickerOpen}
                  aria-controls={mobileStudentListId}
                  aria-activedescendant={
                    activeStudentOptionIndex >= 0
                      ? `${mobileStudentListId}-option-${activeStudentOptionIndex}`
                      : undefined
                  }
                  aria-autocomplete="list"
                  placeholder="Select student"
                  value={studentSearchQuery}
                  onFocus={() => {
                    setActiveStudentPickerMode("mobile");
                    setIsStudentPickerOpen(true);
                  }}
                  onChange={(event) => {
                    setActiveStudentPickerMode("mobile");
                    setStudentSearchQuery(event.target.value);
                    setIsStudentPickerOpen(true);
                    setStudentListScrollTop(0);
                    setActiveStudentOptionIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setIsStudentPickerOpen(true);
                      setActiveStudentOptionIndex((index) =>
                        Math.min(index < 0 ? 0 : index + 1, filteredStudents.length - 1),
                      );
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setIsStudentPickerOpen(true);
                      setActiveStudentOptionIndex((index) => Math.max(index - 1, 0));
                    } else if (event.key === "Enter") {
                      if (!isStudentPickerOpen) {
                        return;
                      }
                      event.preventDefault();
                      const nextStudent = filteredStudents[activeStudentOptionIndex];
                      if (nextStudent) {
                        selectStudent(nextStudent.id);
                      }
                    } else if (event.key === "Escape") {
                      setIsStudentPickerOpen(false);
                    }
                  }}
                />
                {isStudentPickerOpen ? (
                  <div
                    id={mobileStudentListId}
                    role="listbox"
                    ref={mobileStudentListRef}
                    className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg"
                    style={{ height: `${studentComboboxPanelHeight}px` }}
                    onScroll={(event) => setStudentListScrollTop(event.currentTarget.scrollTop)}
                  >
                    {!studentSearchQuery && recentStudents.length > 0 ? (
                      <div className="border-b border-border pb-1">
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle-foreground">Recent</p>
                        {recentStudents.map((student) => (
                          <button
                            key={`recent-${student.id}`}
                            type="button"
                            role="option"
                            aria-selected={selectedStudentId === student.id}
                            className={`flex min-h-10 w-full items-center border-b border-border px-3 py-1.5 text-left text-sm last:border-b-0 ${selectedStudentId === student.id ? "bg-info-soft text-info-soft-foreground" : "bg-card text-foreground hover:bg-surface-2"}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectStudent(student.id)}
                          >
                            {buildStudentSelectLabel({ ...student, pendingAmount: null })}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {filteredStudents.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No matching students.</p>
                    ) : (
                      <div style={{ paddingTop: topVisibleOffset, paddingBottom: bottomVisibleOffset }}>
                        {visibleStudentOptions.map((student, index) => {
                          const optionIndex = firstVisibleStudentIndex + index;
                          const label = buildStudentSelectLabel({ ...student, pendingAmount: null });
                          const isActive = optionIndex === activeStudentOptionIndex;
                          const isSelected = selectedStudentId === student.id;

                          return (
                            <button
                              key={student.id}
                              id={`${mobileStudentListId}-option-${optionIndex}`}
                              role="option"
                              aria-selected={isSelected}
                              type="button"
                      className={`flex min-h-12 w-full items-center border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                                isActive ? "bg-info-soft text-info-soft-foreground" : "bg-card text-foreground hover:bg-surface-2"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectStudent(student.id)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {studentSummaryLoading ? (
            <div className="space-y-2" aria-live="polite" aria-busy={studentSummaryLoading}>
              <p className="text-sm text-muted-foreground">{studentSummaryNotice ?? "Loading students..."}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
              </div>
            </div>
          ) : null}
          {selectedStudentIndexItem ? (
            <div className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
              Selected:{" "}
              <span className="font-semibold">
                {selectedStudent?.fullName ?? selectedStudentIndexItem.fullName}
              </span>{" "}
              · {selectedStudent?.classLabel ?? selectedStudentIndexItem.classLabel} · SR No{" "}
              {selectedStudent?.admissionNo ?? selectedStudentIndexItem.admissionNo}
            </div>
          ) : null}
        </div>
      </SectionCard>
      </div>


      <section className="hidden md:flex md:h-[calc(100vh-140px)] md:min-h-[640px] md:flex-col md:gap-3">
        <div className="sticky top-0 z-10 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="grid gap-2 lg:grid-cols-[180px_minmax(280px,1fr)_170px_170px_auto]">
            <select id="desktop-payment-class-id" value={selectedClassId} className={selectClassName} onChange={(event)=>handleClassChange(event.target.value, "desktop")}>
              <option value="">Class</option>{classOptions.map((classOption)=><option key={classOption.id} value={classOption.id}>{classOption.label}</option>)}
            </select>
            <div ref={desktopStudentPickerRef} className="relative">
              <Input ref={desktopStudentSearchInputRef} role="combobox" aria-expanded={isStudentPickerOpen} aria-controls={desktopStudentListId} aria-activedescendant={activeStudentOptionIndex >= 0 ? `${desktopStudentListId}-option-${activeStudentOptionIndex}` : undefined} aria-autocomplete="list" placeholder="Search student" value={studentSearchQuery} onFocus={()=>{setActiveStudentPickerMode("desktop");setIsStudentPickerOpen(true);}} onChange={(event)=>{setActiveStudentPickerMode("desktop");setStudentSearchQuery(event.target.value);setIsStudentPickerOpen(true);setStudentListScrollTop(0);setActiveStudentOptionIndex(0);}} />
              {isStudentPickerOpen ? (
                <div id={desktopStudentListId} role="listbox" ref={desktopStudentListRef} className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg" style={{ height: `${studentComboboxPanelHeight}px` }} onScroll={(event) => setStudentListScrollTop(event.currentTarget.scrollTop)}>
                  {filteredStudents.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">No matching students.</p> : <div style={{ paddingTop: topVisibleOffset, paddingBottom: bottomVisibleOffset }}>{visibleStudentOptions.map((student,index)=>{const optionIndex=firstVisibleStudentIndex+index;const label=buildStudentSelectLabel({ ...student, pendingAmount: null });const isActive=optionIndex===activeStudentOptionIndex;const isSelected=selectedStudentId===student.id;return <button key={student.id} id={`${desktopStudentListId}-option-${optionIndex}`} role="option" aria-selected={isSelected} type="button" className={`flex min-h-12 w-full items-center border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${isActive ? "bg-info-soft text-info-soft-foreground" : "bg-card text-foreground hover:bg-surface-2"}`} onMouseDown={(event)=>event.preventDefault()} onClick={()=>selectStudent(student.id)}>{label}</button>;})}</div>}
                </div>
              ) : null}
            </div>
            <Input id="desktop-payment-amount" type="number" inputMode="decimal" enterKeyHint="done" autoCapitalize="off" autoCorrect="off" min={1} max={previewTotalPending > 0 ? previewTotalPending : undefined} ref={amountInputRef} placeholder="Amount" value={paymentAmountInput} onChange={(event)=>{setPaymentAmountInput(event.target.value);setFormError(null);}} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();openConfirmationDialog();}}} />
            <select id="desktop-payment-mode" className={selectClassName} value={paymentMode} onChange={(event)=>{setPaymentMode(event.target.value as typeof paymentMode);setFormError(null);}}>{data.modeOptions.map((modeOption)=><option key={modeOption.value} value={modeOption.value}>{modeOption.label}</option>)}</select>
            <Button type="button" disabled={confirmDisabled} onClick={openConfirmationDialog}>Confirm Payment</Button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_1fr] gap-3">
          <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-3 text-sm">
            <p className="mb-2 font-medium">Students</p>
            <p className="text-xs text-muted-foreground">Select class, then pick student.</p>
            {selectedStudentIndexItem ? <p className="mt-2 rounded bg-info-soft px-2 py-1 text-xs text-info-soft-foreground">Selected: {selectedStudent?.fullName ?? selectedStudentIndexItem.fullName}</p> : null}
          </div>
          <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex gap-2 text-sm">
              <button type="button" className={desktopTabButtonClass(desktopPanelTab === "collect")} onClick={()=>setDesktopPanelTab("collect")}>Collect</button>
              <button type="button" className={desktopTabButtonClass(desktopPanelTab === "dues")} onClick={()=>setDesktopPanelTab("dues")}>Dues Details</button>
              <button type="button" className={desktopTabButtonClass(desktopPanelTab === "receipt")} onClick={()=>setDesktopPanelTab("receipt")}>Recent Receipt</button>
              <button type="button" className={desktopTabButtonClass(desktopPanelTab === "notes")} onClick={()=>setDesktopPanelTab("notes")}>Notes</button>
            </div>
            {desktopPanelTab === "collect" ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <p className="font-semibold">{selectedStudent?.fullName ?? "Select student"}</p>
                  <p>Class: {selectedStudent?.classLabel ?? "-"} · SR {selectedStudent?.admissionNo ?? "-"}</p>
                  <p>Pending: {formatInr(previewTotalPending)} · Late fee: {formatInr(pendingLateFeeAmount)}</p>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  <Input placeholder="Amount received" inputMode="decimal" enterKeyHint="done" autoCapitalize="off" autoCorrect="off" value={paymentAmountInput} onChange={(event)=>setPaymentAmountInput(event.target.value)} />
                  <Input placeholder="Additional discount / concession" inputMode="decimal" enterKeyHint="next" value={quickDiscountInput} onChange={(event)=>setQuickDiscountInput(event.target.value)} />
                </div>
                <label className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <input type="checkbox" checked={waiveFullLateFee} disabled={pendingLateFeeAmount <= 0} onChange={(event)=>setWaiveFullLateFee(event.target.checked)} />
                  <span>Waive full pending late fee ({formatInr(pendingLateFeeAmount)})</span>
                </label>
                <div className="grid gap-2 lg:grid-cols-2">
                  {showReferenceField ? <Input placeholder="Reference number" inputMode={referenceInputMode} enterKeyHint="done" autoCapitalize="off" autoCorrect="off" value={referenceNumber} onChange={(event)=>setReferenceNumber(event.target.value)} /> : null}
                  <Input placeholder="Received by" enterKeyHint="next" autoComplete="name" value={receivedBy} onChange={(event)=>setReceivedBy(event.target.value)} />
                </div>
                <Textarea className={textAreaClassName} placeholder="Remarks" enterKeyHint="done" value={remarks} onChange={(event)=>setRemarks(event.target.value)} />
                <div className="grid gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-foreground sm:grid-cols-2">
                  <span>Pending before discount: {formatInr(previewTotalPending)}</span>
                  <span>Late fee waived: {formatInr(quickLateFeeWaiverAmount)}</span>
                  <span>Discount/concession: {formatInr(quickDiscountAmount)}</span>
                  <span>Net payable: {formatInr(netPayable)}</span>
                  <span>Amount received: {formatInr(paymentAmount)}</span>
                  <span>Remaining after this payment: {formatInr(remainingAfterPayment)}</span>
                </div>
                <Button type="button" className="w-full" disabled={confirmDisabled} onClick={openConfirmationDialog}>Confirm Payment</Button>
              </div>
            ) : null}
            {desktopPanelTab === "dues" ? <div className="text-sm"><p className="mb-2 font-medium">Installment breakdown</p><p className="text-xs text-muted-foreground">Preview allocated: {formatInr(allocatedPreviewTotal)} · Unallocated: {formatInr(unallocatedAmount)}</p></div> : null}
            {desktopPanelTab === "receipt" ? <div className="text-sm">{latestPayment ? <><p>Latest receipt number: {latestPayment.receiptNumber}</p><p>Payment date: {latestPayment.paymentDate}</p><p>Amount: {formatInr(latestPayment.totalAmount)}</p><Link className="text-accent underline-offset-4 hover:underline" href={`/protected/receipts/${latestPayment.id}`}>Open/Print receipt</Link></> : <p>No recent receipt.</p>}</div> : null}
            {desktopPanelTab === "notes" ? <div className="space-y-2 text-sm"><p>Remarks</p><textarea className={textAreaClassName} value={remarks} onChange={(event)=>setRemarks(event.target.value)} /><p className="text-xs text-muted-foreground">Reference helper: keep UPI/bank/cheque reference for reconciliation.</p>{canViewDiagnostics ? <p className="text-xs text-muted-foreground">Diagnostics visible for admin only.</p> : null}</div> : null}
          </div>
        </div>
      </section>

      {workflowGuard ? (
        <WorkflowGuard
          title={workflowGuard.title}
          detail={workflowGuard.detail}
          actionLabel={workflowGuard.actionLabel}
          actionHref={workflowGuard.actionHref}
        />
      ) : null}

      {!studentSelectedFromIndex ? (
        <SectionCard
          title="Choose a student to continue"
          description="Dues, installment breakup, and the payment form will appear after a student is selected."
        >
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
            Search by SR no, student name, phone number, or receipt number, then continue with that student.
          </p>
        </SectionCard>
      ) : (
        <>
          {selectedStudentIssue && !selectedStudent && !studentSummaryLoading ? (
            <SectionCard
              title={selectedStudentIssue.title}
              description="Unable to load dues. Ask admin to check Fee Setup."
            >
              <div className="flex flex-wrap items-center gap-2">
                {selectedStudentIssue.repairStudentId && selectedStudentIssue.actionLabel && canPost ? (
                  <form action={repairPaymentDeskStudentDuesAction}>
                    <input type="hidden" name="studentId" value={selectedStudentIssue.repairStudentId} />
                    <Button type="submit">{selectedStudentIssue.actionLabel}</Button>
                  </form>
                ) : selectedStudentIssue.actionHref && selectedStudentIssue.actionLabel ? (
                  <Button asChild>
                    <Link href={selectedStudentIssue.actionHref}>{selectedStudentIssue.actionLabel}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link href="/protected/students">Open Students</Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            {data.policyNote}
          </div>


          {selectedStudent && (creditBalance > 0 || selectedStudent.rowsKeptForReview > 0) ? (
            <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
              {creditBalance > 0 ? (
                <p className="font-semibold">
                  Amount to refund/adjust: {formatInr(refundableAmount || creditBalance)}
                </p>
              ) : null}
              {previewTotalPending <= 0 && creditBalance > 0 ? (
                <p className="mt-1">
                  No pending dues. Student has {formatInr(creditBalance)} credit, so normal payment posting is blocked.
                </p>
              ) : null}
              {selectedStudent.rowsKeptForReview > 0 ? (
                <p className="mt-1">
                  {selectedStudent.rowsKeptForReview} fee row
                  {selectedStudent.rowsKeptForReview === 1 ? "" : "s"} kept for admin review.
                </p>
              ) : null}
            </div>
          ) : null}

          <SectionCard
            title="3. Fast Payment"
            description="Selected student, amount, mode, and confirm payment in one place."
            actions={<ValueStatePill tone="locked">Receipt saved after posting</ValueStatePill>}
          >
            {!canPost ? (
              <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
                {workflowGuard
                  ? workflowGuard.detail
                  : "You have view-only access for payment entry. Contact admin staff for posting access."}
              </p>
            ) : null}
            <form
              action={formAction}
              className="payment-entry-form relative space-y-3"
              onSubmit={(event) => {
                if (!isConfirmOpen) {
                  event.preventDefault();
                  openConfirmationDialog();
                  return;
                }

                if (
                  shouldBlockClientSubmission({
                    isSubmitting: submittingRef.current || pending,
                    isLockedAfterSuccess,
                  })
                ) {
                  event.preventDefault();
                  return;
                }

                submittingRef.current = true;
                setDismissedActionStateKey(null);
              }}
            >
              <ActionNotice state={visibleActionState} canViewDiagnostics={canViewDiagnostics} />
              {formError ? (
                <div className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
                  {formError}
                </div>
              ) : null}
              <fieldset
                disabled={!canPost || isLockedAfterSuccess}
                className="space-y-3 disabled:opacity-70"
              >
                <input type="hidden" name="studentId" value={selectedStudentId} />
                <input type="hidden" name="clientRequestId" value={clientRequestId} />

                {studentSummaryLoading ? (
                  <p className="rounded-md bg-info-soft px-2 py-1 text-xs text-info-soft-foreground">Loading dues...</p>
                ) : null}
                {selectedStudent ? (
                  <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-foreground">
                    <p className="font-semibold text-foreground">{selectedStudent.fullName} · SR {selectedStudent.admissionNo}</p>
                    <p>Pending: {formatInr(previewTotalPending)} · Overdue: {formatInr(previewOverdueAmount)}</p>
                    <p>
                      Next due: {previewNextDue ? `${previewNextDue.installmentLabel} (${formatInr(previewNextDue.outstandingAmount)})` : "No pending installment"}
                    </p>
                    {creditBalance > 0 ? <p className="font-semibold text-warning-soft-foreground">Credit/refund to adjust: {formatInr(refundableAmount || creditBalance)}</p> : null}
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div ref={amountSectionRef}>
                    <Label htmlFor="payment-amount">Amount received</Label>
                    <Input
                      id="payment-amount"
                      name="paymentAmount"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoCapitalize="off"
                      autoCorrect="off"
                      min={1}
                      max={previewTotalPending > 0 ? previewTotalPending : undefined}
                      className="mt-1 h-10 text-base"
                      ref={amountInputRef}
                      value={paymentAmountInput}
                      onChange={(event) => {
                        setPaymentAmountInput(event.target.value);
                        setFormError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (isMobileView) {
                            event.currentTarget.blur();
                            return;
                          }
                          openConfirmationDialog();
                        }
                      }}
                      required
                    />
                    <div className="mt-2 flex gap-2 overflow-x-auto py-1 no-scrollbar md:hidden">
                      {mobilePresetAmounts.map((presetAmount) => (
                        <button
                          key={presetAmount}
                          type="button"
                          className="shrink-0 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-medium text-foreground transition-colors active:bg-surface-3"
                          onClick={() => {
                            setPaymentAmountInput(String(presetAmount));
                            setFormError(null);
                          }}
                        >
                          {formatInr(presetAmount)}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 hidden flex-wrap gap-2 md:flex">
                      {quickAmounts.map((quickAmount) => (
                        <Button
                          key={quickAmount.key}
                          type="button"
                          size="sm"
                          variant={quickAmount.key === "clear" ? "ghost" : "outline"}
                          className="h-8 px-2 text-xs"
                          disabled={quickAmount.disabled}
                          onClick={() => {
                            setFormError(null);
                            if (quickAmount.amount === null) {
                              setPaymentAmountInput("");
                              return;
                            }

                            setPaymentAmountInput(String(quickAmount.amount));
                          }}
                        >
                          {quickAmount.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="quick-discount-amount">Additional discount / concession</Label>
                    <Input
                      id="quick-discount-amount"
                      name="quickDiscountAmount"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="next"
                      min={0}
                      max={previewTotalPending}
                      className="mt-1 h-10"
                      value={quickDiscountInput}
                      onChange={(event) => {
                        setQuickDiscountInput(event.target.value);
                        setFormError(null);
                      }}
                    />
                  </div>
                  <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 xl:col-span-2">
                    <input type="hidden" name="quickLateFeeWaiverAmount" value={quickLateFeeWaiverAmount} />
                    <label className="flex items-start gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-border-strong"
                        checked={waiveFullLateFee}
                        disabled={pendingLateFeeAmount <= 0}
                        onChange={(event) => {
                          setWaiveFullLateFee(event.target.checked);
                          setFormError(null);
                        }}
                      />
                      <span>
                        Waive full pending late fee ({formatInr(pendingLateFeeAmount)})
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          Applies only to pending late fee.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div>
                    <Label htmlFor="payment-date">Payment date</Label>
                    <Input
                      id="payment-date"
                      name="paymentDate"
                      type="date"
                      value={paymentDate}
                      onChange={(event) => {
                        setPaymentDate(event.target.value);
                        setFormError(null);
                      }}
                      className="mt-1 h-10"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-mode">Payment mode</Label>
                    <input type="hidden" name="paymentMode" value={paymentMode} />
                    <div className="mt-1 md:hidden">
                      <MobilePaymentModeSheet
                        value={paymentMode}
                        onChange={(value) => {
                          setPaymentMode(value as typeof paymentMode);
                          setFormError(null);
                        }}
                        disabled={!selectedStudent}
                      />
                    </div>
                    <select
                      id="payment-mode"
                      className={`${selectClassName} mt-1 hidden h-10 md:flex`}
                      value={paymentMode}
                      onChange={(event) => {
                        setPaymentMode(event.target.value as typeof paymentMode);
                        setFormError(null);
                      }}
                      required
                    >
                      {data.modeOptions.map((modeOption) => (
                        <option key={modeOption.value} value={modeOption.value}>
                          {modeOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {showReferenceField ? (
                    <div>
                      <Label htmlFor="payment-reference-number">
                        Reference number
                      </Label>
                      <Input
                        id="payment-reference-number"
                        name="referenceNumber"
                        className="mt-1 h-10"
                        placeholder="Optional"
                        ref={refInputRef}
                        inputMode={referenceInputMode}
                        enterKeyHint="done"
                        autoCapitalize="off"
                        autoCorrect="off"
                        value={referenceNumber}
                        onChange={(event) => {
                          setReferenceNumber(event.target.value);
                          setFormError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (isMobileView) {
                              event.currentTarget.blur();
                              return;
                            }
                            openConfirmationDialog();
                          }
                        }}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Reference is useful for matching bank/UPI records.
                      </p>
                    </div>
                  ) : (
                    <input type="hidden" name="referenceNumber" value="" />
                  )}
                  <div>
                    <Label htmlFor="payment-received-by">Received by</Label>
                    <Input
                      id="payment-received-by"
                      name="receivedBy"
                      className="mt-1 h-10"
                      enterKeyHint="next"
                      autoComplete="name"
                      value={receivedBy}
                      onChange={(event) => {
                        setReceivedBy(event.target.value);
                        setFormError(null);
                      }}
                      required
                    />
                  </div>
                </div>
                
                <details className="rounded-lg border border-border bg-card px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    Remarks and allocation preview
                  </summary>
                <div className="mt-3">
                  <Label htmlFor="payment-remarks">Remarks</Label>
                  <Textarea
                    id="payment-remarks"
                    name="remarks"
                    className={`${textAreaClassName} mt-1 min-h-16`}
                    placeholder="Optional desk remarks"
                    enterKeyHint="done"
                    value={remarks}
                    onChange={(event) => {
                      setRemarks(event.target.value);
                      setFormError(null);
                    }}
                  />
                </div>

                <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
                  <p className="text-sm font-semibold text-foreground">Installment allocation preview</p>
                  {clientPreviewAmount && previewLoading ? (
                    <p className="mt-2 inline-flex rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-medium text-info-soft-foreground">
                      Calculating... estimated amount {formatInr(clientPreviewAmount)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Amount is auto-allocated from oldest pending installment to newest. Final late fee and pending amount are recalculated for the selected payment date.
                  </p>
                  {previewNotice ? (
                    <p
                      aria-live="polite"
                      className={
                        previewUnavailable
                          ? "mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground"
                          : "mt-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground"
                      }
                    >
                      {previewNotice}
                    </p>
                  ) : null}

                  {allocationPreview.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Enter a payment amount to preview allocation.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 space-y-2 md:hidden">
                        {allocationPreview.map((item, index) => (
                          <div
                            key={item.installmentId}
                            className="rounded-lg border border-border bg-card px-3 py-2 text-xs animate-slide-up-fade"
                            style={{ animationDelay: `${index * 40}ms` }}
                          >
                            <p className="font-semibold text-foreground">{item.installmentLabel}</p>
                            <p className="text-muted-foreground">{item.dueDate}</p>
                            <p>Allocated: {formatInr(item.allocatedAmount)}</p>
                            <p>Remaining: {formatInr(item.outstandingAfter)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
                      <table className="w-full min-w-[600px] text-left text-sm">
                        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Installment</th>
                            <th className="px-3 py-2">Due date</th>
                            <th className="px-3 py-2">Outstanding before</th>
                            <th className="px-3 py-2">Allocated</th>
                            <th className="px-3 py-2">Outstanding after</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocationPreview.map((item) => (
                            <tr key={item.installmentId} className="border-t border-border">
                              <td className="px-3 py-2">{item.installmentLabel}</td>
                              <td className="px-3 py-2">{item.dueDate}</td>
                              <td className="px-3 py-2">{formatInr(item.outstandingBefore)}</td>
                              <td className="px-3 py-2 font-medium text-foreground">
                                {formatInr(item.allocatedAmount)}
                              </td>
                              <td className="px-3 py-2">{formatInr(item.outstandingAfter)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </>
                  )}

                  <div className="mt-3 grid gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-3">
                    <span>Pending before discount: {formatInr(previewTotalPending)}</span>
                    <span>Late fee pending: {formatInr(pendingLateFeeAmount)}</span>
                    <span>Late fee waived: {formatInr(quickLateFeeWaiverAmount)}</span>
                    <span>Discount: {formatInr(quickDiscountAmount)}</span>
                    <span>Net payable: {formatInr(netPayable)}</span>
                    <span>Amount received: {formatInr(paymentAmount)}</span>
                    <span>Remaining after this payment: {formatInr(remainingAfterPayment)}</span>
                  </div>
                </div>
                </details>

                <div className="hidden items-center justify-end gap-2 md:flex">
                  <Button
                    type="button"
                    disabled={confirmDisabled}
                    onClick={openConfirmationDialog}
                  >
                    Confirm Payment
                  </Button>
                </div>
              </fieldset>

              {pending ? (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-card/80 backdrop-blur-sm md:hidden">
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-center shadow-sm">
                    <div className="mx-auto size-6 rounded-full border-2 border-border border-t-accent animate-spin" />
                    <p className="mt-2 text-sm font-medium text-foreground">Processing payment...</p>
                  </div>
                </div>
              ) : null}

              {selectedStudent ? (
                <div
                  className="fixed inset-x-0 z-40 border-t border-border bg-card/95 p-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden mobile-safe-bottom-padding"
                  style={{ bottom: "var(--mobile-bottom-nav-offset)" }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{selectedStudent.fullName}</span>
                    <span className="shrink-0">Net {formatInr(netPayable)}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <div className="col-span-2 grid grid-cols-3 gap-1.5">
                      {quickAmounts.map((quickAmount) => (
                        <Button
                          key={`mobile-${quickAmount.key}`}
                          type="button"
                          size="sm"
                          variant={quickAmount.key === "clear" ? "ghost" : "outline"}
                          className="h-8 px-1 text-[11px]"
                          disabled={quickAmount.disabled}
                          onClick={() => {
                            setFormError(null);
                            setPaymentAmountInput(
                              quickAmount.amount === null ? "" : String(quickAmount.amount),
                            );
                          }}
                        >
                          {quickAmount.label}
                        </Button>
                      ))}
                    </div>
                    <Input
                      aria-label="Mobile amount received"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoCapitalize="off"
                      autoCorrect="off"
                      min={1}
                      placeholder="Amount"
                      className="h-9"
                      value={paymentAmountInput}
                      onChange={(event) => {
                        setPaymentAmountInput(event.target.value);
                        setFormError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <Input
                      aria-label="Mobile discount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="Discount"
                      className="h-9"
                      value={quickDiscountInput}
                      onChange={(event) => {
                        setQuickDiscountInput(event.target.value);
                        setFormError(null);
                      }}
                    />
                    <label className="col-span-2 flex min-h-9 items-center justify-between rounded-md border border-border bg-surface-2 px-2 text-xs font-medium text-foreground">
                      <span>Waive late fee {formatInr(pendingLateFeeAmount)}</span>
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={waiveFullLateFee}
                        disabled={pendingLateFeeAmount <= 0}
                        onChange={(event) => {
                          setWaiveFullLateFee(event.target.checked);
                          setFormError(null);
                        }}
                      />
                    </label>
                    <div aria-label="Mobile payment mode" className={showReferenceField ? "" : "col-span-2"}>
                      <MobilePaymentModeSheet
                        value={paymentMode}
                        onChange={(value) => {
                          setPaymentMode(value as typeof paymentMode);
                          setFormError(null);
                        }}
                        disabled={!selectedStudent}
                      />
                    </div>
                    {showReferenceField ? (
                      <Input
                        aria-label="Mobile reference number"
                        placeholder="Reference (optional)"
                        className="h-11"
                        inputMode={referenceInputMode}
                        enterKeyHint="done"
                        autoCapitalize="off"
                        autoCorrect="off"
                        value={referenceNumber}
                        onChange={(event) => {
                          setReferenceNumber(event.target.value);
                          setFormError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
                    <span>Pending {formatInr(previewTotalPending)}</span>
                    <span>Amount {paymentAmountInput ? formatInr(paymentAmount) : "Not entered"}</span>
                  </div>
                  <Button
                    type="button"
                    className="mt-2 h-10 w-full"
                    disabled={confirmDisabled}
                    onClick={openConfirmationDialog}
                  >
                    {paymentAmountInput ? "Confirm Payment" : "Enter amount to continue"}
                  </Button>
                </div>
              ) : null}

              {isConfirmOpen && confirmationSummary ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
                  <div className="max-h-[92vh] w-full anim-slide-up overflow-y-auto rounded-t-2xl border border-border bg-surface-2 p-2 pb-[calc(0.5rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-4xl md:rounded-xl md:p-4">
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="border-b border-dashed border-border-strong pb-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Shri Veer Patta Senior Secondary School
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-foreground">Receipt Preview</h2>
                      <p className="text-sm text-muted-foreground">Confirm Payment</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm lg:grid-cols-4">
                      <span>Student name: {confirmationSummary.studentName}</span>
                      <span>SR no: {confirmationSummary.admissionNo}</span>
                      <span>Class: {confirmationSummary.classLabel}</span>
                      <span>Father/phone: {selectedStudent?.fatherName ?? selectedStudent?.fatherPhone ?? "Not entered"}</span>
                      <span>Payment date: {confirmationSummary.paymentDate}</span>
                      <span>Payment mode: {confirmationSummary.paymentModeLabel}</span>
                      <span>Reference number: {confirmationSummary.referenceNumber ?? "Not entered"}</span>
                      <span>Received by: {confirmationSummary.receivedBy}</span>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
                      <span>Pending before discount: {formatInr(confirmationSummary.pendingBeforeDiscount)}</span>
                      <span>Discount/concession: {formatInr(confirmationSummary.quickDiscountApplied)}</span>
                      <span>Late fee waived: {confirmationSummary.lateFeeWaivedApplied > 0 ? formatInr(confirmationSummary.lateFeeWaivedApplied) : "No late fee waived"}</span>
                      <span>Net payable: {formatInr(confirmationSummary.revisedPendingBeforePayment)}</span>
                      <span className="font-semibold text-foreground">Amount received: {formatInr(confirmationSummary.amount)}</span>
                      <span>Remaining balance: {formatInr(confirmationSummary.remainingBalance)}</span>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[760px] text-left text-xs md:text-sm">
                        <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Installment</th>
                            <th className="px-3 py-2">Due date</th>
                            <th className="px-3 py-2">Pending before</th>
                            <th className="px-3 py-2">Discount applied</th>
                            <th className="px-3 py-2">Late fee waived</th>
                            <th className="px-3 py-2">Amount received</th>
                            <th className="px-3 py-2">Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiptPreviewAllocation.map((item) => (
                            <tr key={item.installmentId} className="border-t border-border">
                              <td className="px-3 py-2">{item.installmentLabel}</td>
                              <td className="px-3 py-2">{item.dueDate}</td>
                              <td className="px-3 py-2">{formatInr(item.pendingBefore)}</td>
                              <td className="px-3 py-2">{formatInr(item.discountApplied)}</td>
                              <td className="px-3 py-2">{formatInr(item.lateFeeWaived)}</td>
                              <td className="px-3 py-2 font-medium text-foreground">{formatInr(item.amountReceived)}</td>
                              <td className="px-3 py-2">{formatInr(item.remaining)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                      This will save an official receipt. Posted receipts stay in history.
                    </p>
                    <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-dashed border-border-strong bg-card pt-3 mobile-safe-bottom-padding">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsConfirmOpen(false)}
                        disabled={pending}
                      >
                        Back/Edit
                      </Button>
                      <Button type="submit" disabled={pending || submittingRef.current || previewLoading || !draftValidation.ok}>
                        {pending ? "Posting payment..." : "Confirm & Save Receipt"}
                      </Button>
                    </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {isSuccessOpen && visibleActionState.status === "success" && visibleReceiptHref && selectedStudent ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
                  <div className="max-h-[92vh] w-full anim-slide-up animate-bottom-sheet-up overflow-y-auto rounded-t-2xl border border-success/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-xl md:rounded-xl md:p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-flex size-7 anim-scale-in animate-success-check items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
                        ✓
                      </span>
                      <h2 className="text-lg font-semibold text-foreground">Payment Successful</h2>
                    </div>
                    <p className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
                      Receipt has been saved.
                    </p>
                    <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Receipt No
                      </p>
                      <p className="mt-1 break-all text-2xl font-semibold text-foreground">
                        {visibleActionState.receiptNumber}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <span>Student name: {selectedStudent.fullName}</span>
                      <span>SR/admission no: {selectedStudent.admissionNo}</span>
                      <span>Class: {selectedStudent.classLabel}</span>
                      <span>Amount received: {formatInr(visibleActionState.amountReceived ?? paymentAmount)}</span>
                      {(visibleActionState.quickDiscountApplied ?? quickDiscountAmount) > 0 ? (
                        <span>Discount applied: {formatInr(visibleActionState.quickDiscountApplied ?? quickDiscountAmount)}</span>
                      ) : null}
                      {(visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount) > 0 ? (
                        <span>Late fee waived: {formatInr(visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount)}</span>
                      ) : null}
                      <span>Payment date: {visibleActionState.paymentDate ?? paymentDate}</span>
                      <span>Payment mode: {postedPaymentModeLabel}</span>
                      <span>Reference number: {visibleActionState.referenceNumber ?? "Not entered"}</span>
                      <span>Received by: {visibleActionState.receivedBy ?? receivedBy}</span>
                      <span>Remaining balance: {formatInr(visibleActionState.remainingBalance ?? remainingAfterPayment)}</span>
                      {creditBalance > 0 ? (
                        <span>Credit/refund state: {formatInr(refundableAmount || creditBalance)} to adjust/refund</span>
                      ) : null}
                    </div>
                    <div className="sticky bottom-0 mt-5 flex flex-wrap justify-end gap-2 border-t border-border bg-card pt-3 mobile-safe-bottom-padding">
                      {printReceiptHref ? (
                        <Button asChild variant="outline">
                          <Link href={printReceiptHref} target="_blank">Print Receipt</Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline">
                        <Link href={visibleReceiptHref}>Open Receipt</Link>
                      </Button>
                      {whatsappCopy ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(whatsappCopy);
                            setCopyStatus("copied");
                          }}
                        >
                          {copyStatus === "copied" ? "Copied message" : "Copy WhatsApp Message"}
                        </Button>
                      ) : null}
                      <Button type="button" onClick={handleCollectAnotherPayment}>
                        Collect Another Payment
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {isDuplicateOpen && visibleActionState.status === "duplicate" && visibleActionState.receiptId ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
                  <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-warning/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-lg md:rounded-xl md:p-5">
                    <h2 className="text-lg font-semibold text-foreground">
                      Similar payment already recorded
                    </h2>
                    <p className="mt-3 text-sm text-foreground">{visibleActionState.message}</p>
                    <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                      Latest receipt: {visibleActionState.receiptNumber}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/protected/receipts/${visibleActionState.receiptId}`}>Open latest receipt</Link>
                      </Button>
                      <Button type="button" onClick={handleCollectAnotherPayment}>
                        Start new payment
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </form>
          </SectionCard>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {studentSummaryLoading && !selectedStudent ? (
              <>
                <LoadingBlock className="h-24 rounded-2xl bg-surface-2" lines={1} />
                <LoadingBlock className="h-24 rounded-2xl bg-surface-2" lines={1} />
                <LoadingBlock className="h-24 rounded-2xl bg-surface-2" lines={1} />
                <LoadingBlock className="h-24 rounded-2xl bg-surface-2" lines={1} />
                <LoadingBlock className="h-24 rounded-2xl bg-surface-2" lines={1} />
              </>
            ) : selectedStudent ? (
              <>
                <MetricCard
                  title="Total due"
                  value={formatInr(selectedStudent.totalDue)}
                  hint={`${selectedStudent.fullName} (${selectedStudent.admissionNo})`}
                />
                <MetricCard
                  title="Paid"
                  value={formatInr(selectedStudent.totalPaid)}
                  hint="Includes posted payments and adjustments"
                />
                <MetricCard
                  title="Pending"
                  value={formatInr(previewTotalPending)}
                  hint={`Recalculated for payment date ${paymentDate}`}
                />
                <MetricCard
                  title="Overdue"
                  value={formatInr(previewOverdueAmount)}
                  hint="Due installments past their date"
                />
                <MetricCard
                  title="Next due installment"
                  value={previewNextDue?.installmentLabel ?? "No pending dues"}
                  hint={
                    previewNextDue
                      ? `${previewNextDue.dueDate} - ${formatInr(previewNextDue.outstandingAmount)}`
                      : "All installments settled"
                  }
                />
              </>
            ) : null}
          </section>

          <SectionCard
            title="3. Review Dues"
            description="Installment-level dues before saving the next receipt."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ValueStatePill tone="policy">From Fee Setup</ValueStatePill>
                {previewTotalPending > 0 ? (
                  <StatusBadge label="Pending dues" tone="warning" />
                ) : (
                  <StatusBadge label="Fully paid" tone="good" />
                )}
              </div>
            }
          >
            <div className="space-y-3 md:hidden">
              {studentSummaryLoading && selectedStudent ? (
                <div className="overflow-hidden rounded-full bg-surface-2" aria-live="polite">
                  <div className="h-1 w-1/3 rounded-full bg-accent anim-route-progress" />
                </div>
              ) : null}
              {previewBreakdown.map((item, index) => (
                <div
                  key={item.installmentId}
                  className="rounded-xl border border-border bg-card p-3 text-sm animate-slide-up-fade"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{item.installmentLabel}</p>
                    <ValueStatePill tone={item.balanceStatus === "paid" ? "locked" : item.balanceStatus === "partial" || item.balanceStatus === "overdue" ? "review" : "calculated"} className="normal-case tracking-normal">
                      {item.balanceStatus}
                    </ValueStatePill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Due {item.dueDate}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Base: {formatInr(item.amountDue - item.finalLateFee)}</span>
                    <span>Late: {formatInr(item.finalLateFee)}</span>
                    <span>Paid: {formatInr(item.paymentsTotal)}</span>
                    <span>Adj: {formatInr(item.adjustmentsTotal)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">Outstanding: {formatInr(item.outstandingAmount)}</p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Installment</th>
                    <th className="px-4 py-3">Due date</th>
                    <th className="px-4 py-3">Base due</th>
                    <th className="px-4 py-3">Late fee</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Adjustments</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewBreakdown.map((item) => (
                    <tr key={item.installmentId} className="border-t border-border text-foreground">
                      <td className="px-4 py-3">{item.installmentLabel}</td>
                      <td className="px-4 py-3">{item.dueDate}</td>
                      <td className="px-4 py-3">{formatInr(item.amountDue - item.finalLateFee)}</td>
                      <td className="px-4 py-3">{formatInr(item.finalLateFee)}</td>
                      <td className="px-4 py-3">{formatInr(item.paymentsTotal)}</td>
                      <td className="px-4 py-3">{formatInr(item.adjustmentsTotal)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {formatInr(item.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        <ValueStatePill
                          tone={
                            item.balanceStatus === "paid"
                              ? "locked"
                              : item.balanceStatus === "partial" || item.balanceStatus === "overdue"
                                ? "review"
                                : "calculated"
                          }
                          className="normal-case tracking-normal"
                        >
                          {item.balanceStatus}
                        </ValueStatePill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      <SectionCard
        title="Desk totals and recent receipts"
        description="Daily totals and lookup shortcuts stay below the payment form."
        className="mobile-payment-cta-clearance md:pb-4"
      >
        <details className="md:hidden">
          <summary className="cursor-pointer rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground">
            Show desk totals & recent receipts
          </summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Today&apos;s collection
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatInr(data.todayCollection.totalAmount)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {data.recentReceipts.length === 0 ? (
                <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                  No recent receipts yet.
                </p>
              ) : (
                data.recentReceipts.map((receipt, index) => {
                  const expanded = expandedReceiptId === receipt.id;

                  return (
                    <div
                      key={receipt.id}
                      className="rounded-xl border border-border bg-card p-3 shadow-sm animate-slide-up-fade"
                      style={{ animationDelay: `${index * 35}ms` }}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setExpandedReceiptId(expanded ? null : receipt.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-foreground">{receipt.receiptNumber}</span>
                          <span className="text-xs text-muted-foreground">{receipt.paymentDate}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="font-semibold text-success-soft-foreground">{formatInr(receipt.totalAmount)}</span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {receipt.paymentMode}
                          </span>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-muted-foreground animate-slide-up-fade">
                          <p>{receipt.studentLabel}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/protected/receipts/${receipt.id}`}>Print</Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/protected/students/${receipt.studentId}`}>Student</Link>
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </details>
        <div className="hidden gap-4 lg:grid-cols-[0.8fr_1.2fr] md:grid">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Today&apos;s collection
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatInr(data.todayCollection.totalAmount)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.todayCollection.receiptCount} receipt
                {data.todayCollection.receiptCount === 1 ? "" : "s"} posted today.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Quick actions
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/protected/transactions?view=receipts">Receipts</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/protected/transactions?view=collection_today">Today&apos;s collection</Link>
                </Button>
              </div>
              <div className="mt-3">
                {latestPayment ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/protected/receipts/${latestPayment.id}`}>Open latest receipt</Link>
                  </Button>
                ) : (
                  <OfficeRecentActions />
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.recentReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-muted-foreground">
                      No recent receipts yet.
                    </td>
                  </tr>
                ) : (
                  data.recentReceipts.map((receipt) => (
                    <tr key={receipt.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium text-foreground">{receipt.receiptNumber}</td>
                      <td className="px-4 py-3">{receipt.studentLabel}</td>
                      <td className="px-4 py-3">{formatInr(receipt.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/receipts/${receipt.id}`}>Print</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/students/${receipt.studentId}`}>Student</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
