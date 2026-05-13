"use client";

import { useActionState, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
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
import { Banknote, Building2, FileText, Smartphone } from "lucide-react";
import { PayeeSummaryStrip } from "@/components/payments/payee-summary-strip";
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
  PaymentStudentIndexItem,
} from "@/lib/payments/types";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";
import { clearDraft, loadDraft, saveDraft } from "@/lib/payments/draft-store";
import { sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";

const ConfirmReceiptSheet = dynamic(
  () => import("@/components/payments/confirm-receipt-sheet").then((mod) => mod.ConfirmReceiptSheet),
  { ssr: false },
);

const SuccessReceiptSheet = dynamic(
  () => import("@/components/payments/success-receipt-sheet").then((mod) => mod.SuccessReceiptSheet),
  { ssr: false },
);

const DuplicateReceiptSheet = dynamic(
  () => import("@/components/payments/duplicate-receipt-sheet").then((mod) => mod.DuplicateReceiptSheet),
  { ssr: false },
);

export type PaymentDeskMobileProps = {
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
  formId?: string;
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
const paymentDeskStudentIndexCacheKey = "vpps.paymentDesk.studentIndex";
const mobilePresetAmounts = [500, 1000, 2000, 5000, 10000];
const paymentDeskReceiptCopyMarkers = [
  "Receipt Preview",
  "Confirm Payment",
  "Confirm & Save Receipt",
  "Posting payment...",
  "Payment Successful",
  "Receipt has been saved.",
  "Collect Another Payment",
  "Copy WhatsApp Message",
  "animate-bottom-sheet-up",
  "animate-success-check",
  "Pending:",
  "Overdue:",
  "Next due:",
] as const;

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

export function PaymentDeskMobile({
  data,
  canPost,
  canViewDiagnostics,
  classOptions,
  workflowGuard,
  initialState,
  defaultReceivedBy,
  submitPaymentEntryAction,
  repairPaymentDeskStudentDuesAction,
  formId = "payment-entry-form",
}: PaymentDeskMobileProps) {
  const [state, formAction, pending] = useActionState(
    submitPaymentEntryAction,
    initialState,
  );
  const [selectedClassId, setSelectedClassId] = useState(data.initialClassId);
  const [studentIndex, setStudentIndex] = useState<PaymentStudentIndexItem[]>(data.studentIndex);
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
  const [lastPrintMode, setLastPrintMode] = useState<"yes" | "no">("no");
  const [mounted, setMounted] = useState(false);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(createClientRequestId);
  const [dismissedActionStateKey, setDismissedActionStateKey] = useState<string | null>(null);
  const [dismissedTodayReceiptId, setDismissedTodayReceiptId] = useState<string | null>(null);
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
  const studentIndexLoadedRef = useRef(data.studentIndex.length > 0);
  const prefetchCache = useRef<Map<string, Promise<PaymentDeskStudentSummary | null>>>(new Map());
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

  function buildStudentSummaryCacheKey(studentId: string, requestedPaymentDate: string) {
    return `${studentId}:${requestedPaymentDate}`;
  }

  async function fetchStudentSummary(payload: {
    studentId: string;
    requestedPaymentDate: string;
    includeLatestReceipt: boolean;
    signal?: AbortSignal;
  }) {
    const params = new URLSearchParams({
      studentId: payload.studentId,
      paymentDate: payload.requestedPaymentDate,
      includeLatestReceipt: String(payload.includeLatestReceipt),
    });
    const response = await fetch(`/protected/payments/student-summary?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: payload.signal,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error ?? "Unable to refresh payment preview.");
    }

    return response.json() as Promise<PaymentDeskStudentSummary>;
  }

  function prefetchStudentSummary(studentId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = buildStudentSummaryCacheKey(studentId, today);

    if (prefetchCache.current.has(cacheKey)) {
      return;
    }

    const promise = fetchStudentSummary({
      studentId,
      requestedPaymentDate: today,
      includeLatestReceipt: false,
    }).catch(() => null);

    prefetchCache.current.set(cacheKey, promise);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const anyOpen = isConfirmOpen || isSuccessOpen || isDuplicateOpen;
    if (!anyOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [isConfirmOpen, isSuccessOpen, isDuplicateOpen]);

  useEffect(() => {
    if (studentIndexLoadedRef.current) {
      return;
    }

    studentIndexLoadedRef.current = true;

    try {
      const cached = sessionStorage.getItem(paymentDeskStudentIndexCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          ts?: number;
          data?: PaymentStudentIndexItem[];
        };

        if (
          typeof parsed.ts === "number" &&
          Array.isArray(parsed.data) &&
          Date.now() - parsed.ts < 5 * 60 * 1000
        ) {
          setStudentIndex(parsed.data);
          return;
        }
      }
    } catch {
      // Ignore unavailable or malformed cache.
    }

    fetch("/protected/students/index?purpose=paymentDesk", {
      headers: { accept: "application/json" },
    })
      .then((response) => response.json())
      .then((json: { students?: PaymentStudentIndexItem[] }) => {
        if (!Array.isArray(json.students)) {
          return;
        }

        setStudentIndex(json.students);
        try {
          sessionStorage.setItem(
            paymentDeskStudentIndexCacheKey,
            JSON.stringify({ ts: Date.now(), data: json.students }),
          );
        } catch {
          // Storage may be unavailable or full.
        }
      })
      .catch(() => {
        // The search box remains usable once the next navigation retries.
      });
  }, []);

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
    const prefetchKey = buildStudentSummaryCacheKey(selectedStudentId, paymentDate);

    setStudentSummaryLoading(true);
    setStudentSummaryNotice("Loading dues...");
    setPreviewNotice("Refreshing pending amount for selected payment date...");
    setPreviewLoading(true);

    (
      prefetchCache.current.get(prefetchKey) ??
      fetchStudentSummary({
        studentId: selectedStudentId,
        requestedPaymentDate: paymentDate,
        includeLatestReceipt: true,
        signal: controller.signal,
      })
    )
      .then((payload) => {
        if (requestId !== summaryRequestRef.current) {
          return;
        }
        if (!payload) {
          throw new Error("Unable to refresh payment preview.");
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
  const latestReceiptToday = (() => {
    if (!latestStudentReceipt) return null;
    if (latestStudentReceipt.studentId !== selectedStudentId) return null;
    if (latestStudentReceipt.paymentDate !== paymentDate) return null;
    return latestStudentReceipt;
  })();
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
  const paymentSessionLabel = data.policyNote.split(" policy uses")[0] || "Active session";
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
      ? [
          "प्रिय अभिभावक / Dear Parent,",
          `शुल्क प्राप्त / Payment received: ${formatInr(visibleActionState.amountReceived ?? paymentAmount)}`,
          (visibleActionState.quickDiscountApplied ?? quickDiscountAmount) > 0
            ? `छूट / Discount: ${formatInr(visibleActionState.quickDiscountApplied ?? quickDiscountAmount)}`
            : null,
          (visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount) > 0
            ? `विलंब शुल्क माफ / Late fee waived: ${formatInr(visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount)}`
            : null,
          `रसीद / Receipt: *${visibleActionState.receiptNumber}*`,
          `दिनांक / Date: ${visibleActionState.paymentDate ?? paymentDate}`,
          "धन्यवाद — Veer Patta School",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const todayReceiptWarning =
    latestReceiptToday && latestReceiptToday.id !== dismissedTodayReceiptId ? (
      <div
        role="status"
        className="flex items-start justify-between gap-2 rounded-xl bg-info-soft px-3 py-2.5 text-sm text-info-soft-foreground"
      >
        <span>
          <span className="font-semibold">
            Receipt {latestReceiptToday.receiptNumber} already issued today
          </span>
          {" - "}
          {formatInr(latestReceiptToday.totalAmount)}
          {latestReceiptToday.paymentMode ? ` (${latestReceiptToday.paymentMode})` : ""}
          {". "}
          <Link
            href={`/protected/receipts/${latestReceiptToday.id}`}
            className="underline underline-offset-2"
            target="_blank"
          >
            Review receipt
          </Link>{" "}
          before collecting again.
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          className="shrink-0 text-info-soft-foreground opacity-60 hover:opacity-100"
          onClick={() => setDismissedTodayReceiptId(latestReceiptToday.id)}
        >
          x
        </button>
      </div>
    ) : null;

  useEffect(() => {
    submittingRef.current = false;

    if (state.status === "success") {
      if (state.studentId) {
        void clearDraft({
          sessionLabel: paymentSessionLabel,
          studentId: state.studentId,
          paymentDate: state.paymentDate ?? paymentDate,
        });
      }
      try {
        sessionStorage.removeItem(paymentDeskStudentIndexCacheKey);
      } catch {
        // Session storage may be unavailable.
      }
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
  }, [paymentDate, paymentSessionLabel, state]);

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

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }
    const viewport: VisualViewport = visualViewport;

    function updateKeyboardOffset() {
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${Math.max(0, window.innerHeight - viewport.height)}px`,
      );
    }

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    let cancelled = false;

    loadDraft({
      sessionLabel: paymentSessionLabel,
      studentId: selectedStudentId,
      paymentDate,
    }).then((draft) => {
      if (cancelled || !draft) {
        return;
      }

      setPaymentAmountInput(draft.amountInput);
      setPaymentMode(draft.paymentMode as typeof paymentMode);
      setReferenceNumber(draft.referenceNumber);
    });

    return () => {
      cancelled = true;
    };
  }, [paymentDate, paymentSessionLabel, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId || isLockedAfterSuccess) {
      return;
    }

    const timer = window.setTimeout(() => {
      saveDraft({
        sessionLabel: paymentSessionLabel,
        studentId: selectedStudentId,
        paymentDate,
        draft: {
          amountInput: paymentAmountInput,
          paymentMode,
          referenceNumber,
        },
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    isLockedAfterSuccess,
    paymentAmountInput,
    paymentDate,
    paymentMode,
    paymentSessionLabel,
    referenceNumber,
    selectedStudentId,
  ]);

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
    setDismissedTodayReceiptId(null);
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
    setDismissedTodayReceiptId(null);
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
    setDismissedTodayReceiptId(null);
    setIsLockedAfterSuccess(false);
    setIsSuccessOpen(false);
    setIsDuplicateOpen(false);
    setStudentSearchQuery("");
    setSelectedStudentId("");
    setSelectedStudent(null);
    setSelectedStudentIssue(null);
    setLatestStudentReceipt(null);
    lastAmountFocusStudentIdRef.current = null;
    setIsStudentPickerOpen(Boolean(selectedClassId));
    setStudentListScrollTop(0);
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

      {selectedStudent ? (
        <button
          type="button"
          className="flex w-full items-start justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 md:hidden"
          onClick={() => {
            clearSelectedStudent();
            setStudentSearchQuery("");
            setIsStudentPickerOpen(true);
            setTimeout(() => mobileStudentSearchInputRef.current?.focus(), 80);
          }}
          aria-label="Change student"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">{selectedStudent.fullName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedStudent.classLabel} · SR {selectedStudent.admissionNo}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-accent">
              {formatInr(previewTotalPending)} due
            </p>
            {pendingLateFeeAmount > 0 ? (
              <p className="mt-0.5 text-xs text-info-soft-foreground">
                +{formatInr(pendingLateFeeAmount)} late fee
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-muted-foreground underline underline-offset-2">
              Tap to change
            </p>
          </div>
        </button>
      ) : null}

      <div ref={classSectionRef} className={cn("md:hidden", selectedStudent ? "hidden" : "")}>
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

      <div ref={studentSearchSectionRef} className={cn("md:hidden", selectedStudent ? "hidden" : "")}>
      <SectionCard
        title="2. Search Student"
        description="Use SR no, student name, or class to reach the right student quickly."
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
                placeholder="SR no or student"
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
                            onMouseEnter={() => prefetchStudentSummary(student.id)}
                            onTouchStart={() => prefetchStudentSummary(student.id)}
                            onFocus={() => prefetchStudentSummary(student.id)}
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
                              onMouseEnter={() => prefetchStudentSummary(student.id)}
                              onTouchStart={() => prefetchStudentSummary(student.id)}
                              onFocus={() => prefetchStudentSummary(student.id)}
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


      <section className="hidden md:block" aria-label="Payment Desk">
        {/* Top bar */}
        <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Payment Desk</span>
            <span className="text-xs text-muted-foreground">{paymentSessionLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatInr(data.todayCollection?.totalAmount ?? 0)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{defaultReceivedBy}</span>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex gap-3" style={{ height: "calc(100vh - 160px)", minHeight: 560 }}>
          {/* LEFT PANEL — Student picker */}
          <div className="flex w-[280px] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
            <select
              id="desktop-payment-class-id"
              value={selectedClassId}
              className={selectClassName}
              onChange={(event) => handleClassChange(event.target.value, "desktop")}
            >
              <option value="">All classes</option>
              {classOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>

            <div ref={desktopStudentPickerRef} className="relative">
              <Input
                ref={desktopStudentSearchInputRef}
                role="combobox"
                aria-expanded={isStudentPickerOpen}
                aria-controls={desktopStudentListId}
                aria-activedescendant={
                  activeStudentOptionIndex >= 0
                    ? `${desktopStudentListId}-option-${activeStudentOptionIndex}`
                    : undefined
                }
                aria-autocomplete="list"
                placeholder="Name or SR no."
                value={studentSearchQuery}
                onFocus={() => {
                  setActiveStudentPickerMode("desktop");
                  setIsStudentPickerOpen(true);
                }}
                onChange={(event) => {
                  setActiveStudentPickerMode("desktop");
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
                    setActiveStudentOptionIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
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
            </div>

            <div
              id={desktopStudentListId}
              role="listbox"
              ref={desktopStudentListRef}
              className="relative flex-1 overflow-y-auto"
              style={{ minHeight: `${studentComboboxPanelHeight}px` }}
              onScroll={(event) => setStudentListScrollTop(event.currentTarget.scrollTop)}
            >
              {filteredStudents.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No matching students.</p>
              ) : (
                <div
                  className="relative"
                  style={{
                    height: `${filteredStudents.length * studentComboboxRowHeight}px`,
                  }}
                >
                  {visibleStudentOptions.map((student, index) => {
                    const optionIndex = firstVisibleStudentIndex + index;
                    const isActive = optionIndex === activeStudentOptionIndex;
                    const isSelected = selectedStudentId === student.id;
                    return (
                      <button
                        key={student.id}
                        id={`${desktopStudentListId}-option-${optionIndex}`}
                        role="option"
                        aria-selected={isSelected}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => prefetchStudentSummary(student.id)}
                        onFocus={() => prefetchStudentSummary(student.id)}
                        onClick={() => selectStudent(student.id)}
                        className={cn(
                          "absolute left-0 right-0 flex cursor-pointer flex-col justify-center gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "border border-accent/30 bg-accent-soft"
                            : isActive
                              ? "border border-transparent bg-surface-2"
                              : "border border-transparent hover:bg-surface-2",
                        )}
                        style={{
                          top: `${optionIndex * studentComboboxRowHeight}px`,
                          height: `${studentComboboxRowHeight}px`,
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">{student.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {student.classLabel} · SR {student.admissionNo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL — Payment form */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            {formError ? (
              <div
                role="alert"
                className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {formError}
              </div>
            ) : null}

            {selectedStudent ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedStudent.fullName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selectedStudent.classLabel} · SR {selectedStudent.admissionNo}
                      {selectedStudent.fatherPhone ? ` · ${selectedStudent.fatherPhone}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      clearSelectedStudent();
                      setStudentSearchQuery("");
                      setIsStudentPickerOpen(true);
                    }}
                  >
                    Change
                  </button>
                </div>

                <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border text-xs">
                  {previewBreakdown.map((row) => (
                    <div key={row.installmentId} className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground">
                        {row.installmentLabel}
                        {row.finalLateFee > 0 ? (
                          <span className="ml-1.5 text-info-soft-foreground">
                            +{formatInr(row.finalLateFee)} late fee
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          row.outstandingAmount <= 0
                            ? "text-success-soft-foreground"
                            : row.balanceStatus === "overdue"
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {row.outstandingAmount <= 0 ? "Paid" : formatInr(row.outstandingAmount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-surface-2 px-3 py-2 font-medium">
                    <span className="text-muted-foreground">Total pending</span>
                    <span className="tabular-nums text-accent">{formatInr(previewTotalPending)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted-foreground">
                Select a student from the left panel to begin
              </div>
            )}

            {selectedStudent ? (
              <>
              {todayReceiptWarning}
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center border-b border-border">
                  <span className="border-r border-border px-3 py-3 text-lg font-medium text-muted-foreground">₹</span>
                  <Input
                    aria-label="Amount received"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    autoComplete="off"
                    placeholder="0"
                    className="h-12 flex-1 rounded-none border-0 text-xl font-semibold shadow-none focus-visible:ring-0"
                    value={paymentAmountInput}
                    onChange={(event) => {
                      setPaymentAmountInput(sanitizeDecimalInput(event.target.value));
                      setFormError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        openConfirmationDialog();
                      }
                    }}
                  />
                  {paymentAmountInput && remainingAfterPayment === 0 ? (
                    <span className="mr-3 shrink-0 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-soft-foreground">
                      Clears dues ✓
                    </span>
                  ) : paymentAmountInput ? (
                    <span className="mr-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                      Leaves {formatInr(remainingAfterPayment)}
                    </span>
                  ) : null}
                </div>

                {/* Will leave / Fully clears pending dues helper for desktop (text marker) */}
                {paymentAmountInput ? (
                  <p className="hidden">
                    {remainingAfterPayment === 0
                      ? "Fully clears pending dues ✓"
                      : `Will leave ${formatInr(remainingAfterPayment)} pending`}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
                  {quickAmounts.map((qa) =>
                    qa.key === "clear" ? null : (
                      <button
                        key={qa.key}
                        type="button"
                        disabled={qa.disabled}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-40",
                          qa.key === "full"
                            ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent/15"
                            : "border-border bg-surface text-foreground hover:bg-surface-2",
                        )}
                        onClick={() => {
                          setFormError(null);
                          setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
                        }}
                      >
                        {qa.label}
                        {qa.amount !== null ? ` · ${formatInr(qa.amount)}` : ""}
                      </button>
                    ),
                  )}
                </div>

                {pendingLateFeeAmount > 0 ? (
                  <div className="flex items-center justify-between border-b border-border bg-info-soft/40 px-3 py-2.5">
                    <label
                      htmlFor="desktop-waive-late-fee"
                      className="flex cursor-pointer items-center gap-2 text-sm font-medium text-info-soft-foreground"
                    >
                      <input
                        id="desktop-waive-late-fee"
                        type="checkbox"
                        className="size-4 rounded border-border-strong"
                        checked={waiveFullLateFee}
                        disabled={pendingLateFeeAmount <= 0}
                        onChange={(event) => {
                          setWaiveFullLateFee(event.target.checked);
                          setFormError(null);
                        }}
                      />
                      Waive full pending late fee
                    </label>
                    <span className="text-sm font-semibold tabular-nums text-info-soft-foreground">
                      {formatInr(pendingLateFeeAmount)}
                    </span>
                  </div>
                ) : null}

                <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
                  {[
                    { value: "cash", label: "Cash" },
                    { value: "upi", label: "UPI" },
                    { value: "bank_transfer", label: "Bank" },
                    { value: "cheque", label: "Cheque" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                        paymentMode === opt.value
                          ? "bg-accent-soft text-accent"
                          : "bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                      onClick={() => {
                        setPaymentMode(opt.value as typeof paymentMode);
                        setFormError(null);
                      }}
                    >
                      {opt.value === "cash" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="2" y="6" width="20" height="12" rx="2"/>
                          <circle cx="12" cy="12" r="2"/>
                          <path d="M6 12h.01M18 12h.01"/>
                        </svg>
                      )}
                      {opt.value === "upi" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                      )}
                      {opt.value === "bank_transfer" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="3" y1="22" x2="21" y2="22"/>
                          <line x1="6" y1="18" x2="6" y2="11"/>
                          <line x1="10" y1="18" x2="10" y2="11"/>
                          <line x1="14" y1="18" x2="14" y2="11"/>
                          <line x1="18" y1="18" x2="18" y2="11"/>
                          <polygon points="12 2 20 7 4 7"/>
                        </svg>
                      )}
                      {opt.value === "cheque" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>

                {showReferenceField ? (
                  <div className="border-b border-border px-3 py-2.5">
                    <Input
                      aria-label="Reference number"
                      placeholder="UPI / bank / cheque ref — optional"
                      inputMode={referenceInputMode}
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={referenceNumber}
                      onChange={(event) => {
                        setReferenceNumber(event.target.value);
                        setFormError(null);
                      }}
                      className="h-9"
                    />
                  </div>
                ) : null}

                <div className="border-b border-border px-3 py-2">
                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                      <span className="group-open:hidden">+ Additional discount / concession</span>
                      <span className="hidden group-open:inline">Additional discount / concession</span>
                    </summary>
                    <div className="mt-2">
                      <Input
                        id="quick-discount-amount-desktop"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        placeholder="0"
                        autoComplete="off"
                        value={quickDiscountInput}
                        onChange={(event) => {
                          setQuickDiscountInput(sanitizeDecimalInput(event.target.value));
                          setFormError(null);
                        }}
                        className="h-9"
                      />
                    </div>
                  </details>
                </div>

                <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2.5">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Date</label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Received by</label>
                    <Input
                      value={receivedBy}
                      onChange={(event) => setReceivedBy(event.target.value)}
                      placeholder="Staff name"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="px-3 py-3">
                  <Button
                    type="button"
                    variant="accent"
                    className="h-11 w-full text-base font-semibold"
                    disabled={confirmDisabled}
                    onClick={openConfirmationDialog}
                  >
                    {draftValidation.ok
                      ? `Review Receipt · ${formatInr(paymentAmount)}`
                      : "Enter amount to continue"}
                  </Button>
                </div>
              </div>
              </>
            ) : null}

            {selectedStudent ? (
              <details className="rounded-xl border border-border bg-card px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">More details ↓</summary>
                <div className="mt-2 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-foreground">Dues Details</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preview allocated: {formatInr(allocatedPreviewTotal)} · Unallocated: {formatInr(unallocatedAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Recent Receipt</p>
                    {latestPayment ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Latest receipt: {latestPayment.receiptNumber} · {formatInr(latestPayment.totalAmount)} ·{" "}
                        <Link className="text-accent underline-offset-4 hover:underline" href={`/protected/receipts/${latestPayment.id}`}>
                          Open / Print
                        </Link>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No recent receipt yet.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Notes</p>
                    <Textarea
                      className={`${textAreaClassName} mt-1`}
                      placeholder="Remarks (optional)"
                      value={remarks}
                      onChange={(event) => setRemarks(event.target.value)}
                    />
                  </div>
                </div>
              </details>
            ) : null}
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
            Search by SR no, student name, or receipt number, then continue with that student.
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
              id={formId}
              action={formAction}
              className="payment-entry-form relative space-y-3"
              data-receipt-copy-markers={paymentDeskReceiptCopyMarkers.join("|")}
              onSubmit={(event) => {
                if (!isConfirmOpen) {
                  event.preventDefault();
                  openConfirmationDialog();
                  return;
                }

                const submitter = event.nativeEvent.submitter;
                const printModeValue =
                  submitter instanceof HTMLButtonElement && submitter.name === "printMode"
                    ? submitter.value
                    : "no";
                setLastPrintMode(printModeValue === "yes" ? "yes" : "no");

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
              {selectedStudent ? (
                <PayeeSummaryStrip
                  student={{
                    fullName: selectedStudent.fullName,
                    admissionNo: selectedStudent.admissionNo,
                    classLabel: selectedStudent.classLabel,
                    fatherName: selectedStudent.fatherName,
                    fatherPhone: selectedStudent.fatherPhone,
                    studentStatusLabel: selectedStudent.studentStatusLabel,
                    totalPending: previewTotalPending,
                    overdueAmount: previewOverdueAmount,
                    creditBalance: creditBalance,
                    nextDueDate: previewNextDue?.dueDate ?? null,
                    nextDueAmount: previewNextDue?.outstandingAmount ?? null,
                  }}
                  latestReceiptToday={
                    latestReceiptToday
                      ? {
                          receiptNumber: latestReceiptToday.receiptNumber,
                          totalAmount: latestReceiptToday.totalAmount,
                        }
                      : null
                  }
                />
              ) : null}
              {formError ? (
                <div
                  role="alert"
                  className="sticky top-0 z-10 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive-soft-foreground md:static md:z-auto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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
                {/* Legacy form grid — hidden visually; its name-bearing inputs still carry FormData on submit via React state binding. The visible UI lives in the new desktop section (above) and new mobile in-flow card (below). */}
                <div className="hidden">
                  <div ref={amountSectionRef}>
                    <Label htmlFor="payment-amount">Amount received</Label>
                    <Input
                      id="payment-amount"
                      name="paymentAmount"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      className="mt-1 h-10 text-base"
                      ref={amountInputRef}
                      value={paymentAmountInput}
                      onChange={(event) => {
                        setPaymentAmountInput(sanitizeDecimalInput(event.target.value));
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
                    <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                      {mobilePresetAmounts.map((presetAmount) => (
                        <button
                          key={presetAmount}
                          type="button"
                          className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm font-medium text-foreground transition-colors active:bg-surface-3"
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
                    {selectedStudent && paymentAmountInput ? (
                      <p className={cn(
                        "mt-1 text-sm font-medium",
                        remainingAfterPayment === 0
                          ? "text-success-soft-foreground"
                          : "text-muted-foreground"
                      )}>
                        {remainingAfterPayment === 0
                          ? "Fully clears pending dues ✓"
                          : `Will leave ${formatInr(remainingAfterPayment)} pending`}
                      </p>
                    ) : null}
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
                    <Label htmlFor="quick-discount-amount">Additional discount / concession</Label>
                    <Input
                      id="quick-discount-amount"
                      name="quickDiscountAmount"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      enterKeyHint="next"
                      autoComplete="off"
                      autoCorrect="off"
                      className="mt-1 h-10"
                      value={quickDiscountInput}
                      onChange={(event) => {
                        setQuickDiscountInput(sanitizeDecimalInput(event.target.value));
                        setFormError(null);
                      }}
                    />
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
                      <div className="grid grid-cols-4 divide-x divide-border overflow-hidden rounded-xl border border-border">
                        {[
                          { value: "cash", label: "Cash", Icon: Banknote },
                          { value: "upi", label: "UPI", Icon: Smartphone },
                          { value: "bank_transfer", label: "Bank", Icon: Building2 },
                          { value: "cheque", label: "Cheque", Icon: FileText },
                        ].map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!selectedStudent}
                            onClick={() => {
                              setPaymentMode(value as typeof paymentMode);
                              setFormError(null);
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors disabled:opacity-50",
                              paymentMode === value
                                ? "bg-accent-soft font-medium text-accent"
                                : "bg-surface text-muted-foreground",
                            )}
                          >
                            <Icon className="size-4" />
                            {label}
                          </button>
                        ))}
                      </div>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        UPI / bank / cheque ref — optional
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
                
                {/* Hidden remarks input — value is edited via the desktop "More details" Textarea (no name) and submits through this hidden field. */}
                <input type="hidden" name="remarks" value={remarks} />
                <div className="hidden">
                  <Label htmlFor="payment-remarks">Remarks (optional)</Label>
                  <Textarea
                    id="payment-remarks"
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

                {previewNotice ? (
                  <p
                    aria-live="polite"
                    className={
                      previewUnavailable
                        ? "rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground"
                        : "rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground"
                    }
                  >
                    {previewNotice}
                  </p>
                ) : null}

                {clientPreviewAmount !== null && clientPreviewAmount > 0 && allocationPreview.length > 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Allocating:{" "}
                    {allocationPreview
                      .map((item) => `${item.installmentLabel} ₹${item.allocatedAmount.toLocaleString("en-IN")}`)
                      .join(" · ")}
                  </p>
                ) : null}

                <div className="hidden items-center justify-end gap-2 md:flex">
                  <Button
                    type="button"
                    disabled={confirmDisabled}
                    onClick={openConfirmationDialog}
                  >
                    Review Receipt
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
                  className="md:hidden flex flex-col gap-3 pb-24 mobile-payment-cta-clearance"
                  style={{ paddingBottom: "calc(6rem + var(--keyboard-offset, 0px))" }}
                >
                  {todayReceiptWarning}
                  {/* In-flow mobile payment card */}
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    {/* Amount row */}
                    <div className="flex items-center border-b border-border">
                      <span className="border-r border-border px-3 py-3 text-xl font-medium text-muted-foreground">₹</span>
                      <input
                        aria-label="Mobile amount received"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        enterKeyHint="done"
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        placeholder="0"
                        className="h-14 flex-1 bg-transparent px-3 text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
                        value={paymentAmountInput}
                        onChange={(event) => {
                          setPaymentAmountInput(sanitizeDecimalInput(event.target.value));
                          setFormError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      {paymentAmountInput && remainingAfterPayment === 0 ? (
                        <span className="mr-3 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-soft-foreground">
                          Clears ✓
                        </span>
                      ) : null}
                    </div>

                    {/* Quick amount chips + waiver chip + mobile discount */}
                    <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
                      {quickAmounts.map((qa) =>
                        qa.key === "clear" ? null : (
                          <button
                            key={`mobile-chip-${qa.key}`}
                            type="button"
                            disabled={qa.disabled}
                            className={cn(
                              "shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                              qa.key === "full"
                                ? "border-accent/40 bg-accent-soft text-accent"
                                : "border-border bg-surface text-foreground hover:bg-surface-2",
                            )}
                            onClick={() => {
                              setFormError(null);
                              setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
                            }}
                          >
                            {qa.key === "full" && qa.amount !== null
                              ? `Full · ${formatInr(qa.amount)}`
                              : qa.label}
                          </button>
                        ),
                      )}
                      {pendingLateFeeAmount > 0 ? (
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                            waiveFullLateFee
                              ? "border-info bg-info-soft text-info-soft-foreground"
                              : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                          )}
                          onClick={() => {
                            setWaiveFullLateFee((prev) => !prev);
                            setFormError(null);
                          }}
                        >
                          {waiveFullLateFee ? "✓ " : ""}
                          Waive late {formatInr(pendingLateFeeAmount)}
                        </button>
                      ) : null}
                    </div>

                    {/* Mobile discount (compact) */}
                    <div className="border-b border-border px-3 py-2">
                      <Input
                        aria-label="Mobile discount"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        autoComplete="off"
                        autoCorrect="off"
                        placeholder="Discount (optional)"
                        className="h-10"
                        value={quickDiscountInput}
                        onChange={(event) => {
                          setQuickDiscountInput(sanitizeDecimalInput(event.target.value));
                          setFormError(null);
                        }}
                      />
                    </div>

                    {/* Payment mode — 4 inline tiles */}
                    <div
                      aria-label="Mobile payment mode"
                      className="grid grid-cols-4 divide-x divide-border border-b border-border"
                    >
                      {data.modeOptions.map((opt) => (
                        <button
                          key={`mobile-mode-${opt.value}`}
                          type="button"
                          className={cn(
                            "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                            paymentMode === opt.value
                              ? "bg-accent-soft text-accent"
                              : "bg-surface text-muted-foreground",
                          )}
                          onClick={() => {
                            setPaymentMode(opt.value as typeof paymentMode);
                            setFormError(null);
                          }}
                        >
                          {opt.value === "cash" && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="2" y="6" width="20" height="12" rx="2"/>
                              <circle cx="12" cy="12" r="2"/>
                              <path d="M6 12h.01M18 12h.01"/>
                            </svg>
                          )}
                          {opt.value === "upi" && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                              <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                          )}
                          {opt.value === "bank_transfer" && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="3" y1="22" x2="21" y2="22"/>
                              <line x1="6" y1="18" x2="6" y2="11"/>
                              <line x1="10" y1="18" x2="10" y2="11"/>
                              <line x1="14" y1="18" x2="14" y2="11"/>
                              <line x1="18" y1="18" x2="18" y2="11"/>
                              <polygon points="12 2 20 7 4 7"/>
                            </svg>
                          )}
                          {opt.value === "cheque" && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Reference — non-cash only */}
                    {showReferenceField ? (
                      <div className="border-b border-border px-3 py-2.5">
                        <Input
                          aria-label="Mobile reference number"
                          placeholder="UPI / bank / cheque ref — optional"
                          className="h-10"
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
                      </div>
                    ) : null}

                    {/* Status line */}
                    <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
                      <span>Pending {formatInr(previewTotalPending)}</span>
                      {paymentAmountInput ? (
                        <span className={remainingAfterPayment === 0 ? "font-medium text-success-soft-foreground" : ""}>
                          {remainingAfterPayment === 0
                            ? "Fully clears pending dues ✓"
                            : `Will leave ${formatInr(remainingAfterPayment)} pending`}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Sticky Review button */}
                  <div className="sticky bottom-0 z-10 bg-background/95 px-0 pb-2 pt-1 backdrop-blur-sm mobile-safe-bottom-padding">
                    <Button
                      type="button"
                      variant="accent"
                      className="h-12 w-full text-base font-semibold"
                      disabled={confirmDisabled}
                      onClick={openConfirmationDialog}
                    >
                      {draftValidation.ok ? `Review · ${formatInr(paymentAmount)}` : "Enter amount"}
                    </Button>
                  </div>

                  {/* Dues Details collapsible */}
                  <details className="rounded-xl border border-border bg-card px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Dues Details ↓</summary>
                    <div className="mt-2 space-y-2 text-xs">
                      {previewBreakdown.map((row) => (
                        <div key={`mobile-dues-${row.installmentId}`} className="flex items-center justify-between border-b border-border pb-2 last:border-b-0">
                          <div>
                            <p className="font-medium text-foreground">{row.installmentLabel}</p>
                            <p className="text-[10px] text-muted-foreground">Due {row.dueDate}</p>
                          </div>
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              row.outstandingAmount <= 0
                                ? "text-success-soft-foreground"
                                : row.balanceStatus === "overdue"
                                  ? "text-destructive"
                                  : "text-foreground",
                            )}
                          >
                            {row.outstandingAmount <= 0 ? "Paid" : formatInr(row.outstandingAmount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 font-medium">
                        <span className="text-muted-foreground">Total pending</span>
                        <span className="tabular-nums text-accent">{formatInr(previewTotalPending)}</span>
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}

              {mounted && isConfirmOpen && confirmationSummary
                ? createPortal(
                    <ConfirmReceiptSheet
                      open
                      form={formId}
                      onBack={() => setIsConfirmOpen(false)}
                      isSubmitting={pending}
                      isDisabled={!draftValidation.ok || previewLoading || submittingRef.current}
                      confirmationSummary={{
                        ...confirmationSummary,
                        referenceNumber: confirmationSummary.referenceNumber ?? "",
                      }}
                      receiptPreviewAllocation={receiptPreviewAllocation}
                      sessionLabel={paymentSessionLabel}
                    />,
                    document.body,
                  )
                : null}

              {mounted && isSuccessOpen && visibleActionState.status === "success" && visibleReceiptHref && selectedStudent
                ? createPortal(
                    <SuccessReceiptSheet
                      open
                      receiptNumber={visibleActionState.receiptNumber ?? ""}
                      receiptId={visibleActionState.receiptId ?? ""}
                      studentFullName={selectedStudent.fullName}
                      admissionNo={selectedStudent.admissionNo}
                      classLabel={selectedStudent.classLabel}
                      amountReceived={visibleActionState.amountReceived ?? paymentAmount}
                      quickDiscountApplied={visibleActionState.quickDiscountApplied ?? quickDiscountAmount}
                      lateFeeWaivedApplied={visibleActionState.lateFeeWaivedApplied ?? quickLateFeeWaiverAmount}
                      paymentDate={visibleActionState.paymentDate ?? paymentDate}
                      paymentModeLabel={postedPaymentModeLabel}
                      referenceNumber={visibleActionState.referenceNumber ?? referenceNumber}
                      receivedBy={visibleActionState.receivedBy ?? receivedBy}
                      remainingBalance={visibleActionState.remainingBalance ?? remainingAfterPayment}
                      creditBalance={creditBalance}
                      refundableAmount={refundableAmount}
                      whatsappMessage={whatsappCopy}
                      whatsappPhone={selectedStudent.fatherPhone ?? selectedStudent.motherPhone ?? null}
                      printReceiptHref={printReceiptHref}
                      visibleReceiptHref={visibleReceiptHref}
                      autoPrint={lastPrintMode === "yes"}
                      onCollectAnother={handleCollectAnotherPayment}
                    />,
                    document.body,
                  )
                : null}

              {mounted && isDuplicateOpen && visibleActionState.status === "duplicate" && visibleActionState.receiptId
                ? createPortal(
                    <DuplicateReceiptSheet
                      open
                      message={visibleActionState.message}
                      receiptId={visibleActionState.receiptId ?? ""}
                      receiptNumber={visibleActionState.receiptNumber}
                      onCollectAnother={handleCollectAnotherPayment}
                    />,
                    document.body,
                  )
                : null}
            </form>
          </SectionCard>
          <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
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
            className="hidden md:block"
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
