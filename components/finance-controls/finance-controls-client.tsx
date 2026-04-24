"use client";

import { useActionState } from "react";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { FinanceControlsActionState } from "@/lib/finance-controls/types";
import {
  statusLabelForCashDeposit,
  statusLabelForClosure,
  statusLabelForReconciliation,
  statusToneForCashDeposit,
  statusToneForClosure,
  statusToneForReconciliation,
} from "@/lib/finance-controls/display";
import type {
  FinanceControlsPageData,
  FinanceCorrectionReviewRow,
  FinanceDayBookRow,
  FinanceRefundRequestRow,
} from "@/lib/finance-controls/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

type FinanceWorkflowAction = (
  previous: FinanceControlsActionState,
  formData: FormData,
) => Promise<FinanceControlsActionState>;

type FinanceFormAction = (formData: FormData) => void | Promise<void>;

type FinanceWorkflowActions = {
  submitCollectionCloseAction: FinanceWorkflowAction;
  submitRefundWorkflowAction: FinanceWorkflowAction;
  submitCorrectionReviewAction: FinanceWorkflowAction;
};

type FinanceControlsClientProps = {
  data: FinanceControlsPageData;
  canWrite: boolean;
  canApprove: boolean;
  initialActionState: FinanceControlsActionState;
  actions: FinanceWorkflowActions;
};

function ActionNotice({ state }: { state: FinanceControlsActionState }) {
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

function renderSummaryValue(value: number) {
  return formatInr(value);
}

function DayBookRowTag({ row }: { row: FinanceDayBookRow }) {
  return <StatusBadge label={row.statusLabel} tone={row.statusTone} />;
}

function RefundRowActions({
  row,
  canApprove,
  formAction,
}: {
  row: FinanceRefundRequestRow;
  canApprove: boolean;
  formAction: FinanceFormAction;
}) {
  if (row.status === "rejected" || row.status === "processed") {
    return (
      <StatusBadge
        label={row.status === "processed" ? "Processed" : "Rejected"}
        tone={row.status === "processed" ? "good" : "neutral"}
      />
    );
  }

  if (row.status === "pending_approval" && !canApprove) {
    return <StatusBadge label="Awaiting admin" tone="warning" />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {row.status === "pending_approval" ? (
        <>
          <form action={formAction}>
            <input type="hidden" name="workflowAction" value="approve_refund" />
            <input type="hidden" name="refundRequestId" value={row.refundRequestId} />
            <input type="hidden" name="refundStatus" value="approved" />
            <Button type="submit" size="sm" variant="outline">
              Approve
            </Button>
          </form>
          <form action={formAction}>
            <input type="hidden" name="workflowAction" value="reject_refund" />
            <input type="hidden" name="refundRequestId" value={row.refundRequestId} />
            <input type="hidden" name="refundStatus" value="rejected" />
            <Button type="submit" size="sm" variant="outline">
              Reject
            </Button>
          </form>
        </>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="workflowAction" value="process_refund" />
          <input type="hidden" name="refundRequestId" value={row.refundRequestId} />
          <input type="hidden" name="refundStatus" value="processed" />
          <Button type="submit" size="sm">
            Mark processed
          </Button>
        </form>
      )}
    </div>
  );
}

function CorrectionReviewActions({
  row,
  canApprove,
  formAction,
}: {
  row: FinanceCorrectionReviewRow;
  canApprove: boolean;
  formAction: FinanceFormAction;
}) {
  if (row.reviewStatus !== "pending") {
    return (
      <StatusBadge
        label={row.reviewStatus === "reviewed" ? "Reviewed" : row.reviewStatus}
        tone={row.reviewStatus === "reviewed" ? "good" : "accent"}
      />
    );
  }

  if (!canApprove) {
    return <StatusBadge label="Pending admin review" tone="warning" />;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workflowAction" value="review_adjustment" />
      <input type="hidden" name="paymentAdjustmentId" value={row.paymentAdjustmentId} />
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label className="text-xs">Review status</Label>
          <select name="reviewStatus" defaultValue="reviewed" className={`${selectClassName} mt-1`}>
            <option value="reviewed">Reviewed</option>
            <option value="flagged">Flagged</option>
            <option value="needs_followup">Needs follow-up</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Review note</Label>
          <Input name="reviewNote" className="mt-1" placeholder="Optional note" />
        </div>
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" size="sm">
          Save review
        </Button>
      </div>
    </form>
  );
}

function CollectionCloseSummary({
  data,
}: {
  data: FinanceControlsPageData;
}) {
  const summary = data.summary;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Collections"
        value={renderSummaryValue(summary.receiptTotal)}
        hint={`${summary.receiptCount} receipt${summary.receiptCount === 1 ? "" : "s"} on ${formatShortDate(data.selectedDate)}`}
      />
      <MetricCard
        title="Refund outflow"
        value={renderSummaryValue(summary.refundProcessedTotal)}
        hint={`${summary.refundProcessedCount} processed refund${summary.refundProcessedCount === 1 ? "" : "s"}`}
      />
      <MetricCard
        title="Net cash"
        value={renderSummaryValue(summary.netCashTotal)}
        hint="Collections less processed refunds"
      />
      <MetricCard
        title="Open issues"
        value={summary.pendingRefundCount + summary.pendingCorrectionCount}
        hint="Pending refunds and correction reviews in this day view"
      />
    </section>
  );
}

function ModeTotalsSection({ data }: { data: FinanceControlsPageData }) {
  return (
    <SectionCard
      title="Payment-mode totals"
      description="Payment-mode split for the selected day."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.modeTotals.length === 0 ? (
          <p className="text-sm text-slate-600">No receipts were posted for this date.</p>
        ) : (
          data.modeTotals.map((row) => (
            <div key={row.paymentMode} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-medium text-slate-700">{formatPaymentModeLabel(row.paymentMode)}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(row.totalAmount)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {row.receiptCount} receipt{row.receiptCount === 1 ? "" : "s"}
              </p>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function ReceivedBySection({ data }: { data: FinanceControlsPageData }) {
  return (
    <SectionCard
      title="Cashier / received-by totals"
      description="Who received the money, and how much was posted under each name."
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Received by</th>
              <th className="px-4 py-3">Receipt count</th>
              <th className="px-4 py-3">Total amount</th>
            </tr>
          </thead>
          <tbody>
            {data.receivedByTotals.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No cashier totals found for this date.
                </td>
              </tr>
            ) : (
              data.receivedByTotals.map((row) => (
                <tr key={row.receivedBy} className="border-t border-slate-100 text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.receivedBy}</td>
                  <td className="px-4 py-3">{row.receiptCount}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.totalAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function DayCloseSection({
  data,
  canWrite,
  canApprove,
  state,
  formAction,
  pending,
}: {
  data: FinanceControlsPageData;
  canWrite: boolean;
  canApprove: boolean;
  state: FinanceControlsActionState;
  formAction: FinanceFormAction;
  pending: boolean;
}) {
  const closure = data.closure;
  const summary = closure?.summarySnapshot ?? data.summary;

  return (
    <SectionCard
      title="Day close and reconciliation"
      description="Save the selected day, capture the cash-deposit status, then approve and close it once the office checks are complete."
      actions={
        closure ? (
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={statusLabelForClosure(closure.status)} tone={statusToneForClosure(closure.status)} />
            <StatusBadge
              label={statusLabelForCashDeposit(closure.cashDepositStatus)}
              tone={statusToneForCashDeposit(closure.cashDepositStatus)}
            />
            <StatusBadge
              label={statusLabelForReconciliation(closure.reconciliationStatus)}
              tone={statusToneForReconciliation(closure.reconciliationStatus)}
            />
          </div>
        ) : (
          <StatusBadge label="No close saved yet" tone="warning" />
        )
      }
    >
      <ActionNotice state={state} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="paymentDate" value={data.selectedDate} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="cash-deposit-status">Cash deposit status</Label>
            <select
              id="cash-deposit-status"
              name="cashDepositStatus"
              defaultValue={closure?.cashDepositStatus ?? "pending"}
              className={`${selectClassName} mt-2`}
              disabled={!canWrite && !canApprove}
            >
              <option value="pending">Pending</option>
              <option value="deposited">Deposited</option>
              <option value="carried_forward">Carried forward</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </div>
          <div>
            <Label htmlFor="reconciliation-status">Reconciliation status</Label>
            <select
              id="reconciliation-status"
              name="reconciliationStatus"
              defaultValue={closure?.reconciliationStatus ?? "pending"}
              className={`${selectClassName} mt-2`}
              disabled={!canWrite && !canApprove}
            >
              <option value="pending">Pending</option>
              <option value="in_review">In review</option>
              <option value="cleared">Cleared</option>
              <option value="issue_found">Issue found</option>
            </select>
          </div>
          <div className="xl:col-span-2">
            <Label htmlFor="bank-deposit-reference">Bank deposit reference</Label>
            <Input
              id="bank-deposit-reference"
              name="bankDepositReference"
              defaultValue={closure?.bankDepositReference ?? ""}
              placeholder="Deposit slip / UTR / bank reference"
              className="mt-2"
              disabled={!canWrite && !canApprove}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="close-note">Daily close confirmation note</Label>
          <textarea
            id="close-note"
            name="closeNote"
            defaultValue={closure?.closeNote ?? ""}
            className={`${textAreaClassName} mt-2`}
            placeholder="Confirm cash deposit, reconciliation checks, or follow-up items."
            disabled={!canWrite && !canApprove}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Captured for {formatShortDate(data.selectedDate)}</p>
          <p className="mt-1">
            Receipts: {summary.receiptCount}. Refund requests: {summary.refundRequestCount}. Processed refund outflow:{" "}
            {formatInr(summary.refundProcessedTotal)}. Cash deposit status:{" "}
            {statusLabelForCashDeposit(summary.cashDepositStatus ?? "pending")}.
          </p>
          <p className="mt-1">
            Pending reconciliation: {statusLabelForReconciliation(summary.reconciliationStatus ?? "pending")}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="workflowAction" value="save_draft" disabled={!canWrite || pending}>
            {pending ? "Saving..." : "Save draft"}
          </Button>
          {canApprove ? (
            <>
              <Button type="submit" name="workflowAction" value="approve_close" disabled={pending}>
                Approve and close
              </Button>
              {closure ? (
                <Button
                  type="submit"
                  name="workflowAction"
                  value="mark_reconciled"
                  variant="outline"
                  disabled={pending}
                >
                  Update reconciliation
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}

function DayBookSection({ data }: { data: FinanceControlsPageData }) {
  return (
    <SectionCard
      title="Day book"
      description="Unified daily view of collections, refund activity, and correction rows. Export uses the same rows."
      actions={
        <StatusBadge
          label={`${data.dayBookRows.length} entries`}
          tone={data.dayBookRows.length > 0 ? "accent" : "neutral"}
        />
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1440px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Posted at</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Receipt / ref</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Cash in</th>
              <th className="px-4 py-3">Cash out</th>
              <th className="px-4 py-3">Ledger effect</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Received by / staff</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.dayBookRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                  No day book rows found for the selected date.
                </td>
              </tr>
            ) : (
              data.dayBookRows.map((row) => (
                <tr key={`${row.entryType}-${row.entryId}`} className="border-t border-slate-100 align-top text-slate-700">
                  <td className="px-4 py-3 capitalize">{row.entryType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(row.postedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.studentName}</div>
                    <div className="text-xs text-slate-500">{row.admissionNo ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">{row.classLabel ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.receiptNumber ?? "-"}</div>
                    <div className="text-xs text-slate-500">{row.referenceNumber ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">{row.paymentMode ? formatPaymentModeLabel(row.paymentMode) : "-"}</td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{row.cashIn > 0 ? formatInr(row.cashIn) : "-"}</td>
                  <td className="px-4 py-3 font-medium text-rose-700">{row.cashOut > 0 ? formatInr(row.cashOut) : "-"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.ledgerEffect === 0 ? "-" : formatInr(row.ledgerEffect)}
                  </td>
                  <td className="px-4 py-3">
                    <DayBookRowTag row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.receivedBy ?? row.createdByName ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.note ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RefundRequestsSection({
  data,
  canWrite,
  canApprove,
  state,
  formAction,
  pending,
}: {
  data: FinanceControlsPageData;
  canWrite: boolean;
  canApprove: boolean;
  state: FinanceControlsActionState;
  formAction: FinanceFormAction;
  pending: boolean;
}) {
  return (
    <SectionCard
      title="Refund requests"
      description="Create a refund request first, then let admin review approve or reject it before processing."
      actions={
        <StatusBadge
          label={`${data.refundRequests.length} request${data.refundRequests.length === 1 ? "" : "s"}`}
          tone={data.refundRequests.length > 0 ? "accent" : "neutral"}
        />
      }
    >
      <ActionNotice state={state} />

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="workflowAction" value="request_refund" />
          <div>
            <Label htmlFor="refund-date">Refund date</Label>
            <Input
              id="refund-date"
              name="refundDate"
              type="date"
              defaultValue={data.selectedDate}
              className="mt-2"
              disabled={!canWrite}
              required
            />
          </div>
          <div>
            <Label htmlFor="refund-receipt-id">Receipt</Label>
            <select
              id="refund-receipt-id"
              name="receiptId"
              className={`${selectClassName} mt-2`}
              disabled={!canWrite}
              required
              defaultValue={data.receiptOptions[0]?.id ?? ""}
            >
              <option value="">Select receipt</option>
              {data.receiptOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} - {formatInr(option.totalAmount)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="refund-amount">Requested amount</Label>
            <Input
              id="refund-amount"
              name="requestedAmount"
              type="number"
              min={1}
              className="mt-2"
              disabled={!canWrite}
              required
            />
          </div>
          <div>
            <Label htmlFor="refund-method">Refund method</Label>
            <select
              id="refund-method"
              name="refundMethod"
              className={`${selectClassName} mt-2`}
              disabled={!canWrite}
              defaultValue="cash"
              required
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div className="xl:col-span-4">
            <Label htmlFor="refund-reference">Refund reference</Label>
            <Input
              id="refund-reference"
              name="refundReference"
              className="mt-2"
              disabled={!canWrite}
              placeholder="Optional cash slip / UPI / bank reference"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="refund-reason">Reason</Label>
          <Input id="refund-reason" name="reason" className="mt-2" disabled={!canWrite} required />
        </div>

        <div>
          <Label htmlFor="refund-notes">Notes</Label>
          <textarea
            id="refund-notes"
            name="notes"
            className={`${textAreaClassName} mt-2`}
            disabled={!canWrite}
            placeholder="Optional office note"
          />
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={!canWrite || pending}>
            {pending ? "Saving refund request..." : "Request refund"}
          </Button>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested by</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.refundRequests.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No refund requests found for the selected date.
                </td>
              </tr>
            ) : (
              data.refundRequests.map((row) => (
                <tr key={row.refundRequestId} className="border-t border-slate-100 align-top text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.receiptNumber}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.studentName}</div>
                    <div className="text-xs text-slate-500">{row.admissionNo}</div>
                  </td>
                  <td className="px-4 py-3">{formatPaymentModeLabel(row.refundMethod)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.requestedAmount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        row.status === "pending_approval"
                          ? "Pending approval"
                          : row.status === "approved"
                            ? "Approved"
                            : row.status === "processed"
                              ? "Processed"
                              : "Rejected"
                      }
                      tone={
                        row.status === "processed"
                          ? "good"
                          : row.status === "approved"
                            ? "accent"
                            : row.status === "rejected"
                              ? "neutral"
                              : "warning"
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.requestedByName ?? "-"}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(row.requestedAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.reason}</div>
                    <div className="text-xs text-slate-500">
                      {row.approvalNote ?? row.processingNote ?? row.notes ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RefundRowActions row={row} canApprove={canApprove} formAction={formAction} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function CorrectionReviewSection({
  data,
  canApprove,
  state,
  formAction,
}: {
  data: FinanceControlsPageData;
  canApprove: boolean;
  state: FinanceControlsActionState;
  formAction: FinanceFormAction;
}) {
  return (
    <SectionCard
      title="Correction review visibility"
      description="Show correction rows and the current review state without rewriting the underlying payment adjustment."
      actions={
        <StatusBadge
          label={`${data.correctionRows.length} correction${data.correctionRows.length === 1 ? "" : "s"}`}
          tone={data.correctionRows.length > 0 ? "accent" : "neutral"}
        />
      }
    >
      <ActionNotice state={state} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1600px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Adjustment</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Review status</th>
              <th className="px-4 py-3">Reviewer</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.correctionRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No correction rows found for the selected date.
                </td>
              </tr>
            ) : (
              data.correctionRows.map((row) => (
                <tr key={row.paymentAdjustmentId} className="border-t border-slate-100 align-top text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{row.receiptNumber}</div>
                    <div className="text-xs text-slate-500">{row.paymentDate}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.studentName}</div>
                    <div className="text-xs text-slate-500">{row.admissionNo}</div>
                    <div className="text-xs text-slate-500">{row.classLabel}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.adjustmentType}</div>
                    <div className="text-xs text-slate-500">{row.installmentLabel}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.amountDelta)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.reason}</div>
                    <div className="text-xs text-slate-500">{row.notes ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        row.reviewStatus === "pending"
                          ? "Pending"
                          : row.reviewStatus === "reviewed"
                            ? "Reviewed"
                            : row.reviewStatus === "flagged"
                              ? "Flagged"
                              : "Needs follow-up"
                      }
                      tone={
                        row.reviewStatus === "pending"
                          ? "warning"
                          : row.reviewStatus === "reviewed"
                            ? "good"
                            : "accent"
                      }
                    />
                    {row.reviewNote ? (
                      <p className="mt-2 text-xs text-slate-500">{row.reviewNote}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.reviewedByName ?? row.createdByName ?? "-"}</div>
                    <div className="text-xs text-slate-500">
                      {row.reviewedAt ? formatDateTime(row.reviewedAt) : formatDateTime(row.postedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <CorrectionReviewActions row={row} canApprove={canApprove} formAction={formAction} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!canApprove ? (
        <p className="mt-4 text-sm text-slate-600">
          Review actions stay hidden for non-admin staff. The queue remains visible for audit and follow-up.
        </p>
      ) : null}
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Saving a review records a separate audit event. The original adjustment row remains unchanged.
      </div>
    </SectionCard>
  );
}

export function FinanceControlsClient({
  data,
  canWrite,
  canApprove,
  initialActionState,
  actions,
}: FinanceControlsClientProps) {
  const [closeState, closeFormAction, closePending] = useActionState(
    actions.submitCollectionCloseAction,
    initialActionState,
  );
  const [refundState, refundFormAction, refundPending] = useActionState(
    actions.submitRefundWorkflowAction,
    initialActionState,
  );
  const [correctionState, correctionFormAction] = useActionState(
    actions.submitCorrectionReviewAction,
    initialActionState,
  );

  return (
    <div className="space-y-6">
      <CollectionCloseSummary data={data} />
      <ModeTotalsSection data={data} />
      <ReceivedBySection data={data} />
      <DayCloseSection
        data={data}
        canWrite={canWrite}
        canApprove={canApprove}
        state={closeState}
        formAction={closeFormAction}
        pending={closePending}
      />
      <DayBookSection data={data} />
      <RefundRequestsSection
        data={data}
        canWrite={canWrite}
        canApprove={canApprove}
        state={refundState}
        formAction={refundFormAction}
        pending={refundPending}
      />
      <CorrectionReviewSection
        data={data}
        canApprove={canApprove}
        state={correctionState}
        formAction={correctionFormAction}
      />
    </div>
  );
}
