"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInr } from "@/lib/helpers/currency";
import { sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";
import type {
  InstallmentBalanceItem,
  PaymentStudentIndexItem,
  SelectedStudentSummary,
} from "@/lib/payments/types";
import { cn } from "@/lib/utils";

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
  quickAmounts: Array<{ key: string; label?: string; amount: number | null; disabled: boolean }>;
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
  quickAmounts,
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
  const [breakdownExpanded, setBreakdownExpanded] = React.useState(false);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const hasFocusedRef = React.useRef(false);

  const displayName = selectedStudent?.fullName ?? selectedStudentIndexItem?.fullName ?? "";
  const displayClass = selectedStudent?.classLabel ?? selectedStudentIndexItem?.classLabel ?? "";
  const displayAdmNo = selectedStudent?.admissionNo ?? selectedStudentIndexItem?.admissionNo ?? "";

  // Reset focus guard and breakdown when entering payment-entry view
  React.useEffect(() => {
    if (view === "payment-entry") {
      hasFocusedRef.current = false;
      setBreakdownExpanded(false);
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

  if (view === null) return null;

  const selectedClassLabel = classOptions.find((classOption) => classOption.id === selectedClassId)?.label ?? "All classes";
  const showTodayReceiptWarning = latestReceiptToday && latestReceiptToday.id !== dismissedTodayReceiptId;
  const disablePaymentActions = isLockedAfterSuccess || !canPost;

  return (
    <div className="fixed inset-0 z-[45] md:hidden">
      {view !== "payment-entry" ? (
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      ) : null}

      {view === "class-picker" ? (
        <div className="absolute bottom-0 left-0 right-0 max-h-[88svh] rounded-t-2xl border-t border-border bg-card flex flex-col overflow-hidden">
          <SheetHandle swipeHandlers={classPickerSwipe} />
          <h2 className="px-4 pb-2 text-base font-semibold text-foreground">Collect Payment</h2>
          <div className="flex-none px-3 pb-2">
            <Input
              placeholder="Search any student by name or SR no…"
              value={studentSearchQuery}
              onChange={(event) => onStudentSearchChange(event.target.value)}
              autoComplete="off"
              aria-label="Search students directly"
            />
          </div>

          {studentSearchQuery.trim().length > 0 ? (
            <div
              className="flex-1 overflow-y-auto px-3 pb-4"
              style={{ paddingBottom: "calc(var(--mobile-bottom-nav-offset, 4.25rem) + 0.5rem)" }}
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
                  {filteredStudents.slice(0, 20).map((student) => {
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
          {(studentSummaryLoading || previewLoading) ? (
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

          {/* Collapsed summary — always visible */}
          <div className="flex-none border-b border-border px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-4 text-sm">
                <span>
                  <span className="text-muted-foreground font-medium">Pending </span>
                  <span className="font-bold tabular-nums text-foreground">{formatInr(previewTotalPending)}</span>
                </span>
                {previewOverdueAmount > 0 ? (
                  <span>
                    <span className="text-muted-foreground font-medium">Overdue </span>
                    <span className="font-semibold tabular-nums text-destructive">{formatInr(previewOverdueAmount)}</span>
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                onClick={() => setBreakdownExpanded((prev) => !prev)}
              >
                {breakdownExpanded ? "Hide ↑" : "Details ↓"}
              </button>
            </div>

            {/* Expanded breakdown */}
            {breakdownExpanded ? (
              <div className="mt-2 space-y-1 max-h-[20svh] overflow-y-auto pr-1">
                {previewLoading ? (
                  <p className="text-xs text-muted-foreground">Loading breakdown...</p>
                ) : previewBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No installment dues found.</p>
                ) : (
                  previewBreakdown.map((item) => (
                    <div key={item.installmentId} className="flex items-center justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
                      <span className="text-muted-foreground">{item.installmentLabel} · {item.dueDate}</span>
                      <span className={cn(
                        "font-semibold tabular-nums",
                        item.outstandingAmount <= 0 ? "text-success-soft-foreground"
                          : item.balanceStatus === "overdue" ? "text-destructive"
                          : "text-foreground"
                      )}>
                        {item.outstandingAmount <= 0 ? "Paid" : formatInr(item.outstandingAmount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-0">
            {pendingLateFeeAmount > 0 ? (
              <label className="flex-none flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm text-foreground">
                <span>Waive late fee {formatInr(pendingLateFeeAmount)}</span>
                <input
                  type="checkbox"
                  className="size-5 rounded border-border-strong"
                  checked={waiveFullLateFee}
                  onChange={onToggleWaiveLateFee}
                />
              </label>
            ) : null}

            {studentSummaryLoading || previewLoading ? (
              <div className="px-3 py-3 border-b border-border space-y-3">
                <div className="flex gap-2">
                  <div className="h-16 flex-1 rounded-xl bg-surface-2 animate-pulse" />
                  <div className="h-16 flex-1 rounded-xl bg-surface-2 animate-pulse" />
                </div>
                <div className="h-16 w-full rounded-xl bg-surface-2 animate-pulse" />
                <div className="flex gap-1.5 overflow-x-auto py-1">
                  <div className="h-8 w-16 rounded-full bg-surface-2 animate-pulse" />
                  <div className="h-8 w-16 rounded-full bg-surface-2 animate-pulse" />
                  <div className="h-8 w-24 rounded-full bg-surface-2 animate-pulse" />
                </div>
              </div>
            ) : (
              <>
                {/* Primary amounts — Full Due and Next Installment as large tappable cards */}
                {(() => {
                  const fullDue = quickAmounts.find((q) => q.key === "full");
                  const nextInst = quickAmounts.find((q) => q.key === "next");
                  if (!fullDue && !nextInst) return null;
                  return (
                    <div className="flex gap-2 px-3 py-2 border-b border-border">
                      {fullDue && fullDue.amount !== null ? (
                        <button
                          type="button"
                          disabled={fullDue.disabled || disablePaymentActions}
                          onClick={() => onQuickAmount(fullDue.amount)}
                          className={cn(
                            "flex flex-1 flex-col items-center rounded-xl border py-3 transition-all active:scale-95 disabled:opacity-40",
                            paymentAmountInput === String(fullDue.amount)
                              ? "border-accent bg-accent/10 text-accent font-semibold"
                              : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
                          )}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Full Due</span>
                          <span className="text-lg font-bold tabular-nums">{formatInr(fullDue.amount)}</span>
                        </button>
                      ) : null}
                      {nextInst && nextInst.amount !== null ? (
                        <button
                          type="button"
                          disabled={nextInst.disabled || disablePaymentActions}
                          onClick={() => onQuickAmount(nextInst.amount)}
                          className={cn(
                            "flex flex-1 flex-col items-center rounded-xl border py-3 transition-all active:scale-95 disabled:opacity-40",
                            paymentAmountInput === String(nextInst.amount)
                              ? "border-accent bg-accent/10 text-accent font-semibold"
                              : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
                          )}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Next Installment</span>
                          <span className="text-lg font-bold tabular-nums">{formatInr(nextInst.amount)}</span>
                        </button>
                      ) : null}
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
                    <p className="text-center text-3xl font-bold text-accent pb-2">
                      {formatInr(Number(paymentAmountInput))}
                    </p>
                  ) : null}
                </div>

                <div className="flex-none flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
                  {quickAmounts.filter((q) => q.key !== "full" && q.key !== "next").map((qa) => (
                    <button
                      key={`mobile-sheet-${qa.key}`}
                      type="button"
                      disabled={qa.disabled || disablePaymentActions}
                      className="min-h-11 min-w-[4rem] shrink-0 rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm font-semibold text-foreground disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => onQuickAmount(qa.amount)}
                    >
                      {qa.key === "clear" ? qa.label ?? "Clear" : `${qa.label ?? qa.key} ${qa.amount ? formatInr(qa.amount) : ""}`}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex-none grid grid-cols-2 gap-2 border-t border-border px-3 py-2">
              {paymentModeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-medium transition-colors",
                    paymentMode === value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-2 text-muted-foreground",
                  )}
                  onClick={() => onSetPaymentMode(value)}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
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
                {paymentAmountInput ? `Review Receipt · ${formatInr(Number(paymentAmountInput))}` : "Enter amount"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
