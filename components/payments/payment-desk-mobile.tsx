"use client";

import { useActionState, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeRecentTracker, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/loading-skeleton";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Banknote, Building2, FileText, Smartphone } from "lucide-react";
import { PayeeSummaryStrip } from "@/components/payments/payee-summary-strip";
import { DeskTotalsSection } from "@/components/payments/desk-totals-section";
import {
  DesktopPaymentDeskBody,
  DesktopPaymentDeskMainPanel,
  DesktopPaymentDeskSection,
  DesktopPaymentDeskStudentPanel,
  PaymentDeskRoot,
} from "@/components/payments/payment-desk/payment-desk-layout";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useScrollIntoView } from "@/hooks/use-scroll-into-view";
import { buildPaymentAllocation, buildReceiptPreviewAllocation } from "@/lib/payments/allocation";
import { buildPaymentQuickAmounts } from "@/lib/payments/workflow";
import {
  calculateInstallmentBasePending,
  calculateOverdueBaseAmount,
  calculatePendingLateFeeAmount,
} from "@/lib/fees/due-amounts";
import { appendSessionParam } from "@/lib/navigation/session-href";
import {
  buildPaymentConfirmationSummary,
  buildPaymentDeskSearchIndex,
  buildStudentSelectLabel,
  filterPaymentDeskStudents,
  buildPaymentActionStateKey,
  getNextStudentOptionIndex,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  shouldShowPaymentActionState,
  validatePaymentDraft,
} from "@/lib/payments/payment-desk-workflow";
import {
  clearPaymentDeskStudentIndexCache,
  readPaymentDeskStudentIndexCache,
  writePaymentDeskStudentIndexCache,
} from "@/lib/payments/payment-desk-cache";
import {
  clearCachedPaymentDeskStudentSummary,
  loadCachedPaymentDeskStudentSummary,
  saveCachedPaymentDeskStudentSummary,
} from "@/lib/payments/payment-desk-summary-cache";
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
const mobilePresetAmounts = [500, 1000, 2000, 5000, 10000, 20000];
const paymentModeOptions = [
  { value: "cash",          label: "Cash",         Icon: Banknote },
  { value: "upi",           label: "UPI",          Icon: Smartphone },
  { value: "bank_transfer", label: "Bank",         Icon: Building2 },
  { value: "cheque",        label: "Cheque",       Icon: FileText },
];
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

function markPaymentDeskStudentTiming(
  name:
    | "student_click"
    | "summary_fetch_start"
    | "summary_fetch_end"
    | "summary_paint",
) {
  if (typeof performance === "undefined" || !performance.mark) {
    return;
  }

  if (name === "student_click") performance.mark("vpps:payment-desk:student_click");
  if (name === "summary_fetch_start") performance.mark("vpps:payment-desk:summary_fetch_start");
  if (name === "summary_fetch_end") performance.mark("vpps:payment-desk:summary_fetch_end");
  if (name === "summary_paint") performance.mark("vpps:payment-desk:summary_paint");
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

export function PaymentDeskClient({
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
  const [mobileClassPickerOpen, setMobileClassPickerOpen] = useState(false);
  const [studentIndex, setStudentIndex] = useState<PaymentStudentIndexItem[]>(data.studentIndex ?? []);
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
  const [clientRequestId, setClientRequestId] = useState(createClientRequestId);
  const [dismissedActionStateKey, setDismissedActionStateKey] = useState<string | null>(null);
  const [dismissedTodayReceiptId, setDismissedTodayReceiptId] = useState<string | null>(null);
  const [optimisticCollectionAdd, setOptimisticCollectionAdd] = useState(0);
  const [lastAddedAmount, setLastAddedAmount] = useState<number | null>(null);
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
  const optimisticReceiptKeyRef = useRef<string | null>(null);
  const studentIndexLoadedRef = useRef(data.studentIndex.length > 0);
  const prefetchCache = useRef<Map<string, Promise<PaymentDeskStudentSummary | null>>>(new Map());
  const summaryCache = useRef<Map<string, PaymentDeskStudentSummary>>(new Map());
  const cardOnlyCache = useRef<Map<string, PaymentDeskStudentSummary>>(new Map());
  const lastAmountFocusStudentIdRef = useRef<string | null>(null);
  const lastClassRestoreAttemptedRef = useRef(false);
  const mobileClassPickerAutoOpenedRef = useRef(false);
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
  const previewOverdueAmount = calculateOverdueBaseAmount(previewBreakdown);
  const previewNextDue =
    previewBreakdown.find((item) => item.outstandingAmount > 0) ?? null;
  const paymentAmount = Number(paymentAmountInput) || 0;
  const clientPreviewAmount = paymentAmount > 0 ? paymentAmount : null;
  const quickDiscountAmount = Number(quickDiscountInput) || 0;
  const pendingLateFeeAmount = calculatePendingLateFeeAmount(previewBreakdown);
  const quickLateFeeWaiverAmount = waiveFullLateFee ? pendingLateFeeAmount : 0;
  const quickLateFeeWaiverInput = quickLateFeeWaiverAmount > 0 ? String(quickLateFeeWaiverAmount) : "";
  const creditBalance = selectedStudent?.creditBalance ?? 0;
  const refundableAmount = selectedStudent?.refundableAmount ?? 0;
  const creditOrRefundAmount = Math.max(creditBalance, refundableAmount);
  const studentSelectedFromIndex = Boolean(selectedStudentId && selectedStudentIndexItem);
  const showReferenceField = paymentMode !== "cash";
  const referenceInputMode = paymentMode === "cheque" ? "numeric" : "text";

  const buildStudentSummaryCacheKey = useCallback((studentId: string, requestedPaymentDate: string) => {
    return `${data.sessionLabel}:${studentId}:${requestedPaymentDate}`;
  }, [data.sessionLabel]);

  const fetchStudentSummary = useCallback(async (payload: {
    studentId: string;
    requestedPaymentDate: string;
    includeLatestReceipt: boolean;
    includeBreakdown?: boolean;
    signal?: AbortSignal;
  }) => {
    markPaymentDeskStudentTiming("summary_fetch_start");
    const params = new URLSearchParams({
      studentId: payload.studentId,
      paymentDate: payload.requestedPaymentDate,
      includeLatestReceipt: String(payload.includeLatestReceipt),
      session: data.sessionLabel,
    });
    if (payload.includeBreakdown === false) {
      params.set("includeBreakdown", "false");
    }
    const response = await fetch(`/protected/payments/student-summary?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: payload.signal,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error ?? "Unable to refresh payment preview.");
    }

    const summary = await response.json() as PaymentDeskStudentSummary;
    markPaymentDeskStudentTiming("summary_fetch_end");
    return summary;
  }, [data.sessionLabel]);

  const applyStudentSummaryPayload = useCallback((payload: PaymentDeskStudentSummary) => {
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
    requestAnimationFrame(() => markPaymentDeskStudentTiming("summary_paint"));
  }, []);

  // Applies card-only data (no breakdown) while breakdown is still loading.
  const applyStudentCardData = useCallback((payload: PaymentDeskStudentSummary) => {
    setSelectedStudent(payload.student);
    setSelectedStudentIssue(payload.issue);
    setLatestStudentReceipt(payload.latestReceipt);
    setDateAwareBreakdown(null);
    setStudentSummaryLoading(false);
    setStudentSummaryNotice(null);
    setPreviewUnavailable(false);
    setPreviewLoading(true);
    setPreviewNotice("Loading installment breakdown...");
  }, []);

  const rememberFullStudentSummary = useCallback((payload: {
    studentId: string;
    requestedPaymentDate: string;
    summary: PaymentDeskStudentSummary;
  }) => {
    const cacheKey = buildStudentSummaryCacheKey(payload.studentId, payload.requestedPaymentDate);

    summaryCache.current.set(cacheKey, payload.summary);
    cardOnlyCache.current.delete(cacheKey);
    prefetchCache.current.delete(cacheKey);
    void saveCachedPaymentDeskStudentSummary({
      sessionLabel: data.sessionLabel,
      studentId: payload.studentId,
      paymentDate: payload.requestedPaymentDate,
      summary: payload.summary,
    });
  }, [buildStudentSummaryCacheKey, data.sessionLabel]);

  function prefetchStudentSummary(studentId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = buildStudentSummaryCacheKey(studentId, today);

    // Skip if we already have a full summary or a prefetch in flight.
    if (summaryCache.current.has(cacheKey) || prefetchCache.current.has(cacheKey)) {
      return;
    }

    // Fetch card-only (skip the slow installment preview) so hover/focus prefetch is fast.
    const promise = fetchStudentSummary({
      studentId,
      requestedPaymentDate: today,
      includeLatestReceipt: false,
      includeBreakdown: false,
    })
      .then((payload) => {
        // Only store as card-only if we still don't have the full summary.
        if (!summaryCache.current.has(cacheKey)) {
          cardOnlyCache.current.set(cacheKey, payload);
        }
        return payload;
      })
      .catch(() => {
        prefetchCache.current.delete(cacheKey);
        cardOnlyCache.current.delete(cacheKey);
        return null;
      });

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
    let shouldFetch = studentIndex.length === 0;
    let hasStaleCache = false;

    try {
      const cached = readPaymentDeskStudentIndexCache({
        storage: sessionStorage,
        sessionLabel: data.sessionLabel,
      });

      if (cached && cached.students.length > 0) {
        if (studentIndex.length === 0) {
          setStudentIndex(cached.students);
        }
        studentIndexLoadedRef.current = true;

        if (!cached.stale) {
          return;
        }

        hasStaleCache = true;
        shouldFetch = true;
      }
    } catch {
      // Ignore unavailable or malformed cache.
    }

    if (!shouldFetch || (studentIndexLoadedRef.current && !hasStaleCache)) {
      studentIndexLoadedRef.current = studentIndex.length > 0;
      return;
    }

    studentIndexLoadedRef.current = true;

    fetch(`/protected/students/index?purpose=paymentDesk&session=${encodeURIComponent(data.sessionLabel)}`, {
      headers: { accept: "application/json" },
    })
      .then((response) => response.json())
      .then((json: { students?: PaymentStudentIndexItem[] }) => {
        if (!Array.isArray(json.students)) {
          return;
        }

        setStudentIndex(json.students);
        try {
          writePaymentDeskStudentIndexCache({
            storage: sessionStorage,
            sessionLabel: data.sessionLabel,
            students: json.students,
          });
        } catch {
          // Storage may be unavailable or full.
        }
      })
      .catch(() => {
        // The search box remains usable once the next navigation retries.
      });
  }, [data.sessionLabel, studentIndex.length]);

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
    const cachedSummary = summaryCache.current.get(prefetchKey);

    if (cachedSummary) {
      applyStudentSummaryPayload(cachedSummary);
      return () => {
        controller.abort();
      };
    }

    // If we have card-only data from a prefetch, show the student immediately
    // and fetch the full breakdown in a second request.
    const cardCached = cardOnlyCache.current.get(prefetchKey);
    if (cardCached) {
      applyStudentCardData(cardCached);
      fetchStudentSummary({
        studentId: selectedStudentId,
        requestedPaymentDate: paymentDate,
        includeLatestReceipt: true,
        includeBreakdown: true,
        signal: controller.signal,
      })
        .then((payload) => {
          if (requestId !== summaryRequestRef.current) return;
          rememberFullStudentSummary({
            studentId: selectedStudentId,
            requestedPaymentDate: paymentDate,
            summary: payload,
          });
          applyStudentSummaryPayload(payload);
        })
        .catch((error) => {
          if (requestId !== summaryRequestRef.current) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setPreviewLoading(false);
          setPreviewUnavailable(true);
          setPreviewNotice("Unable to load installment breakdown. Ask admin to check Fee Setup.");
        });
      return () => {
        controller.abort();
      };
    }

    setStudentSummaryLoading(true);
    setStudentSummaryNotice("Loading dues...");
    setPreviewNotice("Refreshing pending amount for selected payment date...");
    setPreviewLoading(true);

    // If a card-only prefetch promise is in flight, wait for it then fetch breakdown.
    // Otherwise fetch the full summary directly.
    const cachedSummaryPromise = prefetchCache.current.get(prefetchKey);

    (async () => {
      const persistedSummary = await loadCachedPaymentDeskStudentSummary({
        sessionLabel: data.sessionLabel,
        studentId: selectedStudentId,
        paymentDate,
      }).catch(() => null);

      if (requestId !== summaryRequestRef.current) {
        throw new Error("AbortError");
      }

      if (persistedSummary?.summary) {
        summaryCache.current.set(prefetchKey, persistedSummary.summary);
        applyStudentSummaryPayload(persistedSummary.summary);

        if (!persistedSummary.stale) {
          return persistedSummary.summary;
        }

        setPreviewLoading(true);
        setPreviewNotice("Refreshing pending amount for selected payment date...");
      }

      if (cachedSummaryPromise) {
        const cardPayload = await cachedSummaryPromise;
        const payload = cardPayload;
        const resolvedCardPayload = payload ?? cardOnlyCache.current.get(prefetchKey) ?? null;

        if (requestId !== summaryRequestRef.current) {
          throw new Error("AbortError");
        }
        if (resolvedCardPayload) {
          applyStudentCardData(resolvedCardPayload);
        }
      }

      return fetchStudentSummary({
        studentId: selectedStudentId,
        requestedPaymentDate: paymentDate,
        includeLatestReceipt: true,
        includeBreakdown: true,
        signal: controller.signal,
      });
    })()
      .then((payload) => {
        if (requestId !== summaryRequestRef.current) {
          return;
        }
        if (!payload) {
          throw new Error("Unable to refresh payment preview.");
        }

        summaryCache.current.set(prefetchKey, payload);
        rememberFullStudentSummary({
          studentId: selectedStudentId,
          requestedPaymentDate: paymentDate,
          summary: payload,
        });
        applyStudentSummaryPayload(payload);
      })
      .catch((error) => {
        if (requestId !== summaryRequestRef.current) {
          return;
        }
        if (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError")) {
          return;
        }

        setDateAwareBreakdown(null);
        prefetchCache.current.delete(prefetchKey);
        setStudentSummaryLoading(false);
        setStudentSummaryNotice("Unable to load dues. Ask admin to check Fee Setup.");
        setPreviewUnavailable(true);
        setPreviewLoading(false);
        setPreviewNotice("Unable to load dues. Ask admin to check Fee Setup.");
      });

    return () => {
      controller.abort();
    };
  }, [applyStudentCardData, applyStudentSummaryPayload, buildStudentSummaryCacheKey, data.sessionLabel, fetchStudentSummary, paymentDate, rememberFullStudentSummary, selectedStudentId]);

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
  function getQuickAmountChipVariant(quickAmount: (typeof quickAmounts)[number]) {
    if (quickAmount.key === "full") return "accent";
    if (quickAmount.key === "next") return "soft";
    if (quickAmount.key === "clear") return "ghost";
    return "outline";
  }

  function getQuickAmountChipLabel(quickAmount: (typeof quickAmounts)[number]) {
    if (quickAmount.key === "full") {
      return quickAmount.disabled || quickAmount.amount === null
        ? "Full Due"
        : `Full Due ${formatInr(quickAmount.amount)}`;
    }

    if (quickAmount.key === "next") {
      return quickAmount.disabled || quickAmount.amount === null
        ? "Next"
        : `Next ${formatInr(quickAmount.amount)}`;
    }

    if (quickAmount.key === "overdue") return "Overdue";
    if (quickAmount.key === "lateFee") return "Late Fee";
    if (quickAmount.key === "lastAmount") return "Last";
    return "Clear x";
  }

  function getQuickAmountChipClassName(quickAmount: (typeof quickAmounts)[number]) {
    return cn(
      "shrink-0 disabled:cursor-not-allowed disabled:opacity-40",
      quickAmount.key === "overdue" && (quickAmount.amount ?? 0) > 0 ? "text-destructive" : "",
    );
  }

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
    ? appendSessionParam(`/protected/receipts/${visibleActionState.receiptId}`, data.sessionLabel)
    : null;
  const printReceiptHref = visibleActionState.receiptId
    ? appendSessionParam(`/protected/receipts/${visibleActionState.receiptId}?print=1`, data.sessionLabel)
    : null;
  const selectedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === paymentMode)?.label ?? paymentMode;
  const todayDateString = new Date().toISOString().slice(0, 10);
  const paymentDateIsBackdated = paymentDate !== todayDateString;
  const postedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === visibleActionState.paymentMode)?.label ??
    visibleActionState.paymentMode ??
    selectedPaymentModeLabel;
  const paymentSessionLabel = data.sessionLabel || "Active session";
  const withSession = (href: string) => appendSessionParam(href, data.sessionLabel);
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
            href={withSession(`/protected/receipts/${latestReceiptToday.id}`)}
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
      if (actionStateKey !== optimisticReceiptKeyRef.current) {
        optimisticReceiptKeyRef.current = actionStateKey;
        if (state.amountReceived && state.amountReceived > 0) {
          setOptimisticCollectionAdd((prev) => prev + state.amountReceived!);
          setLastAddedAmount(state.amountReceived);
        }
      }
      if (state.studentId) {
        void clearDraft({
          sessionLabel: paymentSessionLabel,
          studentId: state.studentId,
          paymentDate: state.paymentDate ?? paymentDate,
        });
        const postedCacheKey = buildStudentSummaryCacheKey(state.studentId, state.paymentDate ?? paymentDate);
        summaryCache.current.delete(postedCacheKey);
        cardOnlyCache.current.delete(postedCacheKey);
        void clearCachedPaymentDeskStudentSummary({
          sessionLabel: paymentSessionLabel,
          studentId: state.studentId,
          paymentDate: state.paymentDate ?? paymentDate,
        });
      }
      try {
        clearPaymentDeskStudentIndexCache({
          storage: sessionStorage,
          sessionLabel: paymentSessionLabel,
        });
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
  }, [actionStateKey, buildStudentSummaryCacheKey, paymentDate, paymentSessionLabel, state]);

  useEffect(() => {
    if (lastAddedAmount === null) {
      return;
    }

    const timer = window.setTimeout(() => setLastAddedAmount(null), 1500);
    return () => window.clearTimeout(timer);
  }, [lastAddedAmount]);

  useEffect(() => {
    if (lastClassRestoreAttemptedRef.current) {
      return;
    }
    lastClassRestoreAttemptedRef.current = true;

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

    if (previewLoading) {
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
  }, [amountInputRef, isMobileView, previewLoading, scrollAmountInputIntoView, selectedStudent, studentSummaryLoading]);

  useEffect(() => {
    if (!isMobileView || selectedStudentId || selectedClassId || mobileClassPickerAutoOpenedRef.current) {
      return;
    }

    const storedClassId = window.localStorage.getItem(paymentDeskLastClassStorageKey);
    if (storedClassId && classOptions.some((classOption) => classOption.id === storedClassId)) {
      return;
    }

    mobileClassPickerAutoOpenedRef.current = true;
    setMobileClassPickerOpen(true);
  }, [classOptions, isMobileView, selectedClassId, selectedStudentId]);

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
    summaryAbortRef.current?.abort();
    summaryRequestRef.current += 1;
    setSelectedStudentId("");
    setSelectedStudent(null);
    setSelectedStudentIssue(null);
    setLatestStudentReceipt(null);
    setDateAwareBreakdown(null);
    setStudentSummaryLoading(false);
    setStudentSummaryNotice(null);
    setPreviewLoading(false);
    setPreviewNotice(null);
    setPreviewUnavailable(false);
    setPaymentAmountInput("");
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
    setFormError(null);
    setDismissedTodayReceiptId(null);
    lastAmountFocusStudentIdRef.current = null;
  }

  function handleClassChange(nextClassId: string, mode: "mobile" | "desktop") {
    setActiveStudentPickerMode(mode);
    setSelectedClassId(nextClassId);
    setStudentSearchQuery("");
    setStudentListScrollTop(0);
    setIsStudentPickerOpen(true);
    setActiveStudentOptionIndex(0);
    focusStudentSearch(mode);

    if (
      nextClassId &&
      selectedStudentId &&
      studentIndex.some(
        (student) => student.id === selectedStudentId && student.classId !== nextClassId,
      )
    ) {
      clearSelectedStudent();
    }
  }

  function selectMobileClass(nextClassId: string) {
    handleClassChange(nextClassId, "mobile");
    setMobileClassPickerOpen(false);
    window.setTimeout(() => {
      setIsStudentPickerOpen(true);
      focusStudentSearch("mobile");
    }, 120);
  }

  function selectStudent(studentId: string) {
    markPaymentDeskStudentTiming("student_click");
    summaryAbortRef.current?.abort();
    summaryRequestRef.current += 1;
    const cacheKey = buildStudentSummaryCacheKey(studentId, paymentDate);
    const cachedSummary = summaryCache.current.get(cacheKey);

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
    if (cachedSummary) {
      applyStudentSummaryPayload(cachedSummary);
    } else {
      const cardCached = cardOnlyCache.current.get(cacheKey);
      if (cardCached) {
        // Show student info immediately; the useEffect will fetch the breakdown.
        applyStudentCardData(cardCached);
      } else {
        setSelectedStudent(null);
        setSelectedStudentIssue(null);
        setLatestStudentReceipt(null);
        setDateAwareBreakdown(null);
        setStudentSummaryLoading(true);
        setStudentSummaryNotice("Loading dues...");
        setPreviewUnavailable(false);
        setPreviewLoading(true);
        setPreviewNotice("Refreshing pending amount for selected payment date...");
      }
    }

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
    <PaymentDeskRoot>
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
          <div data-mobile-class-picker-sheet>
            <Label>Class</Label>
            <button
              type="button"
              className="mt-2 flex h-12 w-full items-center justify-between rounded-xl border border-border bg-card px-3 text-left text-sm font-semibold text-foreground"
              onClick={() => setMobileClassPickerOpen(true)}
            >
              <span>
                {classOptions.find((classOption) => classOption.id === selectedClassId)?.label ?? "Select class"}
              </span>
              <span className="text-xs font-medium text-muted-foreground">Change</span>
            </button>
            {selectedClassId ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-muted-foreground underline underline-offset-2"
                onClick={() => {
                  handleClassChange("", "mobile");
                  setMobileClassPickerOpen(true);
                }}
              >
                Clear class
              </button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Student list stays ready for the selected class and remains in alphabetical order with SR no.
          </p>
        </div>
      </SectionCard>
      <Sheet
        open={mobileClassPickerOpen}
        onClose={() => setMobileClassPickerOpen(false)}
        title="Select class"
        description="Choose a class first to show only relevant students."
        size="lg"
      >
        <div className="grid gap-2">
          {classOptions.map((classOption) => {
            const selected = classOption.id === selectedClassId;

            return (
              <button
                key={classOption.id}
                type="button"
                className={cn(
                  "flex min-h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold",
                  selected
                    ? "border-accent bg-accent-soft text-accent-soft-foreground"
                    : "border-border bg-card text-foreground hover:bg-surface-2",
                )}
                onClick={() => selectMobileClass(classOption.id)}
              >
                <span>{classOption.label}</span>
                {selected ? <span className="text-xs">Selected</span> : null}
              </button>
            );
          })}
        </div>
      </Sheet>
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
                  aria-haspopup="listbox"
                  aria-expanded={isStudentPickerOpen}
                  aria-controls={mobileStudentListId}
                  aria-activedescendant={
                    activeStudentOptionIndex >= 0
                      ? `${mobileStudentListId}-option-${activeStudentOptionIndex}`
                      : undefined
                  }
                  aria-autocomplete="list"
                  placeholder="Select student"
                  autoFocus
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
                        getNextStudentOptionIndex({
                          currentIndex: index,
                          resultCount: filteredStudents.length,
                          key: "ArrowDown",
                        }),
                      );
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setIsStudentPickerOpen(true);
                      setActiveStudentOptionIndex((index) =>
                        getNextStudentOptionIndex({
                          currentIndex: index,
                          resultCount: filteredStudents.length,
                          key: "ArrowUp",
                        }),
                      );
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
                    className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg scroll-smooth momentum-scroll"
                    style={{ height: `${studentComboboxPanelHeight}px` }}
                    onScroll={(event) => setStudentListScrollTop(event.currentTarget.scrollTop)}
                  >
                    {!studentSearchQuery && recentStudents.length > 0 ? (
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
                        <div className="flex flex-wrap gap-1.5">
                          {recentStudents.slice(0, 3).map((student) => (
                            <button
                              key={`recent-${student.id}`}
                              type="button"
                              onClick={() => selectStudent(student.id)}
                              className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-foreground border border-border hover:bg-surface-3 transition-colors"
                            >
                              {student.fullName}
                            </button>
                          ))}
                        </div>
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
            <div className="flex items-center justify-between gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
              <span>
                Selected:{" "}
                <span className="font-semibold">
                  {selectedStudent?.fullName ?? selectedStudentIndexItem.fullName}
                </span>{" "}
                · {selectedStudent?.classLabel ?? selectedStudentIndexItem.classLabel} · SR No{" "}
                {selectedStudent?.admissionNo ?? selectedStudentIndexItem.admissionNo}
              </span>
              <button
                type="button"
                aria-label="Change student"
                className="shrink-0 text-xs font-medium text-info-soft-foreground underline underline-offset-2"
                onClick={() => {
                  clearSelectedStudent();
                  setStudentSearchQuery("");
                  setIsStudentPickerOpen(true);
                  setActiveStudentOptionIndex(0);
                  mobileStudentSearchInputRef.current?.focus({ preventScroll: false });
                  studentSearchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Change x
              </button>
            </div>
          ) : null}
        </div>
      </SectionCard>
      </div>


      <DesktopPaymentDeskSection>
        {/* Top bar */}
        <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Payment Desk</span>
            <span className="text-xs text-muted-foreground">{paymentSessionLabel}</span>
            {paymentDateIsBackdated ? (
              <span className="rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                Backdated · {paymentDate}
              </span>
            ) : null}
            {selectedStudentId && !isLockedAfterSuccess ? (
              <span className="text-[10px] text-muted-foreground">
                F1 Cash · F2 UPI · F3 Bank · F4 Cheque · ↵ Review
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
              <div className="flex items-center justify-end gap-1.5">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatInr((data.todayCollection?.totalAmount ?? 0) + optimisticCollectionAdd)}
                </p>
                {lastAddedAmount !== null ? (
                  <span className="anim-fade-in text-[11px] font-medium text-success-soft-foreground">
                    +{formatInr(lastAddedAmount)}
                  </span>
                ) : null}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{defaultReceivedBy}</span>
          </div>
        </div>

        {/* Two-panel body */}
        <DesktopPaymentDeskBody>
          {/* LEFT PANEL — Student picker */}
          <DesktopPaymentDeskStudentPanel>
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
                aria-haspopup="listbox"
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
                      getNextStudentOptionIndex({
                        currentIndex: index,
                        resultCount: filteredStudents.length,
                        key: "ArrowDown",
                      }),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveStudentOptionIndex((index) =>
                      getNextStudentOptionIndex({
                        currentIndex: index,
                        resultCount: filteredStudents.length,
                        key: "ArrowUp",
                      }),
                    );
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
          </DesktopPaymentDeskStudentPanel>

          {/* RIGHT PANEL — Payment form */}
          <DesktopPaymentDeskMainPanel>
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

            {selectedStudentIndexItem && studentSummaryLoading && !selectedStudent ? (
              <div
                className="rounded-xl border border-border bg-card px-4 py-4"
                aria-live="polite"
                aria-busy={studentSummaryLoading}
              >
                <p className="text-sm font-semibold text-foreground">
                  Loading dues for {selectedStudentIndexItem.fullName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedStudentIndexItem.classLabel} · SR {selectedStudentIndexItem.admissionNo}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                </div>
              </div>
            ) : selectedStudent ? (
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
                      if (!selectedStudentId || isLockedAfterSuccess) {
                        return;
                      }

                      if (event.key === "F1") {
                        event.preventDefault();
                        setPaymentMode("cash");
                        setFormError(null);
                      } else if (event.key === "F2") {
                        event.preventDefault();
                        setPaymentMode("upi");
                        setFormError(null);
                      } else if (event.key === "F3") {
                        event.preventDefault();
                        setPaymentMode("bank_transfer");
                        setFormError(null);
                      } else if (event.key === "F4") {
                        event.preventDefault();
                        setPaymentMode("cheque");
                        setFormError(null);
                      } else if (event.key === "Enter") {
                        if (!draftValidation.ok) {
                          setFormError(draftValidation.message);
                          return;
                        }

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
                  {quickAmounts.map((qa) => (
                      <Button
                        key={qa.key}
                        type="button"
                        size="sm"
                        variant={qa.key === "full" ? "accent" : getQuickAmountChipVariant(qa)}
                        disabled={qa.disabled}
                        className={getQuickAmountChipClassName(qa)}
                        onClick={() => {
                          setFormError(null);
                          setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
                        }}
                      >
                        {getQuickAmountChipLabel(qa)}
                      </Button>
                    ))}
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
                {!selectedStudentId && paymentMode !== "cash" ? (
                  <p className="mt-1 px-3 text-[11px] text-muted-foreground">
                    Mode kept from last payment:{" "}
                    <span className="font-medium">{selectedPaymentModeLabel}</span> - change if needed.
                  </p>
                ) : null}

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
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      Date
                      {paymentDateIsBackdated ? (
                        <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                          BACKDATED
                        </span>
                      ) : null}
                    </label>
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
                        <Link className="text-accent underline-offset-4 hover:underline" href={withSession(`/protected/receipts/${latestPayment.id}`)}>
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
          </DesktopPaymentDeskMainPanel>
        </DesktopPaymentDeskBody>
      </DesktopPaymentDeskSection>

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
              description={selectedStudentIssue.detail}
            >
              <div className="flex flex-wrap items-center gap-2">
                {selectedStudentIssue.repairStudentId && selectedStudentIssue.actionLabel && canPost ? (
                  <form action={repairPaymentDeskStudentDuesAction}>
                    <input type="hidden" name="studentId" value={selectedStudentIssue.repairStudentId} />
                    <input type="hidden" name="sessionLabel" value={data.sessionLabel} />
                    <Button type="submit">{selectedStudentIssue.actionLabel}</Button>
                  </form>
                ) : selectedStudentIssue.actionHref && selectedStudentIssue.actionLabel ? (
                  <Button asChild>
                    <Link href={selectedStudentIssue.actionHref}>{selectedStudentIssue.actionLabel}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link href={withSession("/protected/students")}>Open Students</Link>
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
                <input type="hidden" name="sessionLabel" value={data.sessionLabel} />
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
                          variant={quickAmount.key === "full" ? "accent" : getQuickAmountChipVariant(quickAmount)}
                          className={cn("h-8 px-2 text-xs", getQuickAmountChipClassName(quickAmount))}
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
                          {getQuickAmountChipLabel(quickAmount)}
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
                  <div className="overflow-hidden rounded-xl border border-border bg-card" data-payment-amount-section>
                    <div className="border-b border-border bg-surface-2 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{selectedStudent.fullName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            SR {selectedStudent.admissionNo} - {selectedStudent.classLabel}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
                          <p className="text-base font-bold tabular-nums text-accent">{formatInr(previewTotalPending)}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-border bg-card px-2 py-2">
                          <p className="text-muted-foreground">Overdue</p>
                          <p className="font-semibold text-destructive">{formatInr(previewOverdueAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-2 py-2">
                          <p className="text-muted-foreground">Next due</p>
                          <p className="font-semibold text-foreground">
                            {previewNextDue
                              ? `${previewNextDue.installmentLabel} ${formatInr(previewNextDue.outstandingAmount)}`
                              : "None"}
                          </p>
                        </div>
                      </div>
                      {creditOrRefundAmount > 0 ? (
                        <p className="mt-2 rounded-lg border border-info/30 bg-info-soft px-2 py-2 text-xs font-medium text-info-soft-foreground">
                          Credit/refund warning: {formatInr(creditOrRefundAmount)} is already available for this student.
                        </p>
                      ) : null}
                    </div>
                    {/* Amount row */}
                    <div className="flex items-center border-b border-border">
                      <span className="border-r border-border px-3 py-3 text-xl font-medium text-muted-foreground">₹</span>
                      <input
                        ref={amountInputRef}
                        aria-label="Mobile amount received"
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="done"
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        placeholder="₹ 0"
                        className="h-14 flex-1 bg-transparent px-3 text-xl font-semibold text-center tracking-tight outline-none placeholder:text-muted-foreground/50"
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

                    {/* Preset chips — 2 rows × 3 chips on mobile */}
                    <div className="grid grid-cols-3 gap-2 p-3 border-b border-border">
                      {[500, 1000, 2000, 5000, 10000, 20000].map(amount => (
                        <button key={amount}
                          type="button"
                          onClick={() => {
                            setPaymentAmountInput(amount.toString());
                            setFormError(null);
                          }}
                          className="rounded-xl border border-border bg-surface-2 py-3 text-sm font-semibold text-foreground hover:bg-surface-3 active:scale-95 transition-all"
                        >
                          ₹{(amount/1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k
                        </button>
                      ))}
                    </div>

                    {/* Quick amount chips */}
                    <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
                      {quickAmounts.map((qa) => (
                          <Button
                            key={`mobile-chip-${qa.key}`}
                            type="button"
                            size="sm"
                            variant={qa.key === "clear" ? "ghost" : qa.key === "full" ? "accent" : getQuickAmountChipVariant(qa)}
                            disabled={qa.disabled}
                            className={getQuickAmountChipClassName(qa)}
                            onClick={() => {
                              setFormError(null);
                              setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
                            }}
                          >
                            {getQuickAmountChipLabel(qa)}
                          </Button>
                        ))}
                      {pendingLateFeeAmount > 0 ? (
                        <button
                          type="button"
                          className={cn(
                            "hidden shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
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

                    <div
                      data-mobile-late-fee-waiver
                      className={cn(
                        "border-b border-border px-3 py-3",
                        pendingLateFeeAmount > 0 ? "bg-info-soft/40" : "bg-surface-2",
                      )}
                    >
                      <label
                        className={cn(
                          "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2",
                          pendingLateFeeAmount > 0
                            ? "cursor-pointer border-info/30 bg-card text-info-soft-foreground"
                            : "cursor-not-allowed border-border bg-card text-muted-foreground",
                        )}
                      >
                        <span>
                          <span className="block text-sm font-semibold">Waive full late fee</span>
                          <span className="block text-xs">
                            {pendingLateFeeAmount > 0
                              ? `${formatInr(pendingLateFeeAmount)} pending late fee`
                              : "No late fee pending"}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          className="size-5 rounded border-border-strong"
                          checked={waiveFullLateFee}
                          disabled={pendingLateFeeAmount <= 0}
                          onChange={(event) => {
                            setWaiveFullLateFee(event.target.checked);
                            setFormError(null);
                          }}
                        />
                      </label>
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

                    {/* On mobile: icon chip grid */}
                    <div aria-label="Mobile payment mode" className="grid grid-cols-4 gap-2 px-3 py-3 border-b border-border md:hidden">
                      {paymentModeOptions.map(({ value, label, Icon }) => (
                        <button key={value} type="button"
                          onClick={() => {
                            setPaymentMode(value as typeof paymentMode);
                            setFormError(null);
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all",
                            paymentMode === value
                              ? "border-accent bg-accent/8 text-accent"
                              : "border-border bg-surface-2 text-muted-foreground hover:bg-surface-3"
                          )}
                        >
                          <Icon className="size-5" />
                          <span className="text-[10px] font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                    {!selectedStudentId && paymentMode !== "cash" ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Mode kept from last payment:{" "}
                        <span className="font-medium">{selectedPaymentModeLabel}</span> - change if needed.
                      </p>
                    ) : null}

                    {/* Reference - non-cash only */}
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

                    <div className="border-b border-border px-3 py-2.5">
                      <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                        Payment date
                        {paymentDateIsBackdated ? (
                          <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
                            BACKDATED
                          </span>
                        ) : null}
                      </label>
                      <Input
                        type="date"
                        value={paymentDate}
                        onChange={(event) => {
                          setPaymentDate(event.target.value);
                          setFormError(null);
                        }}
                        className="h-10"
                      />
                    </div>

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

                  {/* Fixed bottom CTA on mobile (sticky bottom-0 reference for test suite) */}
                  <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pb-safe-bottom pt-3 backdrop-blur md:relative md:inset-auto md:z-auto md:border-0 md:bg-transparent md:pb-0 md:pt-0 mobile-bottom-nav-clearance mobile-safe-bottom-padding">
                    <Button type="submit" variant="accent" size="lg"
                      className="h-14 w-full rounded-xl text-base font-semibold"
                      disabled={pending || !draftValidation.ok || confirmDisabled}
                    >
                      {pending ? "Posting..." : "Confirm & Save Receipt"}
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
                  hint="Past-due installment balance, late fee separate"
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
                  {item.balanceStatus === "overdue" ? (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      Overdue without late fee: {formatInr(calculateInstallmentBasePending(item))}
                    </p>
                  ) : null}
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
                        {item.balanceStatus === "overdue" ? (
                          <div className="text-[11px] font-normal text-destructive">
                            Overdue without late fee: {formatInr(calculateInstallmentBasePending(item))}
                          </div>
                        ) : null}
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

      <DeskTotalsSection data={data} latestPayment={latestPayment} sessionLabel={data.sessionLabel} />
    </PaymentDeskRoot>
  );
}

export const PaymentDeskMobile = PaymentDeskClient;
