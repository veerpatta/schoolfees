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

import { MobileNumPad } from "./mobile-numpad";

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
  onSelectStudent: (id: string) => void;
  onPrefetchStudent: (id: string) => void;
  studentListRef: React.RefObject<HTMLDivElement | null>;
  studentSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onStudentListScroll: (scrollTop: number) => void;
  studentComboboxRowHeight: number;
  studentComboboxPanelHeight: number;
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
  referenceNumber: string;
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
  onNumpadKey: (key: string) => void;
  onSetPaymentMode: (mode: string) => void;
  onSetReferenceNumber: (ref: string) => void;
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
  showReferenceField: boolean;
  previewLoading: boolean;
};

function studentLabel(student: PaymentStudentIndexItem) {
  return `${student.fullName} · SR ${student.admissionNo}`;
}

function SheetHandle() {
  return (
    <div className="flex-none flex justify-center py-2">
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
  onSelectStudent,
  onPrefetchStudent,
  studentListRef,
  studentSearchInputRef,
  onStudentListScroll,
  studentComboboxRowHeight,
  studentComboboxPanelHeight,
  studentListId,
  studentSummaryLoading,
  selectedStudent,
  previewTotalPending,
  previewOverdueAmount,
  previewNextDue,
  previewBreakdown,
  pendingLateFeeAmount,
  creditOrRefundAmount,
  paymentAmountInput,
  paymentMode,
  referenceNumber,
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
  onNumpadKey,
  onSetPaymentMode,
  onSetReferenceNumber,
  onSetPaymentDate,
  onToggleWaiveLateFee,
  onQuickAmount,
  onOpenConfirm,
  onChangeStudent,
  paymentModeOptions,
  showReferenceField,
  previewLoading,
}: MobilePaymentFlowSheetProps) {
  if (view === null) return null;

  const selectedClassLabel = classOptions.find((classOption) => classOption.id === selectedClassId)?.label ?? "All classes";
  const sanitizedPaymentAmount = sanitizeDecimalInput(paymentAmountInput);
  const amountValue = Number(sanitizedPaymentAmount) || 0;
  const showTodayReceiptWarning = latestReceiptToday && latestReceiptToday.id !== dismissedTodayReceiptId;
  const disablePaymentActions = isLockedAfterSuccess || !canPost;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {view !== "payment-entry" ? (
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      ) : null}

      {view === "class-picker" ? (
        <div className="absolute bottom-0 left-0 right-0 max-h-[70svh] rounded-t-2xl border-t border-border bg-card flex flex-col overflow-y-auto">
          <SheetHandle />
          <h2 className="px-4 pb-2 text-base font-semibold text-foreground">Select Class</h2>
          <div className="grid grid-cols-2 gap-2 p-4">
            {classOptions.map((classOption) => {
              const selected = classOption.id === selectedClassId;

              return (
                <button
                  key={classOption.id}
                  type="button"
                  className={cn(
                    "min-h-[52px] w-full rounded-xl border px-3 text-sm font-semibold transition-colors",
                    selected
                      ? "border-accent bg-accent-soft text-accent-soft-foreground"
                      : "border-border bg-card hover:bg-surface-2 text-foreground",
                  )}
                  onClick={() => onSelectClass(classOption.id)}
                >
                  {classOption.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "student-picker" ? (
        <div className="absolute bottom-0 left-0 right-0 h-[85svh] rounded-t-2xl border-t border-border bg-card flex flex-col">
          <SheetHandle />
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
              autoFocus
            />
          </div>
          {!studentSearchQuery && recentStudents.length > 0 ? (
            <div className="flex-none px-3 pb-2">
              <p className="mb-1.5 text-[10px] uppercase text-muted-foreground">Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recentStudents.map((student) => (
                  <button
                    key={`recent-${student.id}`}
                    type="button"
                    className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground"
                    onClick={() => onSelectStudent(student.id)}
                  >
                    {student.fullName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div
            id={studentListId}
            role="listbox"
            ref={studentListRef}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ height: `${studentComboboxPanelHeight}px` }}
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
                      onMouseEnter={() => onPrefetchStudent(student.id)}
                      onTouchStart={() => onPrefetchStudent(student.id)}
                      onClick={() => onSelectStudent(student.id)}
                    >
                      {studentLabel(student)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {view === "payment-entry" ? (
        <div className="absolute inset-0 bg-background flex flex-col">
          <SheetHandle />
          <div className="flex-none px-4 py-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedStudent?.fullName ?? "Select student"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedStudent ? `SR ${selectedStudent.admissionNo} · ${selectedStudent.classLabel}` : selectedClassLabel}
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

          <div className="flex-[2] min-h-0 overflow-y-auto border-b border-border px-3 py-2">
            {previewLoading ? (
              <p className="rounded-lg bg-surface-2 px-3 py-3 text-sm text-muted-foreground">Loading breakdown...</p>
            ) : previewBreakdown.length === 0 ? (
              <p className="rounded-lg bg-surface-2 px-3 py-3 text-sm text-muted-foreground">No installment dues found.</p>
            ) : (
              <div className="space-y-1.5">
                {previewBreakdown.map((installment) => {
                  const paid = installment.outstandingAmount <= 0;
                  const overdue = installment.balanceStatus === "overdue";

                  return (
                    <div key={installment.installmentId} className="flex items-center justify-between gap-3 rounded-lg bg-card px-2 py-1.5 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{installment.installmentLabel}</p>
                        <p className="text-[10px] text-muted-foreground">Due {installment.dueDate}</p>
                      </div>
                      <p
                        className={cn(
                          "shrink-0 font-semibold tabular-nums",
                          overdue ? "text-destructive" : paid ? "text-success-soft-foreground" : "text-foreground",
                        )}
                      >
                        {paid ? "Paid" : formatInr(installment.outstandingAmount)}
                      </p>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1 text-sm font-semibold">
                  <span className="text-muted-foreground">Total pending</span>
                  <span className="tabular-nums text-accent">{formatInr(previewTotalPending)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Overdue</span>
                  <span className="tabular-nums text-destructive">{formatInr(previewOverdueAmount)}</span>
                </div>
                {previewNextDue ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Next due</span>
                    <span className="tabular-nums text-foreground">
                      {previewNextDue.installmentLabel} · {formatInr(previewNextDue.outstandingAmount)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex-[3] min-h-0 flex flex-col overflow-y-auto">
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

            <div className="flex-none border-b border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div
                  aria-label="Payment amount"
                  className={cn(
                    "text-3xl font-bold tabular-nums text-foreground",
                    !sanitizedPaymentAmount && "text-muted-foreground",
                  )}
                >
                  {sanitizedPaymentAmount ? formatInr(amountValue) : "₹ 0"}
                </div>
                {remainingAfterPayment === 0 && sanitizedPaymentAmount ? (
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-soft-foreground">
                    Clears ✓
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex-none flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
              {quickAmounts.map((qa) => (
                <button
                  key={`mobile-sheet-${qa.key}`}
                  type="button"
                  disabled={qa.disabled || disablePaymentActions}
                  className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground disabled:pointer-events-none disabled:opacity-40"
                  onClick={() => onQuickAmount(qa.amount)}
                >
                  {qa.key === "clear" ? qa.label ?? "Clear" : `${qa.label ?? qa.key} ${qa.amount ? formatInr(qa.amount) : ""}`}
                </button>
              ))}
            </div>

            <MobileNumPad
              className="flex-1 min-h-0 p-2"
              onKey={onNumpadKey}
              disabled={disablePaymentActions}
            />

            <div className="flex-none grid grid-cols-4 gap-2 border-t border-border px-3 py-2">
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

            {showReferenceField ? (
              <div className="flex-none px-3 py-2">
                <Input
                  placeholder="UPI / bank ref — optional"
                  value={referenceNumber}
                  onChange={(event) => onSetReferenceNumber(event.target.value)}
                />
              </div>
            ) : null}

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

            <div className="flex-none px-3 pb-4 pt-2">
              <Button
                type="button"
                variant="accent"
                size="lg"
                fullWidth
                className="h-14 rounded-xl text-base font-semibold"
                disabled={confirmDisabled || !draftValidationOk || isLockedAfterSuccess}
                onClick={onOpenConfirm}
              >
                {sanitizedPaymentAmount ? `Review Receipt · ${formatInr(amountValue)}` : "Enter amount"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
