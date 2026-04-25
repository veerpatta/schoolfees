"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { AutoSubmitForm } from "@/components/office/auto-submit-form";
import { ClassTabs, OfficeRecentActions, OfficeRecentTracker, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildPaymentAllocation } from "@/lib/payments/allocation";
import { buildPaymentQuickAmounts } from "@/lib/payments/workflow";
import {
  buildPaymentConfirmationSummary,
  buildStudentSelectLabel,
  resetPaymentDraftForNextPayment,
  shouldBlockClientSubmission,
  validatePaymentDraft,
} from "@/lib/payments/payment-desk-workflow";
import type {
  InstallmentBalanceItem,
  PaymentEntryActionState,
  PaymentEntryPageData,
} from "@/lib/payments/types";
import { formatInr } from "@/lib/helpers/currency";

type PaymentEntryClientProps = {
  data: PaymentEntryPageData;
  canPost: boolean;
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

function createClientRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ActionNotice({ state }: { state: PaymentEntryActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={
        state.status === "error"
          ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          : state.status === "duplicate"
            ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      }
    >
      {state.message}
      {state.status === "error" && state.diagnostic ? (
        <details className="mt-2 rounded border border-red-200 bg-white/70 px-2 py-2 text-xs text-red-900">
          <summary className="cursor-pointer font-medium">Admin diagnostic</summary>
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
            <div>Database code: {state.diagnostic.rawRpcErrorCode ?? "None"}</div>
          </dl>
          {state.diagnostic.rawRpcErrorMessage ? (
            <p className="mt-2 break-words">Database message: {state.diagnostic.rawRpcErrorMessage}</p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export function PaymentEntryClient({
  data,
  canPost,
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
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateAwareBreakdown, setDateAwareBreakdown] = useState<InstallmentBalanceItem[] | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [paymentMode, setPaymentMode] = useState(data.modeOptions[0]?.value ?? "cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedBy, setReceivedBy] = useState(defaultReceivedBy);
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isLockedAfterSuccess, setIsLockedAfterSuccess] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(createClientRequestId);
  const submittingRef = useRef(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const selectedStudent = data.selectedStudent;
  const selectedStudentIssue = data.selectedStudentIssue;
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

  useEffect(() => {
    if (!selectedStudent) {
      setDateAwareBreakdown(null);
      setPreviewNotice(null);
      setPreviewUnavailable(false);
      return;
    }

    let isActive = true;
    const params = new URLSearchParams({
      studentId: selectedStudent.id,
      paymentDate,
    });

    setPreviewNotice("Refreshing pending amount for selected payment date...");

    fetch(`/protected/payments/preview?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to refresh payment preview.");
        }

        return response.json() as Promise<{ rows: InstallmentBalanceItem[]; notice?: string | null }>;
      })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setDateAwareBreakdown(payload.rows);
        setPreviewUnavailable(false);
        setPreviewNotice(
          payload.notice ?? "Pending amount and late fee are recalculated for the selected payment date.",
        );
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setDateAwareBreakdown(null);
        setPreviewUnavailable(true);
        setPreviewNotice(error instanceof Error ? error.message : "Unable to refresh payment preview.");
      });

    return () => {
      isActive = false;
    };
  }, [paymentDate, selectedStudent]);

  const allocationPreview = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentAllocation(previewBreakdown, paymentAmount);
  }, [paymentAmount, previewBreakdown, selectedStudent]);
  const quickAmounts = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentQuickAmounts({
      totalPending: previewTotalPending,
      nextDueAmount: previewNextDue?.outstandingAmount ?? null,
      overdueAmount: previewOverdueAmount,
    });
  }, [previewNextDue, previewOverdueAmount, previewTotalPending, selectedStudent]);

  const allocatedPreviewTotal = allocationPreview.reduce(
    (sum, item) => sum + item.allocatedAmount,
    0,
  );
  const unallocatedAmount = Math.max(paymentAmount - allocatedPreviewTotal, 0);
  const receiptHref = state.receiptId ? `/protected/receipts/${state.receiptId}` : null;
  const selectedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === paymentMode)?.label ?? paymentMode;
  const draftValidation = validatePaymentDraft({
    selectedStudent,
    amountInput: paymentAmountInput,
    paymentDate,
    paymentMode,
    paymentModeLabel: selectedPaymentModeLabel,
    referenceNumber,
    receivedBy,
    previewTotalPending,
  });
  const confirmationSummary = buildPaymentConfirmationSummary({
    selectedStudent,
    amountInput: paymentAmountInput,
    paymentDate,
    paymentMode,
    paymentModeLabel: selectedPaymentModeLabel,
    referenceNumber,
    receivedBy,
    previewTotalPending,
  });
  const remainingAfterPayment =
    draftValidation.ok ? draftValidation.remainingBalance : previewTotalPending;
  const latestReceipt = data.recentReceipts[0] ?? null;
  const latestPayment = state.status === "success" && state.receiptId && state.receiptNumber
    ? {
        id: state.receiptId,
        receiptNumber: state.receiptNumber,
        studentLabel: selectedStudent
          ? `${selectedStudent.fullName} (${selectedStudent.admissionNo})`
          : "Selected student",
        totalAmount: state.amountReceived ?? paymentAmount,
        paymentMode: selectedPaymentModeLabel,
        paymentDate: state.paymentDate ?? paymentDate,
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
    state.status === "success" && state.receiptNumber && selectedStudent
      ? `Dear Parent, payment of ${formatInr(paymentAmount)} has been received for ${selectedStudent.fullName} (${selectedStudent.classLabel}). Receipt No: ${state.receiptNumber}. Thank you - Shri Veer Patta Senior Secondary School.`
      : "";

  useEffect(() => {
    if (selectedStudent) {
      amountInputRef.current?.focus();
    }
  }, [selectedStudent?.id, selectedStudent]);

  useEffect(() => {
    submittingRef.current = false;

    if (state.status === "success") {
      setIsConfirmOpen(false);
      setIsSuccessOpen(true);
      setIsDuplicateOpen(false);
      setIsLockedAfterSuccess(true);
      setFormError(null);
      return;
    }

    if (state.status === "duplicate") {
      setIsConfirmOpen(false);
      setIsSuccessOpen(false);
      setIsDuplicateOpen(true);
      setFormError(null);
      return;
    }

    if (state.status === "error") {
      setIsConfirmOpen(false);
      setFormError(state.message);
    }
  }, [state]);

  function openConfirmationDialog() {
    const validation = validatePaymentDraft({
      selectedStudent,
      amountInput: paymentAmountInput,
      paymentDate,
      paymentMode,
      paymentModeLabel: selectedPaymentModeLabel,
      referenceNumber,
      receivedBy,
      previewTotalPending,
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
    setReferenceNumber(resetValues.referenceNumber);
    setRemarks(resetValues.remarks);
    setPaymentMode(resetValues.paymentMode as typeof paymentMode);
    setReceivedBy(resetValues.receivedBy);
    setClientRequestId(createClientRequestId());
    setIsLockedAfterSuccess(false);
    setIsSuccessOpen(false);
    setIsDuplicateOpen(false);
    setCopyStatus("idle");
  }

  return (
    <div className="space-y-6">
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
          state.status === "success" && state.receiptId && state.receiptNumber && state.studentId
            ? {
                id: state.receiptId,
                receiptNumber: state.receiptNumber,
                studentId: state.studentId,
              }
            : undefined
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="1. Select Class"
          description="Filter the counter desk by class first, then pick the student."
        >
          <div className="space-y-4">
            <ClassTabs
              basePath="/protected/payments"
              classOptions={classOptions}
              activeClassId={data.classId}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Today&apos;s collection
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {formatInr(data.todayCollection.totalAmount)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {data.todayCollection.receiptCount} receipt
                  {data.todayCollection.receiptCount === 1 ? "" : "s"} posted today.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
              </div>
            </div>

            <details className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
                Recent receipts
              </summary>
              <div className="border-t border-slate-200 bg-white p-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                          <td colSpan={4} className="px-4 py-5 text-center text-slate-500">
                            No recent receipts yet.
                          </td>
                        </tr>
                      ) : (
                        data.recentReceipts.map((receipt) => (
                          <tr key={receipt.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-900">{receipt.receiptNumber}</td>
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
            </details>
          </div>
        </SectionCard>

        <SectionCard
          title="Latest payment"
          description="Small confirmation area for the last receipt saved at the desk."
        >
          {latestPayment ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
              <p className="font-semibold">{latestPayment.receiptNumber}</p>
              <div className="mt-2 grid gap-1 text-slate-700">
                <span>{latestPayment.studentLabel}</span>
                <span>{formatInr(latestPayment.totalAmount)} by {latestPayment.paymentMode}</span>
                <span>{latestPayment.createdAt ?? latestPayment.paymentDate}</span>
              </div>
              <div className="mt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/protected/receipts/${latestPayment.id}`}>Open receipt</Link>
                </Button>
              </div>
            </div>
          ) : (
            <OfficeRecentActions />
          )}
        </SectionCard>
      </section>

      <SectionCard
        title="2. Select Student"
        description="Use SR no, student name, phone number, or receipt number to reach the right student quickly."
      >
        <AutoSubmitForm action="/protected/payments" method="get" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data.classId ? <input type="hidden" name="classId" value={data.classId} /> : null}
            <div>
              <Label htmlFor="payment-student-query">Search</Label>
              <Input
                id="payment-student-query"
                name="query"
                defaultValue={data.searchQuery}
                placeholder="SR no, student, phone, or receipt no"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="payment-student-id">Student</Label>
              <select
                id="payment-student-id"
                name="studentId"
                defaultValue={selectedStudent?.id ?? ""}
                className={`${selectClassName} mt-2`}
              >
                <option value="">Select student</option>
                {data.studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {buildStudentSelectLabel(student)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedStudent ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              Selected student: <span className="font-semibold">{selectedStudent.fullName}</span>{" "}
              ({selectedStudent.admissionNo}) - {selectedStudent.classLabel}
            </div>
          ) : null}
        </AutoSubmitForm>
      </SectionCard>

      {workflowGuard ? (
        <WorkflowGuard
          title={workflowGuard.title}
          detail={workflowGuard.detail}
          actionLabel={workflowGuard.actionLabel}
          actionHref={workflowGuard.actionHref}
        />
      ) : null}

      {selectedStudentIssue && !selectedStudent ? (
        <SectionCard
          title={selectedStudentIssue.title}
          description={selectedStudentIssue.detail}
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
      ) : !selectedStudent ? (
        <SectionCard
          title="Choose a student to continue"
          description="Dues, installment breakup, and the payment form will appear after a student is selected."
        >
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Search by SR no, student name, phone number, or receipt number, then continue with that student.
          </p>
        </SectionCard>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {data.policyNote}
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
          </section>

          <SectionCard
            title="3. Student Fee Summary"
            description="Desk view for parent contact, workbook status, and route before posting the next receipt."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Student status
                </div>
                <div className="mt-2 font-medium text-slate-900">
                  {selectedStudent.studentStatusLabel}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Transport route
                </div>
                <div className="mt-2 font-medium text-slate-900">
                  {selectedStudent.transportRouteLabel}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Father
                </div>
                <div className="mt-2 font-medium text-slate-900">
                  {selectedStudent.fatherName ?? "Not set"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Phone
                </div>
                <div className="mt-2 font-medium text-slate-900">
                  {selectedStudent.fatherPhone ?? selectedStudent.motherPhone ?? "Not set"}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="4. Installment Dues"
            description="Review installment-level dues and payment status before saving the next receipt."
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
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                    <tr key={item.installmentId} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3">{item.installmentLabel}</td>
                      <td className="px-4 py-3">{item.dueDate}</td>
                      <td className="px-4 py-3">{formatInr(item.amountDue - item.finalLateFee)}</td>
                      <td className="px-4 py-3">{formatInr(item.finalLateFee)}</td>
                      <td className="px-4 py-3">{formatInr(item.paymentsTotal)}</td>
                      <td className="px-4 py-3">{formatInr(item.adjustmentsTotal)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
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

          <SectionCard
            title="5. Collect Payment"
            description="Payments are append-only. If correction is needed later, use adjustment entries instead of editing history."
            actions={<ValueStatePill tone="locked">Locked history after posting</ValueStatePill>}
          >
            {!canPost ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {workflowGuard
                  ? workflowGuard.detail
                  : "You have view-only access for payment entry. Contact admin staff for posting access."}
              </p>
            ) : null}
            <form
              action={formAction}
              className="space-y-4"
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
              }}
            >
              <ActionNotice state={state} />
              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              ) : null}
              <fieldset
                disabled={!canPost || isLockedAfterSuccess}
                className="space-y-4 disabled:opacity-70"
              >
                <input type="hidden" name="studentId" value={selectedStudent.id} />
                <input type="hidden" name="clientRequestId" value={clientRequestId} />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      className="mt-2"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-amount">Payment amount</Label>
                    <Input
                      id="payment-amount"
                      name="paymentAmount"
                      type="number"
                      min={1}
                      max={previewTotalPending}
                      className="mt-2"
                      value={paymentAmountInput}
                      onChange={(event) => {
                        setPaymentAmountInput(event.target.value);
                        setFormError(null);
                      }}
                      required
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickAmounts.map((quickAmount) => (
                        <Button
                          key={quickAmount.key}
                          type="button"
                          size="sm"
                          variant={quickAmount.key === "custom" ? "ghost" : "outline"}
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
                    <Label htmlFor="payment-mode">Payment mode</Label>
                    <select
                      id="payment-mode"
                      name="paymentMode"
                      className={`${selectClassName} mt-2`}
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
                  <div>
                    <Label htmlFor="payment-reference-number">Reference number</Label>
                    <Input
                      id="payment-reference-number"
                      name="referenceNumber"
                      className="mt-2"
                      placeholder="UPI/cheque/txn ref"
                      value={referenceNumber}
                      onChange={(event) => {
                        setReferenceNumber(event.target.value);
                        setFormError(null);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-received-by">Received by</Label>
                    <Input
                      id="payment-received-by"
                      name="receivedBy"
                      className="mt-2"
                      value={receivedBy}
                      onChange={(event) => {
                        setReceivedBy(event.target.value);
                        setFormError(null);
                      }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="payment-remarks">Remarks</Label>
                  <textarea
                    id="payment-remarks"
                    name="remarks"
                    className={`${textAreaClassName} mt-2`}
                    placeholder="Optional desk remarks"
                    value={remarks}
                    onChange={(event) => {
                      setRemarks(event.target.value);
                      setFormError(null);
                    }}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Installment allocation preview</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Amount is auto-allocated from oldest pending installment to newest. Final late fee and pending amount are recalculated for the selected payment date.
                  </p>
                  {previewNotice ? (
                    <p
                      className={
                        previewUnavailable
                          ? "mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                          : "mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900"
                      }
                    >
                      {previewNotice}
                    </p>
                  ) : null}

                  {allocationPreview.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">
                      Enter a payment amount to preview allocation.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full min-w-[600px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                            <tr key={item.installmentId} className="border-t border-slate-100">
                              <td className="px-3 py-2">{item.installmentLabel}</td>
                              <td className="px-3 py-2">{item.dueDate}</td>
                              <td className="px-3 py-2">{formatInr(item.outstandingBefore)}</td>
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {formatInr(item.allocatedAmount)}
                              </td>
                              <td className="px-3 py-2">{formatInr(item.outstandingAfter)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-700">
                    <span>Preview allocated: {formatInr(allocatedPreviewTotal)}</span>
                    <span>Unallocated: {formatInr(unallocatedAmount)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    disabled={
                      !canPost ||
                      isLockedAfterSuccess ||
                      previewUnavailable ||
                      previewTotalPending <= 0
                    }
                    onClick={openConfirmationDialog}
                  >
                    Confirm Payment
                  </Button>
                </div>
              </fieldset>

              {isConfirmOpen && confirmationSummary ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                  <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                    <h2 className="text-lg font-semibold text-slate-950">Confirm Payment</h2>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <span>Student name: {confirmationSummary.studentName}</span>
                      <span>SR/admission no: {confirmationSummary.admissionNo}</span>
                      <span>Class: {confirmationSummary.classLabel}</span>
                      <span>Payment amount: {formatInr(confirmationSummary.amount)}</span>
                      <span>Payment date: {confirmationSummary.paymentDate}</span>
                      <span>Payment mode: {confirmationSummary.paymentModeLabel}</span>
                      <span>Reference number: {confirmationSummary.referenceNumber ?? "Not entered"}</span>
                      <span>Received by: {confirmationSummary.receivedBy}</span>
                      <span>Remaining balance: {formatInr(confirmationSummary.remainingBalance)}</span>
                    </div>
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      This will save the receipt once. Posted receipts stay in history.
                    </p>
                    <div className="mt-5 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsConfirmOpen(false)}
                        disabled={pending}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={pending || submittingRef.current}>
                        {pending ? "Posting payment..." : "Generate Receipt"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {isSuccessOpen && state.status === "success" && receiptHref ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                  <div className="w-full max-w-xl rounded-xl border border-emerald-200 bg-white p-5 shadow-xl">
                    <h2 className="text-lg font-semibold text-slate-950">Payment Successful</h2>
                    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      Receipt has been saved.
                    </p>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <span>Receipt number: {state.receiptNumber}</span>
                      <span>Student name: {selectedStudent.fullName}</span>
                      <span>Amount received: {formatInr(state.amountReceived ?? paymentAmount)}</span>
                      <span>Payment date: {state.paymentDate ?? paymentDate}</span>
                      <span>Payment mode: {selectedPaymentModeLabel}</span>
                      <span>Remaining balance: {formatInr(state.remainingBalance ?? remainingAfterPayment)}</span>
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button asChild variant="outline">
                        <Link href={receiptHref}>Print Receipt</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={receiptHref}>Open Receipt</Link>
                      </Button>
                      <Button type="button" onClick={handleCollectAnotherPayment}>
                        Collect Another Payment
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
                          {copyStatus === "copied" ? "Copied text" : "Copy confirmation text"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {isDuplicateOpen && state.status === "duplicate" && state.receiptId ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                  <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-5 shadow-xl">
                    <h2 className="text-lg font-semibold text-slate-950">
                      Similar payment already recorded
                    </h2>
                    <p className="mt-3 text-sm text-slate-700">{state.message}</p>
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Latest receipt: {state.receiptNumber}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/protected/receipts/${state.receiptId}`}>Open latest receipt</Link>
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
        </>
      )}
    </div>
  );
}
