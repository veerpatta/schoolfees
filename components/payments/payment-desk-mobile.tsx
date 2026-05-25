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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { pushOptimisticPayment } from "@/lib/dashboard/optimistic-counters";
import { AlertTriangle, Banknote, Building2, CheckCircle2, CircleAlert, FileText, Smartphone } from "lucide-react";
import { PayeeSummaryStrip } from "@/components/payments/payee-summary-strip";
import { DeskTotalsSection } from "@/components/payments/desk-totals-section";
import { MobilePaymentFlowSheet } from "@/components/payments/mobile-payment-flow-sheet";
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
import { normalizeAmountInputShorthand, sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";

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
const paymentDeskRecentStudentsStorageKey = "vpps_recent_students";
const paymentDeskClassStreakStorageKey = "vpps.paymentDesk.classStreak";
const CASH_FAST_POST_THRESHOLD = 15000;
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

function triggerHaptic(pattern: VibratePattern) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Haptics are best-effort only.
  }
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
  const Icon =
    state.status === "error"
      ? AlertTriangle
      : state.status === "duplicate"
        ? CircleAlert
        : CheckCircle2;

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
      <p className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{state.message}</span>
      </p>
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

type ClassStreak = { classId: string; count: number };

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
  const [mobileSheetView, setMobileSheetView] = useState<"class-picker" | "student-picker" | "payment-entry" | null>(null);
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
  const referenceNumber = "";
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
  const [optimisticReceiptAdd, setOptimisticReceiptAdd] = useState(0);
  const [lastAddedAmount, setLastAddedAmount] = useState<number | null>(null);
  const [lastPostedAmount, setLastPostedAmount] = useState<number | null>(null);
  const [isLastAmountArmed, setIsLastAmountArmed] = useState(false);
  const fastPostRequestedRef = useRef(false);
  const isMobileView = useMediaQuery("(max-width: 767px)");
  const { ref: amountInputRef } = useScrollIntoView<HTMLInputElement>();

  const submittingRef = useRef(false);
  const amountSectionRef = useRef<HTMLDivElement>(null);
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
  const getFrecencyScore = useCallback(
    (studentId: string) => {
      const recentIdx = recentStudentIds.indexOf(studentId);
      return recentIdx === -1 ? 0 : 5 - recentIdx;
    },
    [recentStudentIds],
  );
  const filteredStudents = useMemo(
    () => {
      const filtered = filterPaymentDeskStudents({
        students: studentIndex,
        searchIndex: studentSearchIndex,
        selectedClassId,
        query: deferredStudentSearchQuery,
      });

      return filtered.slice().sort((left, right) => {
        const leftScore = getFrecencyScore(left.id);
        const rightScore = getFrecencyScore(right.id);

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return 0;
      });
    },
    [studentIndex, deferredStudentSearchQuery, selectedClassId, studentSearchIndex, getFrecencyScore],
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
  const todayCollectionAmount = (data.todayCollection?.totalAmount ?? 0) + optimisticCollectionAdd;
  const todayReceiptCount = (data.todayCollection?.receiptCount ?? 0) + optimisticReceiptAdd;


  const buildStudentSummaryCacheKey = useCallback((studentId: string, requestedPaymentDate: string) => {
    return `${data.sessionLabel}:${studentId}:${requestedPaymentDate}`;
  }, [data.sessionLabel]);

  function getStudentPendingAmount(studentId: string): number | null {
    const today = new Date().toISOString().slice(0, 10);
    const key = buildStudentSummaryCacheKey(studentId, today);
    const cached = summaryCache.current.get(key) ?? cardOnlyCache.current.get(key);
    return cached?.student?.totalPending ?? null;
  }

  function getClassStats(classId: string): { total: number; pendingCount: number; pendingTotal: number | null } {
    const classStudents = studentIndex.filter((s) => s.classId === classId);
    const total = classStudents.length;
    let pendingCount = 0;
    let pendingTotal: number | null = null;
    let allKnown = classStudents.length > 0;

    for (const s of classStudents) {
      const amt = getStudentPendingAmount(s.id);
      if (amt === null) {
        allKnown = false;
        continue;
      }
      if (amt > 0) {
        pendingCount++;
        pendingTotal = (pendingTotal ?? 0) + amt;
      }
    }

    return { total, pendingCount, pendingTotal: allKnown ? (pendingTotal ?? 0) : null };
  }

  function recordClassUsed(classId: string) {
    try {
      const raw = window.localStorage.getItem(paymentDeskClassStreakStorageKey);
      const streak: ClassStreak = raw ? JSON.parse(raw) : { classId: "", count: 0 };
      const next: ClassStreak = streak.classId === classId
        ? { classId, count: streak.count + 1 }
        : { classId, count: 1 };
      window.localStorage.setItem(paymentDeskClassStreakStorageKey, JSON.stringify(next));
    } catch { /* ignore */ }
  }

  function getClassStreak(): ClassStreak | null {
    try {
      const raw = window.localStorage.getItem(paymentDeskClassStreakStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }


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

  function prefetchStudentSummary(studentId: string, full = false) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = buildStudentSummaryCacheKey(studentId, today);

    if (summaryCache.current.has(cacheKey)) return; // already have full data
    if (!full && prefetchCache.current.has(cacheKey)) return; // card-only prefetch in flight

    const promise = fetchStudentSummary({
      studentId,
      requestedPaymentDate: today,
      includeLatestReceipt: full,
      includeBreakdown: full,
    })
      .then((payload) => {
        if (full) {
          summaryCache.current.set(cacheKey, payload);
          cardOnlyCache.current.delete(cacheKey);
        } else if (!summaryCache.current.has(cacheKey)) {
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
  const primaryQuickAmounts = quickAmounts
    .filter((quickAmount) => quickAmount.key !== "lastAmount" && quickAmount.key !== "clear")
    .slice(0, 3);
  const primaryQuickAmountKeys: string[] = primaryQuickAmounts.map((quickAmount) => quickAmount.key);
  const secondaryQuickAmounts = quickAmounts.filter(
    (quickAmount) => !primaryQuickAmountKeys.includes(quickAmount.key),
  );
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

  function getDesktopModeActiveClass(mode: string) {
    if (mode === "cash") return "bg-success-soft text-success-soft-foreground border-success-soft-foreground/20";
    if (mode === "upi") return "bg-info-soft text-info-soft-foreground border-info-soft-foreground/20";
    if (mode === "bank_transfer") return "bg-accent/10 text-accent border-accent/20";
    if (mode === "cheque") return "bg-warning-soft text-warning-soft-foreground border-warning-soft-foreground/20";
    return "bg-accent-soft text-accent border-accent/20";
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
    currentClientRequestId: clientRequestId,
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
      if (!shouldShowPaymentActionState({
        state,
        dismissedActionStateKey,
        currentClientRequestId: clientRequestId,
      })) {
        return;
      }
      if (actionStateKey !== optimisticReceiptKeyRef.current) {
        optimisticReceiptKeyRef.current = actionStateKey;
        if (state.amountReceived && state.amountReceived > 0) {
          setOptimisticCollectionAdd((prev) => prev + state.amountReceived!);
          setOptimisticReceiptAdd((prev) => prev + 1);
          setLastAddedAmount(state.amountReceived);
          setLastPostedAmount(state.amountReceived);
          pushOptimisticPayment({
            amount: state.amountReceived,
            receiptNumber: state.receiptNumber ?? null,
          });
        }
      }
      triggerHaptic([50, 30, 80]);
      if (state.receiptNumber && state.amountReceived && selectedStudent && printReceiptHref) {
        toast({
          title: `Receipt ${state.receiptNumber} posted`,
          description: `${formatInr(state.amountReceived)} for ${selectedStudent.fullName}`,
          action: (
            <Button asChild size="sm" variant="outline">
              <Link href={printReceiptHref} target="_blank" rel="noreferrer">
                Print
              </Link>
            </Button>
          ),
        });
      }
      if (state.studentId) {
        rememberRecentStudent(state.studentId);
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
      if (!shouldShowPaymentActionState({
        state,
        dismissedActionStateKey,
        currentClientRequestId: clientRequestId,
      })) {
        return;
      }
      setDismissedActionStateKey(null);
      setIsConfirmOpen(false);
      setIsSuccessOpen(false);
      setIsDuplicateOpen(true);
      triggerHaptic([20, 40, 20, 40, 20]);
      setFormError(null);
      return;
    }

    if (state.status === "error") {
      if (!shouldShowPaymentActionState({
        state,
        dismissedActionStateKey,
        currentClientRequestId: clientRequestId,
      })) {
        return;
      }
      setDismissedActionStateKey(null);
      setIsConfirmOpen(false);
      setFormError(state.message);
      triggerHaptic([40, 60, 40]);
    }
  }, [
    actionStateKey,
    buildStudentSummaryCacheKey,
    printReceiptHref,
    paymentDate,
    paymentSessionLabel,
    selectedStudent,
    state,
    clientRequestId,
    dismissedActionStateKey,
  ]);

  useEffect(() => {
    if (lastAddedAmount === null) {
      return;
    }

    const timer = window.setTimeout(() => setLastAddedAmount(null), 1500);
    return () => window.clearTimeout(timer);
  }, [lastAddedAmount]);

  useEffect(() => {
    if (isMobileView) return;
    if (lastClassRestoreAttemptedRef.current) return;
    lastClassRestoreAttemptedRef.current = true;
    if (data.initialClassId || selectedClassId) return;

    const storedClassId = window.localStorage.getItem(paymentDeskLastClassStorageKey);
    if (!storedClassId || !classOptions.some((c) => c.id === storedClassId)) return;

    setSelectedClassId(storedClassId);
    setMobileSheetView("student-picker");
  }, [classOptions, data.initialClassId, isMobileView, selectedClassId]);

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
    try {
      window.localStorage.setItem(paymentDeskRecentStudentsStorageKey, JSON.stringify(recentStudentIds.slice(0, 5)));
    } catch {
      // Storage may be unavailable.
    }
  }, [recentStudentIds]);

  function rememberRecentStudent(studentId: string) {
    setRecentStudentIds((prev) => [studentId, ...prev.filter((id) => id !== studentId)].slice(0, 5));
  }

  function getPrimaryQuickAmountClassName(quickAmount: (typeof quickAmounts)[number]) {
    if (quickAmount.key === "overdue") {
      return "h-9 border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15";
    }

    if (quickAmount.key === "next") {
      return "h-9 border-accent/20 bg-accent/10 text-accent hover:bg-accent/15";
    }

    if (quickAmount.key === "full") {
      return "h-9 border-success-soft-foreground/20 bg-success-soft text-success-soft-foreground hover:bg-success-soft/80";
    }

    return "h-9";
  }

  function onAmountInputBlur() {
    setPaymentAmountInput(normalizeAmountInputShorthand(paymentAmountInput));
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideDesktopPicker = desktopStudentPickerRef.current?.contains(target);

      if (!isInsideDesktopPicker) {
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
    if (!isMobileView || selectedStudentId || selectedClassId || mobileClassPickerAutoOpenedRef.current) {
      return;
    }

    const streak = getClassStreak();
    if (
      streak &&
      streak.count >= 3 &&
      classOptions.some((c) => c.id === streak.classId)
    ) {
      mobileClassPickerAutoOpenedRef.current = true;
      setSelectedClassId(streak.classId);
      setMobileSheetView("student-picker");
      return;
    }

    mobileClassPickerAutoOpenedRef.current = true;
    setMobileSheetView("class-picker");
  }, [classOptions, isMobileView, selectedClassId, selectedStudentId]);

  // When mobile lands on Payment Desk with a pre-selected student (e.g. coming
  // from a Collect button on the students list), jump straight to the payment
  // entry sheet instead of leaving the user staring at the desk totals.
  useEffect(() => {
    if (!isMobileView) return;
    if (!selectedStudentId) return;
    if (mobileSheetView !== null) return;
    if (mobileClassPickerAutoOpenedRef.current) return;
    mobileClassPickerAutoOpenedRef.current = true;
    setMobileSheetView("payment-entry");
  }, [isMobileView, selectedStudentId, mobileSheetView]);

  useEffect(() => {
    if (isConfirmOpen && isMobileView) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [isConfirmOpen, isMobileView]);



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
    });

    return () => {
      cancelled = true;
    };
  }, [paymentDate, paymentSessionLabel, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId || isLockedAfterSuccess) {
      return;
    }

    const flushDraft = () => {
      saveDraft({
        sessionLabel: paymentSessionLabel,
        studentId: selectedStudentId,
        paymentDate,
        draft: {
          amountInput: paymentAmountInput,
          paymentMode,
          referenceNumber: "",
        },
      });
    };

    const timer = window.setTimeout(() => {
      flushDraft();
    }, 350);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    window.addEventListener("beforeunload", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeunload", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    isLockedAfterSuccess,
    paymentAmountInput,
    paymentDate,
    paymentMode,
    paymentSessionLabel,
    selectedStudentId,
  ]);

  function focusStudentSearch(mode: "mobile" | "desktop") {
    requestAnimationFrame(() => {
      const studentList =
        mode === "desktop" ? desktopStudentListRef.current : mobileStudentListRef.current;
      studentList?.scrollTo({ top: 0 });
      if (mode === "desktop") {
        desktopStudentSearchInputRef.current?.focus({ preventScroll: false });
      }
    });
  }

  function clearSelectedStudent() {
    summaryAbortRef.current?.abort();
    summaryRequestRef.current += 1;
    const url = new URL(window.location.href);
    url.searchParams.delete("studentId");
    url.searchParams.delete("repairNotice");
    if (selectedClassId) {
      url.searchParams.set("classId", selectedClassId);
    }
    url.searchParams.set("session", data.sessionLabel);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
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
    if (mode === "desktop") {
      focusStudentSearch(mode);
    }

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
    recordClassUsed(nextClassId);
    handleClassChange(nextClassId, "mobile");
    setMobileSheetView("student-picker");

    // Background prefetch all students in this class (card-only, no breakdown)
    // Throttled to avoid hammering the API — batch in groups of 3 with 150ms gaps
    if (nextClassId) {
      const classStudents = studentIndex
        .filter((s) => s.classId === nextClassId)
        .slice(0, 30); // cap at 30 to be safe

      classStudents.forEach((student, i) => {
        setTimeout(() => {
          prefetchStudentSummary(student.id);
        }, i * 60); // 60ms apart = 30 students in ~1.8s
      });
    }
  }

  function selectStudent(studentId: string) {
    markPaymentDeskStudentTiming("student_click");
    summaryAbortRef.current?.abort();
    summaryRequestRef.current += 1;
    const cacheKey = buildStudentSummaryCacheKey(studentId, paymentDate);
    const cachedSummary = summaryCache.current.get(cacheKey);

    setSelectedStudentId(studentId);
    const url = new URL(window.location.href);
    url.searchParams.set("studentId", studentId);
    url.searchParams.delete("repairNotice");
    if (selectedClassId) {
      url.searchParams.set("classId", selectedClassId);
    }
    url.searchParams.set("session", data.sessionLabel);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    setClientRequestId(createClientRequestId());
    setIsLockedAfterSuccess(false);
    if (isLastAmountArmed && lastPostedAmount !== null) {
      setPaymentAmountInput(String(lastPostedAmount));
      setIsLastAmountArmed(false);
    } else {
      setPaymentAmountInput("");
    }
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
    setFormError(null);
    setDismissedTodayReceiptId(null);
    setIsStudentPickerOpen(false);
    if (isMobileView) {
      setMobileSheetView("payment-entry");
    }
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

    const isCashFastPost =
      paymentMode === "cash" &&
      paymentAmount > 0 &&
      paymentAmount <= CASH_FAST_POST_THRESHOLD &&
      !quickDiscountAmount &&
      !quickLateFeeWaiverAmount;

    if (isCashFastPost) {
      // Skip confirm sheet — submit the form directly.
      setFormError(null);
      setIsConfirmOpen(false);
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (!form) {
        setFormError("Payment form is not ready.");
        return;
      }
      fastPostRequestedRef.current = true;
      form.requestSubmit();
      return;
    }

    setFormError(null);
    setIsConfirmOpen(true);
  }


  function handleCollectAnotherPayment() {
    // Prefetch the next student in the filtered list
    if (selectedClassId && selectedStudentId) {
      const currentIndex = filteredStudents.findIndex((s) => s.id === selectedStudentId);
      const nextStudent = filteredStudents[currentIndex + 1];
      if (nextStudent) {
        prefetchStudentSummary(nextStudent.id, true);
      }
    }

    const resetValues = resetPaymentDraftForNextPayment({
      keepPaymentMode: paymentMode,
      defaultReceivedBy,
    });

    setPaymentAmountInput(resetValues.amountInput);
    setQuickDiscountInput("");
    setWaiveFullLateFee(false);
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
    if (isMobileView) {
      setMobileSheetView(selectedClassId ? "student-picker" : "class-picker");
    }
    setStudentListScrollTop(0);
    if (selectedClassId) {
      setActiveStudentOptionIndex(0);
      if (activeStudentPickerMode === "desktop") {
        focusStudentSearch(activeStudentPickerMode);
      }
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

      <MobilePaymentFlowSheet
        view={mobileSheetView}
        onClose={() => setMobileSheetView(null)}
        onOpenClassPicker={() => setMobileSheetView("class-picker")}
        classOptions={classOptions}
        selectedClassId={selectedClassId}
        onSelectClass={(id) => selectMobileClass(id)}
        studentSearchQuery={studentSearchQuery}
        onStudentSearchChange={(q) => {
          setActiveStudentPickerMode("mobile");
          setStudentSearchQuery(q);
          setStudentListScrollTop(0);
          setActiveStudentOptionIndex(0);
        }}
        filteredStudents={filteredStudents}
        recentStudents={recentStudents}
        topVisibleOffset={topVisibleOffset}
        bottomVisibleOffset={bottomVisibleOffset}
        visibleStudentOptions={visibleStudentOptions}
        firstVisibleStudentIndex={firstVisibleStudentIndex}
        activeStudentOptionIndex={activeStudentOptionIndex}
        selectedStudentId={selectedStudentId}
        selectedStudentIndexItem={selectedStudentIndexItem}
        onSelectStudent={(id) => selectStudent(id)}
        onPrefetchStudent={(id, full) => prefetchStudentSummary(id, full)}
        studentListRef={mobileStudentListRef}
        studentSearchInputRef={mobileStudentSearchInputRef}
        onStudentListScroll={(top) => setStudentListScrollTop(top)}
        studentComboboxRowHeight={studentComboboxRowHeight}
        studentListId={mobileStudentListId}
        studentSummaryLoading={studentSummaryLoading}
        selectedStudent={selectedStudent}
        previewTotalPending={previewTotalPending}
        previewOverdueAmount={previewOverdueAmount}
        previewNextDue={previewNextDue}
        previewBreakdown={previewBreakdown}
        pendingLateFeeAmount={pendingLateFeeAmount}
        creditOrRefundAmount={creditOrRefundAmount}
        paymentAmountInput={paymentAmountInput}
        paymentMode={paymentMode}
        paymentDate={paymentDate}
        paymentDateIsBackdated={paymentDateIsBackdated}
        waiveFullLateFee={waiveFullLateFee}
        quickAmounts={quickAmounts}
        remainingAfterPayment={remainingAfterPayment}
        formError={formError}
        isLockedAfterSuccess={isLockedAfterSuccess}
        canPost={canPost}
        draftValidationOk={draftValidation.ok}
        confirmDisabled={confirmDisabled}
        latestReceiptToday={
          latestReceiptToday
            ? {
                id: latestReceiptToday.id,
                receiptNumber: latestReceiptToday.receiptNumber,
                totalAmount: latestReceiptToday.totalAmount,
              }
            : null
        }
        dismissedTodayReceiptId={dismissedTodayReceiptId}
        onDismissTodayReceipt={(id) => setDismissedTodayReceiptId(id)}
        onAmountChange={(value) => {
          setPaymentAmountInput(value);
          setFormError(null);
        }}
        onSetPaymentMode={(mode) => {
          setPaymentMode(mode as typeof paymentMode);
          if (isMobileView) {
            triggerHaptic(10);
          }
          setFormError(null);
        }}
        onSetPaymentDate={(date) => {
          setPaymentDate(date);
          setFormError(null);
        }}
        onToggleWaiveLateFee={() => {
          setWaiveFullLateFee((prev) => !prev);
          setFormError(null);
        }}
        onQuickAmount={(amount) => {
          setPaymentAmountInput(amount === null ? "" : String(amount));
          setFormError(null);
        }}
        onOpenConfirm={openConfirmationDialog}
        onChangeStudent={() => {
          clearSelectedStudent();
          setMobileSheetView("student-picker");
        }}
        paymentModeOptions={paymentModeOptions}
        previewLoading={previewLoading}
        getStudentPendingAmount={getStudentPendingAmount}
        getClassStats={getClassStats}
        onBackToClassPicker={() => setMobileSheetView("class-picker")}
        onBackToStudentPicker={() => {
          clearSelectedStudent();
          setMobileSheetView("student-picker");
        }}
        lastPostedAmount={lastPostedAmount}
        onUseLastAmount={() => {
          if (lastPostedAmount !== null) {
            setPaymentAmountInput(String(lastPostedAmount));
          }
          setIsLastAmountArmed(true);
          setFormError(null);
        }}
        isLastAmountArmed={isLastAmountArmed}
      />

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
            <div className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatInr(todayCollectionAmount)}</span>
              <span> · {todayReceiptCount} receipt{todayReceiptCount !== 1 ? "s" : ""} today</span>
              {lastAddedAmount !== null ? (
                <span className="anim-fade-in ml-1.5 font-medium text-success-soft-foreground">
                  +{formatInr(lastAddedAmount)}
                </span>
              ) : null}
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

            {recentStudents.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recentStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className="max-w-[120px] truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-surface-2"
                    title={`${student.fullName} · ${student.classLabel}`}
                    onClick={() => selectStudent(student.id)}
                  >
                    {(student.fullName.length > 14 ? `${student.fullName.slice(0, 14)}...` : student.fullName)} · {student.classLabel}
                  </button>
                ))}
              </div>
            ) : null}

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
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{student.fullName}</span>
                          {(() => {
                            const pendingAmt = getStudentPendingAmount(student.id);
                            if (pendingAmt === null) return null;
                            return (
                              <span className={cn(
                                "shrink-0 text-xs font-semibold tabular-nums",
                                pendingAmt === 0 ? "text-success-soft-foreground" : "text-destructive",
                              )}>
                                {pendingAmt === 0 ? "✓ Paid" : formatInr(pendingAmt)}
                              </span>
                            );
                          })()}
                        </div>
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
            <ActionNotice state={visibleActionState} canViewDiagnostics={canViewDiagnostics} />
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
                className="animate-pulse rounded-xl border border-border bg-card px-4 py-4"
                aria-live="polite"
                aria-busy={studentSummaryLoading}
              >
                <LoadingBlock className="h-4 w-full rounded-md border-0 bg-surface-2 p-0" lines={0} />
                <LoadingBlock className="mt-2 h-3 w-3/5 rounded-md border-0 bg-surface-2 p-0" lines={0} />
                {studentSummaryNotice ? (
                  <p className="mt-1 text-xs text-muted-foreground">{studentSummaryNotice}</p>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                  <LoadingBlock className="h-16 rounded-xl border-0 bg-surface-2 p-3" lines={1} />
                </div>
                <LoadingBlock className="mt-3 h-8 w-full rounded-lg border-0 bg-surface-2 p-0" lines={0} />
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

                {previewTotalPending <= 0 && (selectedStudent.totalPaid ?? 0) > 0 ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success-soft-foreground">
                    <span>✓ Year Clear · all dues settled</span>
                    <span className="text-xs opacity-80">
                      Paid {formatInr(selectedStudent.totalPaid)}
                    </span>
                  </div>
                ) : null}

                {previewBreakdown.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {previewBreakdown.map((item) => {
                      const isPaid = item.outstandingAmount <= 0 && item.paymentsTotal > 0;
                      const isOverdue = item.balanceStatus === "overdue";
                      const isPartial = item.paymentsTotal > 0 && item.outstandingAmount > 0;
                      const pillCls = isPaid
                        ? "bg-success-soft text-success-soft-foreground border-success-soft-foreground/30"
                        : isOverdue
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : isPartial
                            ? "bg-warning-soft text-warning-soft-foreground border-warning-soft-foreground/30"
                            : "bg-card text-muted-foreground border-border";
                      const symbol = isPaid ? "✓" : isOverdue ? "‼" : isPartial ? "½" : "";
                      return (
                        <span
                          key={`desk-pill-${item.installmentId}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            pillCls,
                          )}
                          title={`Inst ${item.installmentNo}: ${
                            isPaid
                              ? `paid ${formatInr(item.paymentsTotal)}`
                              : isOverdue
                                ? `overdue ${formatInr(item.outstandingAmount)}`
                                : isPartial
                                  ? `partial — ${formatInr(item.outstandingAmount)} left`
                                  : `pending ${formatInr(item.outstandingAmount)}`
                          }`}
                        >
                          Inst {item.installmentNo} {symbol}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border text-xs">
                  {previewBreakdown.map((row) => {
                    const isPaid = row.outstandingAmount <= 0 && row.paymentsTotal > 0;
                    const isOverdue = row.balanceStatus === "overdue";
                    const isPartial = row.paymentsTotal > 0 && row.outstandingAmount > 0;
                    const statusChip = isPaid
                      ? { label: "✓ Paid", cls: "bg-success-soft text-success-soft-foreground border-success-soft-foreground/30" }
                      : isOverdue
                        ? { label: "Overdue", cls: "bg-destructive/10 text-destructive border-destructive/30" }
                        : isPartial
                          ? { label: "Partial", cls: "bg-warning-soft text-warning-soft-foreground border-warning-soft-foreground/30" }
                          : { label: "Pending", cls: "bg-surface-2 text-muted-foreground border-border" };
                    return (
                      <div key={row.installmentId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">{row.installmentLabel}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Due {row.dueDate}
                            {row.finalLateFee > 0 ? (
                              <span className="ml-1.5 text-destructive">
                                +{formatInr(row.finalLateFee)} late fee
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", statusChip.cls)}>
                          {statusChip.label}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 min-w-[60px] text-right font-medium tabular-nums",
                            isPaid
                              ? "text-success-soft-foreground"
                              : isOverdue
                                ? "text-destructive"
                                : "text-foreground",
                          )}
                        >
                          {isPaid ? formatInr(row.paymentsTotal) : formatInr(row.outstandingAmount)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between bg-surface-2 px-3 py-2 font-medium">
                    <span className="text-muted-foreground">Total pending</span>
                    <span className="tabular-nums text-accent">{formatInr(previewTotalPending)}</span>
                  </div>
                  {pendingLateFeeAmount > 0 ? (
                    <div className="border-t border-border bg-surface px-3 py-2 text-xs">
                      <p className="flex flex-wrap items-baseline gap-x-1 text-foreground">
                        <span className="font-semibold">
                          {formatInr(
                            waiveFullLateFee
                              ? Math.max(previewTotalPending - pendingLateFeeAmount, 0)
                              : previewTotalPending,
                          )}
                        </span>
                        <span className="text-muted-foreground">=</span>
                        <span>
                          {formatInr(Math.max(previewTotalPending - pendingLateFeeAmount, 0))}{" "}
                          <span className="text-muted-foreground">overdue</span>
                        </span>
                        <span className="text-muted-foreground">+</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
                            waiveFullLateFee
                              ? "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground line-through decoration-2"
                              : "border-destructive/30 bg-destructive/10 text-destructive",
                          )}
                        >
                          {formatInr(pendingLateFeeAmount)} late fee
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setWaiveFullLateFee((value) => !value)}
                        className={cn(
                          "mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                          waiveFullLateFee
                            ? "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-surface-2",
                        )}
                        aria-pressed={waiveFullLateFee}
                      >
                        {waiveFullLateFee
                          ? `✓ Late fee waived — saving ${formatInr(pendingLateFeeAmount)}`
                          : `Waive late fee (−${formatInr(pendingLateFeeAmount)})`}
                      </button>
                    </div>
                  ) : null}
                </div>

                {(() => {
                  const dist = selectedStudent.feeHeadDistribution;
                  if (!dist) return null;
                  const totalDiscountAmt = dist.discountAmount;
                  const labelSuffix = dist.conventionalDiscountLabels.length > 0
                    ? ` (${dist.conventionalDiscountLabels.join(" + ")})`
                    : "";
                  const heads = ([
                    { label: "Tuition", amount: dist.tuitionFee },
                    { label: "Academic", amount: dist.academicFee },
                    { label: "Transport", amount: dist.transportFee },
                    dist.otherAdjustmentHead && dist.otherAdjustmentAmount > 0
                      ? { label: dist.otherAdjustmentHead, amount: dist.otherAdjustmentAmount }
                      : null,
                    totalDiscountAmt > 0
                      ? { label: `Discount${labelSuffix}`, amount: -totalDiscountAmt }
                      : null,
                  ].filter(Boolean) as Array<{ label: string; amount: number }>).filter((h) => h.amount !== 0);
                  if (heads.length === 0) return null;
                  return (
                    <details className="mt-3 rounded-lg border border-border bg-surface-2/40 text-xs">
                      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground">
                        Annual fee heads & paid summary
                      </summary>
                      <div className="border-t border-border bg-card px-3 py-2">
                        <ul className="space-y-0.5">
                          {heads.map((head) => (
                            <li key={head.label} className="flex justify-between">
                              <span className="text-muted-foreground">{head.label}</span>
                              <span
                                className={cn(
                                  "font-mono font-medium",
                                  head.amount < 0 ? "text-success-soft-foreground" : "text-foreground",
                                )}
                              >
                                {head.amount < 0 ? `−${formatInr(Math.abs(head.amount))}` : formatInr(head.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-1.5 border-t border-border pt-1.5 space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total annual</span>
                            <span className="font-mono font-medium text-foreground">
                              {formatInr(selectedStudent.totalDue)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Paid till now</span>
                            <span className="font-mono font-semibold text-success-soft-foreground">
                              {formatInr(selectedStudent.totalPaid)}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span>Balance</span>
                            <span
                              className={cn(
                                "font-mono tabular-nums",
                                previewTotalPending <= 0
                                  ? "text-success-soft-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {previewTotalPending <= 0 ? "₹0 ✓" : formatInr(previewTotalPending)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className="text-sm font-medium text-foreground">No student selected</p>
                <p className="text-xs text-muted-foreground">Search or click a student on the left to load their dues</p>
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
                      setPaymentAmountInput(event.target.value);
                      setFormError(null);
                    }}
                    onBlur={onAmountInputBlur}
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
                  {primaryQuickAmounts.map((qa) => (
                    <Button
                      key={qa.key}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={qa.disabled}
                      className={cn(
                        "flex h-9 flex-col items-start justify-center gap-0 px-3 text-left leading-tight",
                        getPrimaryQuickAmountClassName(qa),
                      )}
                      onClick={() => {
                        setFormError(null);
                        setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
                      }}
                    >
                      <span className="text-[11px] font-semibold">{qa.label}</span>
                      <span className="text-[10px] font-normal opacity-80">
                        {qa.amount === null ? "Clear amount" : formatInr(qa.amount)}
                      </span>
                    </Button>
                  ))}
                  {secondaryQuickAmounts.map((qa) => (
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
                          ? getDesktopModeActiveClass(opt.value)
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
          className="hidden md:block"
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
              className="hidden md:block"
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

          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground hidden md:block">
            {data.policyNote}
          </div>


          {selectedStudent && (creditBalance > 0 || selectedStudent.rowsKeptForReview > 0) ? (
            <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground hidden md:block">
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
            className="hidden md:block"
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
                if (!isConfirmOpen && !fastPostRequestedRef.current) {
                  event.preventDefault();
                  openConfirmationDialog();
                  return;
                }
                fastPostRequestedRef.current = false;

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
                        setPaymentAmountInput(event.target.value);
                        setFormError(null);
                      }}
                      onBlur={onAmountInputBlur}
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
                              triggerHaptic(10);
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
                  <input type="hidden" name="referenceNumber" value="" />
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
