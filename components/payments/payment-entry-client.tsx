"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ClassTabs, OfficeRecentActions, OfficeRecentTracker, ValueStatePill, WorkflowGuard } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildPaymentAllocation } from "@/lib/payments/allocation";
import {
  buildPaymentDeskSuccessActions,
  buildPaymentQuickAmounts,
} from "@/lib/payments/workflow";
import type {
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
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function ActionNotice({ state }: { state: PaymentEntryActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={
        state.status === "error"
          ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      }
    >
      {state.message}
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
}: PaymentEntryClientProps) {
  const [state, formAction, pending] = useActionState(
    submitPaymentEntryAction,
    initialState,
  );
  const [paymentAmountInput, setPaymentAmountInput] = useState("0");
  const [isReviewing, setIsReviewing] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState(data.modeOptions[0]?.value ?? "cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedBy, setReceivedBy] = useState(defaultReceivedBy);
  const [remarks, setRemarks] = useState("");

  const selectedStudent = data.selectedStudent;
  const paymentAmount = Number(paymentAmountInput) || 0;

  const allocationPreview = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentAllocation(selectedStudent.breakdown, paymentAmount);
  }, [paymentAmount, selectedStudent]);
  const quickAmounts = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentQuickAmounts({
      totalPending: selectedStudent.totalPending,
      nextDueAmount: selectedStudent.nextDueAmount,
      overdueAmount: selectedStudent.overdueAmount,
    });
  }, [selectedStudent]);

  const allocatedPreviewTotal = allocationPreview.reduce(
    (sum, item) => sum + item.allocatedAmount,
    0,
  );
  const unallocatedAmount = Math.max(paymentAmount - allocatedPreviewTotal, 0);
  const receiptHref = state.receiptId ? `/protected/receipts/${state.receiptId}` : null;
  const paymentSearchHref = data.classId
    ? `/protected/payments?classId=${data.classId}`
    : "/protected/payments";
  const successActions =
    state.status === "success" &&
    state.receiptId &&
    state.studentId
      ? buildPaymentDeskSuccessActions({
          receiptId: state.receiptId,
          studentId: state.studentId,
          nextPaymentHref: paymentSearchHref,
          transactionsHref: "/protected/transactions",
        })
      : [];
  const selectedPaymentModeLabel =
    data.modeOptions.find((modeOption) => modeOption.value === paymentMode)?.label ?? paymentMode;
  const whatsappCopy =
    state.status === "success" && state.receiptNumber && selectedStudent
      ? `Dear Parent, payment of ${formatInr(paymentAmount)} has been received for ${selectedStudent.fullName} (${selectedStudent.classLabel}). Receipt No: ${state.receiptNumber}. Thank you - Shri Veer Patta Senior Secondary School.`
      : "";

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
          title="Continue task"
          description="Resume the last student or receipt without searching again."
        >
          <OfficeRecentActions />
        </SectionCard>
      </section>

      <SectionCard
        title="2. Select Student"
        description="Use SR no, student name, phone number, or receipt number to reach the right student quickly."
      >
        <form action="/protected/payments" method="get" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
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
                required
              >
                <option value="">Select student</option>
                {data.studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName} ({student.admissionNo}) - {student.classLabel} - pending {formatInr(student.pendingAmount)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full md:w-auto">
                Continue with this student
              </Button>
            </div>
          </div>
        </form>
      </SectionCard>

      {workflowGuard ? (
        <WorkflowGuard
          title={workflowGuard.title}
          detail={workflowGuard.detail}
          actionLabel={workflowGuard.actionLabel}
          actionHref={workflowGuard.actionHref}
        />
      ) : null}

      {!selectedStudent ? (
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
              value={formatInr(selectedStudent.totalPending)}
              hint="Outstanding balance available for collection"
            />
            <MetricCard
              title="Overdue"
              value={formatInr(selectedStudent.overdueAmount)}
              hint="Due installments past their date"
            />
            <MetricCard
              title="Next due installment"
              value={selectedStudent.nextDueInstallmentLabel ?? "No pending dues"}
              hint={
                selectedStudent.nextDueDate && selectedStudent.nextDueAmount !== null
                  ? `${selectedStudent.nextDueDate} - ${formatInr(selectedStudent.nextDueAmount)}`
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
                <ValueStatePill tone="policy">Policy-driven</ValueStatePill>
                {selectedStudent.totalPending > 0 ? (
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
                  {selectedStudent.breakdown.map((item) => (
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
            <form action={formAction} className="space-y-4">
              <ActionNotice state={state} />
              {state.status === "success" && receiptHref ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                  <p className="font-semibold">Receipt generated.</p>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <span>Receipt: {state.receiptNumber}</span>
                    <span>Amount: {formatInr(paymentAmount)}</span>
                    <span>Student: {selectedStudent.fullName}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {successActions.map((action) => (
                      <Button key={`${action.label}-${action.href}`} asChild size="sm" variant="outline">
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    ))}
                    {whatsappCopy ? (
                      <Button
                        type="button"
                        size="sm"
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
              ) : null}
              <fieldset disabled={!canPost} className="space-y-4 disabled:opacity-70">
                <input type="hidden" name="studentId" value={selectedStudent.id} />

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
                        setIsReviewing(false);
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
                      max={selectedStudent.totalPending}
                      className="mt-2"
                      value={paymentAmountInput}
                      onChange={(event) => {
                        setPaymentAmountInput(event.target.value);
                        setIsReviewing(false);
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
                            setIsReviewing(false);
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
                        setIsReviewing(false);
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
                        setIsReviewing(false);
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
                        setIsReviewing(false);
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
                      setIsReviewing(false);
                    }}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Installment allocation preview</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Amount is auto-allocated from oldest pending installment to newest. Final saved allocation stays server-calculated if the payment date changes late-fee position.
                  </p>

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

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-950">6. Review & Confirm</p>
                  {isReviewing ? (
                    <div className="mt-3 space-y-3 text-sm text-blue-950">
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <span>Student: {selectedStudent.fullName}</span>
                        <span>SR no: {selectedStudent.admissionNo}</span>
                        <span>Class: {selectedStudent.classLabel}</span>
                        <span>Amount: {formatInr(paymentAmount)}</span>
                        <span>Mode: {selectedPaymentModeLabel}</span>
                        <span>Date: {paymentDate}</span>
                        <span>Allocated: {formatInr(allocatedPreviewTotal)}</span>
                        <span>Unallocated: {formatInr(unallocatedAmount)}</span>
                      </div>
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                        This will generate an append-only receipt and cannot be edited later.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-blue-900">
                      Review the amount, payment mode, date, and allocation before generating the receipt.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {!isReviewing ? (
                    <Button
                      type="button"
                      disabled={
                        !canPost ||
                        selectedStudent.totalPending <= 0 ||
                        paymentAmount <= 0 ||
                        paymentAmount > selectedStudent.totalPending
                      }
                      onClick={() => setIsReviewing(true)}
                    >
                      Review Payment
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={
                        !canPost ||
                        pending ||
                        selectedStudent.totalPending <= 0 ||
                        paymentAmount <= 0 ||
                        paymentAmount > selectedStudent.totalPending
                      }
                    >
                      {pending ? "Generating receipt..." : "Confirm & Generate Receipt"}
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          </SectionCard>
        </>
      )}
    </div>
  );
}
