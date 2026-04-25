"use client";

import { useActionState } from "react";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { AutoSubmitForm } from "@/components/office/auto-submit-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INITIAL_LEDGER_ADJUSTMENT_ACTION_STATE,
  type LedgerAdjustmentActionState,
  type LedgerPageData,
} from "@/lib/ledger/types";
import { formatInr } from "@/lib/helpers/currency";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const adjustmentTypeOptions: Array<{ value: string; label: string }> = [
  { value: "correction", label: "Correction" },
  { value: "reversal", label: "Reversal" },
  { value: "discount", label: "Discount" },
  { value: "writeoff", label: "Write-off" },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function AdjustmentNotice({ state }: { state: LedgerAdjustmentActionState }) {
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

type LedgerClientProps = {
  data: LedgerPageData;
  canAddAdjustments: boolean;
  submitLedgerAdjustmentAction: (
    previous: LedgerAdjustmentActionState,
    formData: FormData,
  ) => Promise<LedgerAdjustmentActionState>;
};

export function LedgerClient({ data, canAddAdjustments, submitLedgerAdjustmentAction }: LedgerClientProps) {
  const [state, formAction, pending] = useActionState(
    submitLedgerAdjustmentAction,
    INITIAL_LEDGER_ADJUSTMENT_ACTION_STATE,
  );

  const selectedStudent = data.selectedStudent;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Search student"
        description="Use name or SR no to open one student's payment and adjustment timeline."
      >
        <AutoSubmitForm action="/protected/ledger" method="get" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="ledger-search-query">Search student</Label>
              <Input
                id="ledger-search-query"
                name="query"
                defaultValue={data.searchQuery}
                placeholder="Student name or SR no"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="ledger-student-id">Student</Label>
              <select
                id="ledger-student-id"
                name="studentId"
                defaultValue={selectedStudent?.id ?? ""}
                className={`${selectClassName} mt-2`}
              >
                <option value="">Select student</option>
                {data.studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName} ({student.admissionNo}) - {student.classLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AutoSubmitForm>
      </SectionCard>

      {!selectedStudent ? (
        <SectionCard
          title="Select a student to continue"
          description="Payment history, adjustments, and correction form will appear after selecting a student."
        >
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Select a student to view payment history and corrections.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Payment rows"
              value={selectedStudent.paymentOptions.length.toString()}
              hint="Total posted rows (newest shown first in table)"
            />
            <MetricCard
              title="Total payments"
              value={formatInr(selectedStudent.totalPayments)}
              hint="Original posted payments only"
            />
            <MetricCard
              title="Adjustment net"
              value={formatInr(selectedStudent.totalAdjustmentNet)}
              hint="Positive reduces due, negative increases due"
            />
            <MetricCard
              title="Adjustments"
              value={selectedStudent.adjustments.length.toString()}
              hint={`Credit ${formatInr(selectedStudent.totalCreditAdjustments)} | Debit ${formatInr(selectedStudent.totalDebitAdjustments)}`}
            />
          </section>

          <SectionCard
            title="Filter entries"
            description="Use these filters to narrow the visible payment and adjustment rows for this student."
          >
            <AutoSubmitForm action="/protected/ledger" method="get" className="space-y-4">
              <input type="hidden" name="studentId" value={selectedStudent.id} />
              <input type="hidden" name="query" value={data.searchQuery} />
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div>
                  <Label htmlFor="ledger-entry-query">Search inside ledger</Label>
                  <Input
                    id="ledger-entry-query"
                    name="entryQuery"
                    defaultValue={data.entryQuery}
                    className="mt-2"
                    placeholder="Receipt no, installment, reason, notes"
                  />
                </div>
                <div>
                  <Label htmlFor="ledger-entry-filter">Entry type</Label>
                  <select
                    id="ledger-entry-filter"
                    name="entryFilter"
                    defaultValue={data.entryFilter}
                    className={`${selectClassName} mt-2`}
                  >
                    <option value="all">All</option>
                    <option value="payments">Payments only</option>
                    <option value="adjustments">Adjustments only</option>
                  </select>
                </div>
              </div>
            </AutoSubmitForm>
          </SectionCard>

          <SectionCard
            title="Payment history"
            description="Posted payments and linked corrections in newest-first order."
            actions={<StatusBadge label="Newest first" tone="good" />}
          >
            {selectedStudent.payments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No payment rows found for current filter.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Posted on</th>
                      <th className="px-4 py-3">Receipt</th>
                      <th className="px-4 py-3">Installment</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Mode / ref</th>
                      <th className="px-4 py-3">Counter notes</th>
                      <th className="px-4 py-3">Linked adjustments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStudent.payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-slate-100 align-top text-slate-700">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{payment.receiptNumber}</div>
                          <div className="text-xs text-slate-500">Payment date: {formatDate(payment.paymentDate)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{payment.installmentLabel}</div>
                          <div className="text-xs text-slate-500">Due: {formatDate(payment.dueDate)}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{formatInr(payment.paymentAmount)}</td>
                        <td className="px-4 py-3">
                          <div className="capitalize">{payment.paymentMode.replace("_", " ")}</div>
                          <div className="text-xs text-slate-500">
                            {payment.referenceNumber ? `Ref: ${payment.referenceNumber}` : "No reference number"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{payment.notes || "-"}</td>
                        <td className="px-4 py-3">
                          {payment.adjustmentCount === 0 ? (
                            <span className="text-slate-500">None</span>
                          ) : (
                            <div>
                              <p className="font-medium text-slate-900">
                                {payment.adjustmentCount} entry{payment.adjustmentCount > 1 ? "ies" : ""}
                              </p>
                              <p className="text-xs text-slate-500">
                                Net impact: {formatInr(payment.adjustmentNetDelta)}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="4. Add adjustment"
            description="Add a positive or negative correction linked to one payment row. A reason is mandatory for audit clarity."
            actions={<StatusBadge label="No payment edits" tone="warning" />}
          >
            {!canAddAdjustments ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                You can view ledger history but cannot add adjustments with your current role.
              </p>
            ) : null}
            <form action={formAction} className="space-y-4">
              <AdjustmentNotice state={state} />
              <fieldset
                disabled={!canAddAdjustments}
                className="space-y-4 disabled:opacity-70"
              >
                <input type="hidden" name="studentId" value={selectedStudent.id} />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <Label htmlFor="ledger-payment-id">Linked payment row</Label>
                    <select
                      id="ledger-payment-id"
                      name="paymentId"
                      className={`${selectClassName} mt-2`}
                      required
                    >
                      <option value="">Select payment row</option>
                      {selectedStudent.paymentOptions.map((payment) => (
                        <option key={payment.id} value={payment.id}>
                          {payment.receiptNumber} | {payment.installmentLabel} | {formatInr(payment.paymentAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ledger-adjustment-type">Adjustment category</Label>
                    <select
                      id="ledger-adjustment-type"
                      name="adjustmentType"
                      className={`${selectClassName} mt-2`}
                      defaultValue="correction"
                      required
                    >
                      {adjustmentTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ledger-direction">Impact on due amount</Label>
                    <select
                      id="ledger-direction"
                      name="direction"
                      className={`${selectClassName} mt-2`}
                      defaultValue="reduce_due"
                      required
                    >
                      <option value="reduce_due">Positive (+): reduce due</option>
                      <option value="increase_due">Negative (-): increase due</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ledger-adjustment-amount">Amount</Label>
                    <Input
                      id="ledger-adjustment-amount"
                      name="amount"
                      type="number"
                      min={1}
                      className="mt-2"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="ledger-adjustment-reason">Reason</Label>
                  <textarea
                    id="ledger-adjustment-reason"
                    name="reason"
                    className={`${textAreaClassName} mt-2`}
                    placeholder="Why this correction is needed"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="ledger-adjustment-notes">Notes (optional)</Label>
                  <textarea
                    id="ledger-adjustment-notes"
                    name="notes"
                    className={`${textAreaClassName} mt-2`}
                    placeholder="Any desk note for future verification"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <Button type="submit" disabled={!canAddAdjustments || pending || selectedStudent.paymentOptions.length === 0}>
                    {pending ? "Saving adjustment..." : "Save adjustment"}
                  </Button>
                </div>
              </fieldset>
            </form>
          </SectionCard>

          <SectionCard
            title="5. Adjustment history"
            description="Adjustments are listed separately and linked back to original payment rows for clear verification."
            actions={
              <StatusBadge
                label={data.entryFilter === "payments" ? "Filtered out" : "Linked to payments"}
                tone={data.entryFilter === "payments" ? "neutral" : "good"}
              />
            }
          >
            {selectedStudent.adjustments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No adjustment rows found for current filter.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Added on</th>
                      <th className="px-4 py-3">Linked payment</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Impact</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Added by</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStudent.adjustments.map((adjustment) => (
                      <tr key={adjustment.id} className="border-t border-slate-100 align-top text-slate-700">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(adjustment.createdAt)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{adjustment.receiptNumber}</p>
                          <p className="text-xs text-slate-500">
                            {adjustment.installmentLabel} | Payment {formatInr(adjustment.paymentAmount)}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize">{adjustment.adjustmentType}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {adjustment.amountDelta > 0 ? "Positive (+)" : "Negative (-)"} {formatInr(adjustment.amountDelta)}
                        </td>
                        <td className="px-4 py-3">{adjustment.reason}</td>
                        <td className="px-4 py-3">
                          {adjustment.createdByName ?? adjustment.createdBy ?? "Staff user"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{adjustment.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
