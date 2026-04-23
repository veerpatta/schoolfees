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
import { buildPaymentDeskSuccessActions } from "@/lib/payments/workflow";
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

  const selectedStudent = data.selectedStudent;
  const paymentAmount = Number(paymentAmountInput) || 0;

  const allocationPreview = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    return buildPaymentAllocation(selectedStudent.breakdown, paymentAmount);
  }, [paymentAmount, selectedStudent]);

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
        })
      : [];

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

      <SectionCard
        title="Class shortcuts"
        description="Jump straight to one class when counter work is happening class-wise."
      >
        <ClassTabs
          basePath="/protected/payments"
          classOptions={classOptions}
          activeClassId={data.classId}
        />
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Today at the desk"
          description="Keep the current counter total and recent receipt shortcuts close to the posting form."
        >
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
                  <Link href="/protected/dues?view=receipts_today">Today&apos;s receipts</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/protected/dues?view=collection_today">Today&apos;s summary</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
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
        </SectionCard>

        <SectionCard
          title="Continue task"
          description="Resume the last student or receipt without searching again."
        >
          <OfficeRecentActions />
        </SectionCard>
      </section>

      <SectionCard
        title="1. Choose student"
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
                    {student.fullName} ({student.admissionNo}) - {student.classLabel}
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            title="2. Current fee breakdown"
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
                    <th className="px-4 py-3">Amount due</th>
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
                      <td className="px-4 py-3">{formatInr(item.amountDue)}</td>
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
            title="3. Enter and save payment"
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
                  <p className="font-semibold">Counter entry saved.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {successActions.map((action) => (
                      <Button key={`${action.label}-${action.href}`} asChild size="sm" variant="outline">
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    ))}
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
                      defaultValue={new Date().toISOString().slice(0, 10)}
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
                      onChange={(event) => setPaymentAmountInput(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-mode">Payment mode</Label>
                    <select
                      id="payment-mode"
                      name="paymentMode"
                      className={`${selectClassName} mt-2`}
                      defaultValue="cash"
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
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-received-by">Received by</Label>
                    <Input
                      id="payment-received-by"
                      name="receivedBy"
                      className="mt-2"
                      defaultValue={defaultReceivedBy}
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
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Installment allocation preview</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Amount is auto-allocated from oldest pending installment to newest.
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

                <div className="flex items-center justify-end">
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
                    {pending ? "Saving payment..." : "Save payment and generate receipt"}
                  </Button>
                </div>
              </fieldset>
            </form>
          </SectionCard>
        </>
      )}
    </div>
  );
}
