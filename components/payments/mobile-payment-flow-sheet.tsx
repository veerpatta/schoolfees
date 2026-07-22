"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";
import {
  getDisplayInstallmentLabel,
  isCarryForwardInstallment,
} from "@/lib/prev-year-dues/display";
import type {
  InstallmentBalanceItem,
  PaymentAllocationItem,
  PaymentStudentIndexItem,
  SelectedStudentSummary,
} from "@/lib/payments/types";
import { cn } from "@/lib/utils";

/** Rows revealed per "Show more" press in the global search results. */
const SEARCH_RESULT_PAGE_SIZE = 20;

type MobilePaymentFlowSheetProps = {
  view: "class-picker" | "student-picker" | "payment-entry" | null;
  onClose: () => void;
  onOpenClassPicker: () => void;
  classOptions: Array<{ id: string; label: string }>;
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  studentSearchQuery: string;
  onStudentSearchChange: (q: string) => void;
  filteredStudents: PaymentStudentIndexItem[];
  recentStudents: PaymentStudentIndexItem[];
  topVisibleOffset: number;
  bottomVisibleOffset: number;
  visibleStudentOptions: PaymentStudentIndexItem[];
  firstVisibleStudentIndex: number;
  activeStudentOptionIndex: number;
  selectedStudentId: string;
  selectedStudentIndexItem: PaymentStudentIndexItem | null;
  onSelectStudent: (id: string) => void;
  onPrefetchStudent: (id: string, full?: boolean) => void;
  studentListRef: React.RefObject<HTMLDivElement | null>;
  studentSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onStudentListScroll: (scrollTop: number) => void;
  studentComboboxRowHeight: number;
  studentListId: string;
  studentSummaryLoading: boolean;
  selectedStudent: SelectedStudentSummary | null;
  previewTotalPending: number;
  previewOverdueAmount: number;
  previewNextDue: InstallmentBalanceItem | null;
  previewBreakdown: InstallmentBalanceItem[];
  pendingLateFeeAmount: number;
  creditOrRefundAmount: number;
  paymentAmountInput: string;
  paymentMode: string;
  paymentDate: string;
  paymentDateIsBackdated: boolean;
  waiveFullLateFee: boolean;
  canWaiveLateFee: boolean;
  quickAmounts: Array<{ key: string; label?: string; amount: number | null; disabled: boolean }>;
  /** Client-side allocation preview for the entered amount (oldest dues first). */
  allocationPreview: PaymentAllocationItem[];
  remainingAfterPayment: number;
  formError: string | null;
  isLockedAfterSuccess: boolean;
  canPost: boolean;
  draftValidationOk: boolean;
  confirmDisabled: boolean;
  latestReceiptToday: { id: string; receiptNumber: string; totalAmount: number } | null;
  dismissedTodayReceiptId: string | null;
  onDismissTodayReceipt: (id: string) => void;
  onAmountChange: (value: string) => void;
  onSetPaymentMode: (mode: string) => void;
  onSetPaymentDate: (date: string) => void;
  onToggleWaiveLateFee: () => void;
  onQuickAmount: (amount: number | null) => void;
  onOpenConfirm: () => void;
  onChangeStudent: () => void;
  paymentModeOptions: Array<{
    value: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }>;
  previewLoading: boolean;
  getStudentPendingAmount: (studentId: string) => number | null;
  getClassStats: (classId: string) => { total: number; pendingCount: number; pendingTotal: number | null };
  onBackToClassPicker: () => void;
  onBackToStudentPicker: () => void;
  lastPostedAmount: number | null;
  onUseLastAmount: () => void;
  isLastAmountArmed: boolean;
};

function studentLabel(student: PaymentStudentIndexItem) {
  return `${student.fullName} · SR ${student.admissionNo}`;
}

function useSwipeDown(onSwipeDown: () => void, threshold = 80) {
  const startY = React.useRef<number | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startY.current = e.touches[0].clientY;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startY.current === null) return;
      const delta = e.changedTouches[0].clientY - startY.current;
      startY.current = null;
      if (delta > threshold) onSwipeDown();
    },
  };
}

function SheetHandle({ swipeHandlers }: { swipeHandlers?: ReturnType<typeof useSwipeDown> }) {
  return (
    <div className="flex-none flex justify-center py-2 cursor-grab" {...swipeHandlers}>
      <div className="w-10 h-1 rounded-full bg-border" />
    </div>
  );
}

export function MobilePaymentFlowSheet({
  view,
  onClose,
  onOpenClassPicker,
  classOptions,
  selectedClassId,
  onSelectClass,
  studentSearchQuery,
  onStudentSearchChange,
  filteredStudents,
  recentStudents,
  topVisibleOffset,
  bottomVisibleOffset,
  visibleStudentOptions,
  firstVisibleStudentIndex,
  activeStudentOptionIndex,
  selectedStudentId,
  selectedStudentIndexItem,
  onSelectStudent,
  onPrefetchStudent,
  studentListRef,
  studentSearchInputRef,
  onStudentListScroll,
  studentComboboxRowHeight,
  studentListId,
  studentSummaryLoading,
  selectedStudent,
  previewTotalPending,
  previewOverdueAmount,
  previewBreakdown,
  pendingLateFeeAmount,
  creditOrRefundAmount,
  paymentAmountInput,
  paymentMode,
  paymentDate,
  paymentDateIsBackdated,
  waiveFullLateFee,
  canWaiveLateFee,
  quickAmounts,
  allocationPreview,
  remainingAfterPayment,
  formError,
  isLockedAfterSuccess,
  canPost,
  draftValidationOk,
  confirmDisabled,
  latestReceiptToday,
  dismissedTodayReceiptId,
  onDismissTodayReceipt,
  onAmountChange,
  onSetPaymentMode,
  onSetPaymentDate,
  onToggleWaiveLateFee,
  onQuickAmount,
  onOpenConfirm,
  onChangeStudent,
  paymentModeOptions,
  previewLoading,
  getStudentPendingAmount,
  getClassStats,
  onBackToClassPicker,
  onBackToStudentPicker,
  lastPostedAmount,
  onUseLastAmount,
  isLastAmountArmed,
}: MobilePaymentFlowSheetProps) {
  const [pendingHeadsExpanded, setPendingHeadsExpanded] = React.useState(false);
  const [overdueHeadsExpanded, setOverdueHeadsExpanded] = React.useState(false);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const hasFocusedRef = React.useRef(false);

  /**
   * Exactly one loading affordance at a time:
   * - nothing on screen yet  → skeleton (communicates shape)
   * - content already shown  → hairline progress bar (background refresh)
   * Previously both keyed off the same expression and rendered together.
   */
  const isLoadingSummary = studentSummaryLoading || previewLoading;
  const isFirstLoad = isLoadingSummary && !selectedStudent;
  const isBackgroundRefreshing = isLoadingSummary && Boolean(selectedStudent);

  const displayName = selectedStudent?.fullName ?? selectedStudentIndexItem?.fullName ?? "";
  const displayClass = selectedStudent?.classLabel ?? selectedStudentIndexItem?.classLabel ?? "";
  const displayAdmNo = selectedStudent?.admissionNo ?? selectedStudentIndexItem?.admissionNo ?? "";

  // Reset focus guard and breakdown when entering payment-entry view
  React.useEffect(() => {
    if (view === "payment-entry") {
      hasFocusedRef.current = false;
      setPendingHeadsExpanded(false);
      setOverdueHeadsExpanded(false);
    }
  }, [view]);

  // Focus amount input as soon as student data is available (not after preview loads)
  React.useEffect(() => {
    if (view !== "payment-entry") return;
    if (hasFocusedRef.current) return;
    if (studentSummaryLoading) return;
    hasFocusedRef.current = true;
    const timer = setTimeout(() => {
      amountInputRef.current?.focus({ preventScroll: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [view, studentSummaryLoading]);

  const classPickerSwipe = useSwipeDown(onClose);
  const studentPickerSwipe = useSwipeDown(onBackToClassPicker);
  const paymentEntrySwipe = useSwipeDown(onBackToStudentPicker);

  // Portal the sheet to <body> so its z-index is evaluated in the body
  // stacking context, not trapped inside the Payment Desk page tree. Without
  // this, the fixed bottom navigation bar (rendered higher in the shell) paints
  // over the sheet's bottom action button on mobile. This mirrors how
  // ConfirmReceiptSheet and SuccessReceiptSheet already escape via createPortal.
  const [mounted, setMounted] = React.useState(false);
  /**
   * Progressive reveal for the global search results. This list used to be
   * hard-capped at 20 while the label above printed the true match count —
   * so a common surname showed "34 matches" and offered no way to reach #21.
   * Keeping an initial cap protects scroll performance on a mid-range phone;
   * the button below makes the rest reachable.
   */
  const [visibleSearchCount, setVisibleSearchCount] = React.useState(
    SEARCH_RESULT_PAGE_SIZE,
  );

  // Any new query starts the reveal over.
  React.useEffect(() => {
    setVisibleSearchCount(SEARCH_RESULT_PAGE_SIZE);
  }, [studentSearchQuery]);
  React.useEffect(() => setMounted(true), []);

  if (view === null) return null;
  if (!mounted) return null;

  const selectedClassLabel = classOptions.find((classOption) => classOption.id === selectedClassId)?.label ?? "All classes";
  const showTodayReceiptWarning = latestReceiptToday && latestReceiptToday.id !== dismissedTodayReceiptId;
  const disablePaymentActions = isLockedAfterSuccess || !canPost;

  const sheet = (
    <div className="fixed inset-0 z-[45] md:hidden">
      {view !== "payment-entry" ? (
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      ) : null}

      {view === "class-picker" ? (
        <div
          className="absolute left-0 right-0 rounded-t-2xl border-t border-border bg-card flex flex-col overflow-hidden"
          style={{
            // Stretch the sheet from a small top gap to the keyboard edge so
            // typing leaves the maximum vertical space for results. When the
            // keyboard is closed --keyboard-offset is 0 and the sheet behaves
            // like a normal bottom sheet pinned to the bottom.
            top: "max(56px, calc(100svh - var(--keyboard-offset, 0px) - 88svh))",
            bottom: "var(--keyboard-offset, 0px)",
          }}
        >
          <SheetHandle swipeHandlers={classPickerSwipe} />
          <h2 className="px-4 pb-2 text-base font-semibold text-foreground">Collect Payment</h2>
          <div className="flex-none px-3 pb-2">
            <Input
              placeholder="Search any student by name or SR no…"
              value={studentSearchQuery}
              onChange={(event) => onStudentSearchChange(event.target.value)}
              autoComplete="off"
              aria-label="Search students directly"
              onFocus={(event) => {
                // Scroll the input into view so it stays visible above the keyboard.
                const target = event.currentTarget;
                window.setTimeout(() => {
                  target.scrollIntoView({ block: "center", behavior: "smooth" });
                }, 200);
              }}
            />
          </div>

          {studentSearchQuery.trim().length > 0 ? (
            <div
              className="flex-1 overflow-y-auto px-3 pb-4"
              style={{
                paddingBottom: "calc(var(--mobile-bottom-nav-offset, 4.25rem) + 0.5rem)",
              }}
            >
              <p className="mb-1.5 text-[10px] uppercase text-muted-foreground">
                {filteredStudents.length} match{filteredStudents.length === 1 ? "" : "es"}
              </p>
              {filteredStudents.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-4 text-center text-xs text-muted-foreground">
                  No students match this search. Try a different name or SR no.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                  {filteredStudents.slice(0, visibleSearchCount).map((student) => {
                    const pendingAmt = getStudentPendingAmount(student.id);
                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectStudent(student.id);
                          }}
                          onMouseEnter={() => onPrefetchStudent(student.id, true)}
                          onFocus={() => onPrefetchStudent(student.id, true)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-surface-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{student.fullName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {student.classLabel} · SR {student.admissionNo}
                            </p>
                          </div>
                          {pendingAmt !== null ? (
                            <span
                              className={cn(
                                "shrink-0 text-xs font-semibold tabular-nums",
                                pendingAmt > 0 ? "text-destructive" : "text-success",
                              )}
                            >
                              {pendingAmt > 0 ? formatInr(pendingAmt) : "Clear"}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">tap</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {filteredStudents.length > visibleSearchCount ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleSearchCount((count) => count + SEARCH_RESULT_PAGE_SIZE)
                  }
                  className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-surface-3"
                >
                  Show {Math.min(
                    SEARCH_RESULT_PAGE_SIZE,
                    filteredStudents.length - visibleSearchCount,
                  )}{" "}
                  more ({filteredStudents.length - visibleSearchCount} remaining)
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-y-auto">
              <p className="px-4 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Browse by class
              </p>
              <div
                className="grid grid-cols-2 gap-2 px-3 pb-4"
                style={{ paddingBottom: "calc(var(--mobile-bottom-nav-offset, 4.25rem) + 0.5rem)" }}
              >
                {classOptions.map((classOption) => {
                  const selected = classOption.id === selectedClassId;
                  const stats = getClassStats(classOption.id);

                  return (
                    <button
                      key={classOption.id}
                      type="button"
                      className={cn(
                        "relative flex flex-col items-start gap-0.5 min-h-[56px] w-full rounded-xl border px-3 py-2 text-sm transition-colors",
                        selected
                          ? "border-accent bg-accent-soft text-accent-soft-foreground"
                          : "border-border bg-card hover:bg-surface-2 text-foreground",
                      )}
                      onClick={() => onSelectClass(classOption.id)}
                    >
                      <span className="font-semibold">{classOption.label}</span>
                      <span className="text-[11px] text-muted-foreground leading-none">
                        {stats.total > 0
                          ? stats.pendingTotal !== null
                            ? `${stats.pendingCount} pending · ${formatInr(stats.pendingTotal)}`
                            : `${stats.total} students`
                          : null}
                      </span>
                      {selected ? <span className="absolute top-2 right-2 text-xs text-accent">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {view === "student-picker" ? (
        <div className="absolute bottom-0 left-0 right-0 h-[88svh] rounded-t-2xl border-t border-border bg-card flex flex-col">
          <SheetHandle swipeHandlers={studentPickerSwipe} />
          <div className="flex-none px-4 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{selectedClassLabel}</p>
            <button
              type="button"
              className="text-xs font-medium text-accent underline underline-offset-2"
              onClick={onOpenClassPicker}
            >
              Change class
            </button>
          </div>
          <div className="flex-none px-3 pb-2">
            <Input
              ref={studentSearchInputRef}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded
              aria-controls={studentListId}
              aria-activedescendant={
                activeStudentOptionIndex >= 0 ? `${studentListId}-option-${activeStudentOptionIndex}` : undefined
              }
              aria-autocomplete="list"
              placeholder="Search by name or SR no"
              value={studentSearchQuery}
              onChange={(event) => onStudentSearchChange(event.target.value)}
            />
          </div>

          {lastPostedAmount !== null ? (
            <div className="flex-none px-3 pb-2">
              <button
                type="button"
                onClick={onUseLastAmount}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all active:scale-[0.98]",
                  isLastAmountArmed
                    ? "border-accent bg-accent/20 text-accent font-semibold"
                    : "border-accent/30 bg-accent-soft text-accent-soft-foreground"
                )}
              >
                <span className="font-semibold">Use {formatInr(lastPostedAmount)} again</span>
                <span className="ml-2 text-xs opacity-70">
                  {isLastAmountArmed ? "— Armed! Select student to pre-fill" : "— select a student and this amount will be pre-filled"}
                </span>
              </button>
            </div>
          ) : null}

          {!studentSearchQuery && recentStudents.length > 0 ? (
            <div className="flex-none px-3 pb-2">
              <p className="mb-1.5 text-[10px] uppercase text-muted-foreground">Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recentStudents.map((student) => {
                  const amt = getStudentPendingAmount(student.id);
                  return (
                    <button
                      key={`recent-${student.id}`}
                      type="button"
                      className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-medium text-foreground active:scale-95 transition-transform"
                      onClick={() => onSelectStudent(student.id)}
                    >
                      <span>{student.fullName}</span>
                      {amt !== null ? (
                        amt <= 0 ? (
                          <span className="text-[9px] font-semibold text-success-soft-foreground uppercase">Paid</span>
                        ) : (
                          <span className="text-[10px] font-semibold tabular-nums text-destructive">
                            {formatInr(amt)}
                          </span>
                        )
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div
            id={studentListId}
            role="listbox"
            ref={studentListRef}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ paddingBottom: 'calc(var(--mobile-bottom-nav-offset, 4.25rem) + 0.5rem)' }}
            onScroll={(event) => onStudentListScroll(event.currentTarget.scrollTop)}
          >
            {studentSummaryLoading && filteredStudents.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading...</p>
            ) : filteredStudents.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No matching students.</p>
            ) : (
              <div style={{ paddingTop: topVisibleOffset, paddingBottom: bottomVisibleOffset }}>
                {visibleStudentOptions.map((student, index) => {
                  const optionIndex = firstVisibleStudentIndex + index;
                  const isActive = optionIndex === activeStudentOptionIndex;
                  const isSelected = selectedStudentId === student.id;

                  return (
                    <button
                      key={student.id}
                      id={`${studentListId}-option-${optionIndex}`}
                      role="option"
                      aria-selected={isSelected}
                      type="button"
                      className={cn(
                        "min-h-[52px] w-full flex items-center px-3 border-b border-border text-sm text-left",
                        isActive ? "bg-info-soft text-info-soft-foreground" : "bg-card text-foreground",
                      )}
                      style={{ minHeight: `${studentComboboxRowHeight}px` }}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => onPrefetchStudent(student.id, false)}
                      onTouchStart={() => onPrefetchStudent(student.id, true)}
                      onClick={() => onSelectStudent(student.id)}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{studentLabel(student)}</span>
                        {(() => {
                          const amt = getStudentPendingAmount(student.id);
                          if (amt === null) return null;
                          if (amt <= 0) return (
                            <span className="shrink-0 text-[10px] font-medium text-success-soft-foreground">Paid</span>
                          );
                          return (
                            <span className={cn(
                              "shrink-0 text-xs font-semibold tabular-nums",
                              amt > 0 ? "text-destructive" : "text-success-soft-foreground"
                            )}>
                              {formatInr(amt)}
                            </span>
                          );
                        })()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {view === "payment-entry" ? (
        <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-background flex flex-col" style={{ height: 'calc(100svh - 3.5rem)' }}>
          <SheetHandle swipeHandlers={paymentEntrySwipe} />
          {/* One loading signal at a time. The skeleton below owns the
              first load (it communicates shape, which reads better on a
              phone); this bar is only for a background refresh over content
              that is already on screen. Showing both made a fast two-phase
              load feel slower than it was. */}
          {isBackgroundRefreshing ? (
            <div className="flex-none h-0.5 bg-surface-2 overflow-hidden">
              <div className="h-full bg-accent anim-route-progress" style={{ width: "60%" }} />
            </div>
          ) : null}
          <div className="flex-none px-4 py-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {displayName || "Select student"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {displayName ? `SR ${displayAdmNo} · ${displayClass}` : selectedClassLabel}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold tabular-nums text-accent">{formatInr(previewTotalPending)}</p>
              <button
                type="button"
                aria-label="Change student"
                className="mt-1 text-xs font-medium text-muted-foreground underline underline-offset-2"
                onClick={onChangeStudent}
              >
                Change
              </button>
            </div>
          </div>

          {showTodayReceiptWarning ? (
            <div className="mx-3 flex-none rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
              <div className="flex items-start justify-between gap-3">
                <span>
                  Receipt {latestReceiptToday.receiptNumber} already issued today for {formatInr(latestReceiptToday.totalAmount)}.
                </span>
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => onDismissTodayReceipt(latestReceiptToday.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {creditOrRefundAmount > 0 ? (
            <div className="mx-3 mt-2 flex-none rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
              Credit/refund warning: {formatInr(creditOrRefundAmount)} is already available for this student.
            </div>
          ) : null}

          {/* Collapsed summary — always visible. Pending and Overdue are tappable to expand fee heads. */}
          <div className="flex-none border-b border-border px-3 py-3">
            {(() => {
              const dist = selectedStudent?.feeHeadDistribution;
              const installmentCount = Math.max(dist?.installmentCount ?? 4, 1);
              const overdueInstallments = previewBreakdown.filter(
                (item) => item.balanceStatus === "overdue" && item.outstandingAmount > 0,
              );
              const discountReasonSuffix = dist && dist.conventionalDiscountLabels.length > 0
                ? ` (${dist.conventionalDiscountLabels.join(" + ")})`
                : "";
              // discountAmount from the workbook view is the total discount applied
              // (it already includes any conventional discount). Use it directly —
              // do NOT add conventionalDiscountAmount on top or it double-counts.
              const totalDiscount = dist?.discountAmount ?? 0;

              // Annual whole — Pending dropdown.
              const pendingHeads = dist
                ? ([
                    { label: "Tuition", amount: dist.tuitionFee },
                    { label: "Academic", amount: dist.academicFee },
                    { label: "Transport", amount: dist.transportFee },
                    dist.otherAdjustmentHead && dist.otherAdjustmentAmount > 0
                      ? { label: dist.otherAdjustmentHead, amount: dist.otherAdjustmentAmount }
                      : null,
                    totalDiscount > 0
                      ? { label: `Discount${discountReasonSuffix}`, amount: -totalDiscount }
                      : null,
                  ].filter(Boolean) as Array<{ label: string; amount: number }>).filter((h) => h.amount !== 0)
                : [];

              // Per-installment math: academic is added only to installment 1 in the workbook
              // model. So for the overdue dropdown, scale tuition/transport/other/discount by
              // (overdueCount / installmentCount) and include academic ONLY if installment 1
              // is among the overdue list.
              const overdueIncludesFirst = overdueInstallments.some(
                (item) => item.installmentNo === 1,
              );
              const proratedShare = overdueInstallments.length / installmentCount;
              const overdueHeads = dist
                ? ([
                    { label: "Tuition", amount: Math.round(dist.tuitionFee * proratedShare) },
                    overdueIncludesFirst
                      ? { label: "Academic", amount: dist.academicFee }
                      : null,
                    { label: "Transport", amount: Math.round(dist.transportFee * proratedShare) },
                    dist.otherAdjustmentHead && dist.otherAdjustmentAmount > 0
                      ? { label: dist.otherAdjustmentHead, amount: Math.round(dist.otherAdjustmentAmount * proratedShare) }
                      : null,
                    totalDiscount > 0
                      ? { label: `Discount${discountReasonSuffix}`, amount: -Math.round(totalDiscount * proratedShare) }
                      : null,
                  ].filter(Boolean) as Array<{ label: string; amount: number }>).filter((h) => h.amount !== 0)
                : [];
              const overdueWithLateFee = previewOverdueAmount + pendingLateFeeAmount;
              const isYearClear = previewTotalPending <= 0 && (selectedStudent?.totalPaid ?? 0) > 0;

              return (
                <>
                  {isYearClear ? (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success-soft-foreground">
                      <span>✓ Year Clear · all dues settled</span>
                      <span className="text-xs font-medium opacity-80">
                        Paid {formatInr(selectedStudent?.totalPaid ?? 0)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <button
                        type="button"
                        onClick={() => setPendingHeadsExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-surface-2/60"
                        aria-expanded={pendingHeadsExpanded}
                      >
                        <span className="text-muted-foreground font-medium">Pending</span>
                        <span className={cn(
                          "font-bold tabular-nums",
                          previewTotalPending <= 0 ? "text-success-soft-foreground" : "text-foreground",
                        )}>{formatInr(previewTotalPending)}</span>
                        <span className="text-[10px] text-muted-foreground">{pendingHeadsExpanded ? "▲" : "▼"}</span>
                      </button>
                      {previewOverdueAmount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOverdueHeadsExpanded((prev) => !prev)}
                          className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-surface-2/60"
                          aria-expanded={overdueHeadsExpanded}
                        >
                          <span className="text-muted-foreground font-medium">Overdue</span>
                          <span className="font-semibold tabular-nums text-destructive">{formatInr(previewOverdueAmount)}</span>
                          {pendingLateFeeAmount > 0 ? (
                            <span
                              className={cn(
                                "ml-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold tabular-nums transition-colors",
                                waiveFullLateFee
                                  ? "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground line-through decoration-[1.5px]"
                                  : "border-destructive/30 bg-destructive/10 text-destructive",
                              )}
                            >
                              + {formatInr(pendingLateFeeAmount)} late fee
                            </span>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground">{overdueHeadsExpanded ? "▲" : "▼"}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Dues ledger — one row per installment (Ledger Calm 2.0).
                      Dot: paid green / overdue red / partial amber / upcoming
                      gray; overdue rows sit on a destructive-soft wash. Old
                      balance rows keep their carry-forward labelling. */}
                  {previewBreakdown.length > 0 ? (
                    <div
                      className="mt-2 max-h-[26svh] space-y-1 overflow-y-auto pr-0.5"
                      data-dues-ledger
                    >
                      {previewBreakdown.map((item) => {
                        const isPaid = item.outstandingAmount <= 0 && item.paymentsTotal > 0;
                        const isOverdue = item.balanceStatus === "overdue";
                        const isPartial = item.paymentsTotal > 0 && item.outstandingAmount > 0;
                        const dotCls = isPaid
                          ? "bg-success"
                          : isOverdue
                            ? "bg-destructive"
                            : isPartial
                              ? "bg-warning"
                              : "bg-border-strong";
                        const rowLabel = isCarryForwardInstallment(item)
                          ? item.displayLabel ?? getDisplayInstallmentLabel(item)
                          : `Inst ${item.installmentNo}`;
                        return (
                          <div
                            key={`ledger-${item.installmentId}`}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs",
                              isOverdue
                                ? "bg-destructive-soft"
                                : "bg-surface-2/50",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn("size-2 shrink-0 rounded-full", dotCls)}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {rowLabel}
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                {isPaid
                                  ? "Paid"
                                  : isOverdue
                                    ? `Overdue · was due ${formatShortDate(item.dueDate)}`
                                    : isPartial
                                      ? "Partly paid"
                                      : `Due ${formatShortDate(item.dueDate)}`}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-semibold tabular-nums",
                                isPaid
                                  ? "text-success-soft-foreground"
                                  : isOverdue
                                    ? "text-destructive"
                                    : "text-foreground",
                              )}
                            >
                              {isPaid
                                ? formatInr(item.paymentsTotal)
                                : formatInr(item.outstandingAmount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {pendingHeadsExpanded ? (
                    <div className="mt-2 rounded-md border border-border bg-surface-2/40 px-3 py-2 text-xs">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Annual fee heads
                      </p>
                      {pendingHeads.length === 0 ? (
                        <p className="text-muted-foreground">Fee head distribution unavailable.</p>
                      ) : (
                        <>
                          <ul className="space-y-0.5">
                            {pendingHeads.map((head) => (
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
                                {formatInr(selectedStudent?.totalDue ?? 0)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Paid till now</span>
                              <span className="font-mono font-semibold text-success-soft-foreground">
                                {formatInr(selectedStudent?.totalPaid ?? 0)}
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
                                {previewTotalPending <= 0
                                  ? "₹0 ✓" /* @allow-raw-money-format */
                                  : formatInr(previewTotalPending)}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {overdueHeadsExpanded && previewOverdueAmount > 0 ? (
                    <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-destructive">
                        Overdue fee heads · {overdueInstallments.length} installment{overdueInstallments.length === 1 ? "" : "s"}
                      </p>
                      {overdueHeads.length === 0 ? (
                        <p className="text-muted-foreground">Fee head distribution unavailable.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {overdueHeads.map((head) => (
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
                          {pendingLateFeeAmount > 0 ? (
                            <li className="flex justify-between border-t border-destructive/20 pt-1 mt-1">
                              <span className="text-muted-foreground">Late fee</span>
                              <span
                                className={cn(
                                  "font-mono font-semibold",
                                  waiveFullLateFee
                                    ? "text-success-soft-foreground line-through"
                                    : "text-destructive",
                                )}
                              >
                                {formatInr(pendingLateFeeAmount)}
                              </span>
                            </li>
                          ) : null}
                          <li className="flex justify-between border-t border-destructive/30 pt-1 mt-1 font-semibold">
                            <span>Total overdue</span>
                            <span className="font-mono tabular-nums">
                              {formatInr(waiveFullLateFee ? previewOverdueAmount : overdueWithLateFee)}
                            </span>
                          </li>
                        </ul>
                      )}
                    </div>
                  ) : null}

                </>
              );
            })()}
          </div>

          <div className="flex flex-col gap-0">
            {pendingLateFeeAmount > 0 ? (
              (() => {
                /* Late-fee decision card — replaces the old waive checkbox.
                   States: Include (default, amber) / Waive (admin, success).
                   The waiver is permanent and stamped on the receipt + audit. */
                const overdueRows = previewBreakdown.filter(
                  (item) => item.balanceStatus === "overdue" && item.outstandingAmount > 0,
                );
                const triggerRow = overdueRows[overdueRows.length - 1] ?? null;
                const causeLine = triggerRow
                  ? `Applied because ${
                      isCarryForwardInstallment(triggerRow)
                        ? triggerRow.displayLabel ?? getDisplayInstallmentLabel(triggerRow)
                        : `Inst ${triggerRow.installmentNo}`
                    } passed ${formatShortDate(triggerRow.dueDate)} · flat ${formatInr(pendingLateFeeAmount)}`
                  : `Flat ${formatInr(pendingLateFeeAmount)} for late payment`;

                return (
                  <div
                    className={cn(
                      "mx-3 my-2 flex-none rounded-xl border px-3 py-2.5 transition-colors",
                      waiveFullLateFee
                        ? "border-success/30 bg-success-soft"
                        : "border-warning/30 bg-warning-soft",
                    )}
                    data-late-fee-decision
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          waiveFullLateFee
                            ? "text-success-soft-foreground"
                            : "text-warning-soft-foreground",
                        )}
                      >
                        Late fee · विलंब शुल्क{" "}
                        <span
                          className={cn(
                            "tabular-nums",
                            waiveFullLateFee && "line-through decoration-[1.5px] opacity-70",
                          )}
                        >
                          {formatInr(pendingLateFeeAmount)}
                        </span>
                      </p>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 text-[11px]",
                        waiveFullLateFee
                          ? "text-success-soft-foreground/80"
                          : "text-warning-soft-foreground/80",
                      )}
                    >
                      {waiveFullLateFee
                        ? "Waived permanently — stamped on the receipt and audit trail."
                        : causeLine}
                    </p>
                    {canWaiveLateFee ? (
                      <div
                        className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-card/70 p-1"
                        role="group"
                        aria-label="Late fee decision"
                      >
                        <button
                          type="button"
                          aria-pressed={!waiveFullLateFee}
                          disabled={disablePaymentActions}
                          onClick={() => {
                            if (waiveFullLateFee) onToggleWaiveLateFee();
                          }}
                          className={cn(
                            "rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                            !waiveFullLateFee
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Include {formatInr(pendingLateFeeAmount)}
                        </button>
                        <button
                          type="button"
                          aria-pressed={waiveFullLateFee}
                          disabled={disablePaymentActions}
                          onClick={() => {
                            if (!waiveFullLateFee) onToggleWaiveLateFee();
                          }}
                          className={cn(
                            "rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                            waiveFullLateFee
                              ? "bg-success text-success-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Waive (admin)
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : null}

            {isFirstLoad ? (
              /* Skeleton mirrors the real composer layout: three quick cards,
                 the amount field, and the mode row. Shimmer only — no pulse. */
              <div className="px-3 py-3 border-b border-border space-y-3">
                <div className="flex gap-2">
                  <div className="h-16 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                  <div className="h-16 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                  <div className="h-16 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                </div>
                <div className="h-16 w-full rounded-xl bg-surface-2 anim-shimmer" />
                <div className="flex gap-1.5 py-1">
                  <div className="h-12 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                  <div className="h-12 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                  <div className="h-12 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                  <div className="h-12 flex-1 rounded-xl bg-surface-2 anim-shimmer" />
                </div>
              </div>
            ) : (
              <>
                {/* Amount composer — three quick cards: Clear overdue (incl.
                    late fee, saffron), Next installment, Full year. Selected
                    card = saffron border + accent-soft wash. */}
                {(() => {
                  const fullDue = quickAmounts.find((q) => q.key === "full");
                  const nextInst = quickAmounts.find((q) => q.key === "next");
                  const overdue = quickAmounts.find((q) => q.key === "overdue");
                  const includedLateFee = waiveFullLateFee ? 0 : pendingLateFeeAmount;
                  const clearOverdueAmount =
                    (overdue?.amount ?? 0) > 0 ? (overdue?.amount ?? 0) + includedLateFee : 0;
                  const composerCards = [
                    clearOverdueAmount > 0
                      ? {
                          key: "clearOverdue",
                          label: "Clear overdue",
                          sub: includedLateFee > 0 ? "incl. late fee" : "past due",
                          amount: clearOverdueAmount,
                          emphasis: true,
                        }
                      : null,
                    nextInst && nextInst.amount !== null && !nextInst.disabled
                      ? {
                          key: "next",
                          label: "Next installment",
                          sub: null,
                          amount: nextInst.amount,
                          emphasis: false,
                        }
                      : null,
                    fullDue && fullDue.amount !== null && !fullDue.disabled
                      ? {
                          key: "full",
                          label: "Full year",
                          sub: null,
                          amount: fullDue.amount,
                          emphasis: false,
                        }
                      : null,
                  ].filter(Boolean) as Array<{
                    key: string;
                    label: string;
                    sub: string | null;
                    amount: number;
                    emphasis: boolean;
                  }>;
                  if (composerCards.length === 0) return null;
                  return (
                    <div className="flex gap-2 px-3 py-2 border-b border-border">
                      {composerCards.map((card) => {
                        const selected = paymentAmountInput === String(card.amount);
                        return (
                          <button
                            key={card.key}
                            type="button"
                            disabled={disablePaymentActions}
                            onClick={() => onQuickAmount(card.amount)}
                            className={cn(
                              "flex min-w-0 flex-1 flex-col items-center rounded-xl border py-3 transition-all active:scale-95 disabled:opacity-40",
                              selected
                                ? "border-accent bg-accent-soft text-accent-soft-foreground font-semibold"
                                : card.emphasis
                                  ? "border-accent/40 bg-card text-accent hover:bg-accent-soft"
                                  : "border-border bg-surface-2 text-foreground hover:bg-surface-3",
                            )}
                          >
                            <span
                              className={cn(
                                "px-1 text-[10px] font-medium uppercase tracking-wide",
                                selected || card.emphasis
                                  ? "text-accent-soft-foreground/80"
                                  : "text-muted-foreground",
                              )}
                            >
                              {card.label}
                            </span>
                            <span className="text-base font-bold tabular-nums">
                              {formatInr(card.amount)}
                            </span>
                            {card.sub ? (
                              <span className="px-1 text-[9px] font-medium text-muted-foreground">
                                {card.sub}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="flex flex-col border-b border-border bg-background">
                  <div className="flex items-center">
                    <span className="border-r border-border px-4 py-3 text-2xl font-medium text-muted-foreground">₹</span>
                    <input
                      ref={amountInputRef}
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="0"
                      className="h-16 flex-1 bg-transparent px-4 text-3xl font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                      value={paymentAmountInput}
                      onChange={(e) => {
                        onAmountChange(sanitizeDecimalInput(e.target.value));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                    />
                    {paymentAmountInput && remainingAfterPayment === 0 ? (
                      <span className="mr-3 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-soft-foreground">
                        Clears ✓
                      </span>
                    ) : null}
                  </div>
                  {paymentAmountInput && Number(paymentAmountInput) > 0 ? (
                    <p className="font-display-money pb-2 text-center text-3xl text-accent">
                      {formatInr(Number(paymentAmountInput))}
                    </p>
                  ) : null}
                </div>

                {/* Allocation preview strip — where the entered money lands,
                    from the same preview data the posting flow uses. */}
                {paymentAmountInput &&
                Number(paymentAmountInput) > 0 &&
                allocationPreview.length > 0 ? (
                  (() => {
                    const enteredAmount = Number(paymentAmountInput) || 0;
                    const allocatedTotal = allocationPreview.reduce(
                      (sum, item) => sum + item.allocatedAmount,
                      0,
                    );
                    const surplus = Math.max(enteredAmount - allocatedTotal, 0);
                    const lateFeeCovered =
                      !waiveFullLateFee &&
                      pendingLateFeeAmount > 0 &&
                      surplus >= pendingLateFeeAmount;
                    return (
                      <div
                        className="mx-3 my-2 flex-none rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground"
                        data-allocation-strip
                        aria-live="polite"
                      >
                        <span className="font-semibold">This payment → </span>
                        {allocationPreview.map((item, index) => {
                          const label = item.isCarryForward
                            ? item.displayLabel ?? item.installmentLabel
                            : `Inst ${item.installmentNo}`;
                          return (
                            <span key={item.installmentId}>
                              {index > 0 ? " + " : ""}
                              {item.outstandingAfter === 0 ? `clears ${label} ✓` : `${label} (part)`}
                            </span>
                          );
                        })}
                        {pendingLateFeeAmount > 0 ? (
                          <span>
                            {waiveFullLateFee
                              ? " · late fee waived"
                              : lateFeeCovered
                                ? ` + late fee ${formatInr(pendingLateFeeAmount)} ✓`
                                : ` · late fee ${formatInr(pendingLateFeeAmount)} still due`}
                          </span>
                        ) : null}
                        <span>
                          {" · "}Remaining after: {formatInr(Math.max(remainingAfterPayment, 0))}
                        </span>
                      </div>
                    );
                  })()
                ) : null}
              </>
            )}

            {/* Payment mode — one segmented row, selected mode fills ink. */}
            <div className="flex-none grid grid-cols-4 gap-1.5 border-t border-border px-3 py-2">
              {paymentModeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={paymentMode === value}
                  className={cn(
                    "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-medium transition-colors",
                    paymentMode === value
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border bg-surface-2 text-muted-foreground hover:bg-surface-3",
                  )}
                  onClick={() => onSetPaymentMode(value)}
                >
                  <Icon className="size-4" />
                  <span className="max-w-full truncate px-0.5">{label}</span>
                </button>
              ))}
            </div>

            <div className="flex-none border-t border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => onSetPaymentDate(event.target.value)}
                  className="h-10"
                />
                {paymentDateIsBackdated ? (
                  <span className="rounded bg-warning-soft px-2 py-1 text-[10px] font-semibold text-warning-soft-foreground">
                    BACKDATED
                  </span>
                ) : null}
              </div>
            </div>

            {formError ? (
              <p className="flex-none px-3 py-1 text-xs text-destructive" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="flex-none px-3 pt-2" style={{ paddingBottom: 'calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)' }}>
              <Button
                type="button"
                variant="accent"
                size="lg"
                fullWidth
                className="h-14 rounded-xl text-base font-semibold"
                disabled={confirmDisabled || !draftValidationOk || isLockedAfterSuccess || studentSummaryLoading}
                onClick={onOpenConfirm}
              >
                {paymentAmountInput
                  ? `Collect ${formatInr(Number(paymentAmountInput))} · ${
                      paymentModeOptions.find((option) => option.value === paymentMode)?.label ?? ""
                    }`.trimEnd()
                  : "Enter amount"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(sheet, document.body);
}
