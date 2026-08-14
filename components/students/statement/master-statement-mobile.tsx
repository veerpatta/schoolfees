import { Stamp } from "@/components/ui/stamp";
import { schoolProfile } from "@/lib/config/school";
import { buildFeeBreakupDisplayRows } from "@/lib/fees/display-breakdown";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { getStudentWorkspaceData } from "@/lib/students/workspace";
import { isYearCleared } from "@/lib/fees/year-clear";
import type { RepaymentPlanDetail, RepaymentPlanSummary } from "@/lib/repayment-plans/types";

type StudentWorkspace = Awaited<ReturnType<typeof getStudentWorkspaceData>>;

/**
 * The statement as a phone reads it: stacked cards, no wide tables.
 *
 * This is the pre-redesign document, moved here unchanged so the phone
 * rendering is byte-for-byte what it always was. The A4 redesign lives in
 * `./student-statement-paper.tsx` and is the only thing desktop and print see;
 * `../master-statement-document.tsx` is the switcher between the two.
 *
 * The desktop/print halves of each twin were deleted in the move: they sat
 * inside a `md:hidden print:hidden` subtree here and could never render. The
 * `md:hidden print:hidden` classes on the card branches are kept so the markup
 * this file emits is identical to before.
 */
export function MasterStatementMobile({
  student,
  financialSnapshot,
  installmentBalances,
  receipts = [],
  repaymentPlan = null,
  repaymentPlanHistory = [],
}: Pick<StudentWorkspace, "student" | "financialSnapshot" | "installmentBalances"> &
  Partial<Pick<StudentWorkspace, "receipts">> & {
    /** Active plan with its priced schedule, when the student is on one. */
    repaymentPlan?: RepaymentPlanDetail | null;
    /** Every plan ever agreed, newest first — the audit trail a parent can ask about. */
    repaymentPlanHistory?: RepaymentPlanSummary[];
  }) {
  if (!student || !financialSnapshot) {
    return null;
  }

  const feeHeads = buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown);
  const totalDue = installmentBalances.reduce((sum, item) => sum + item.baseCharge, 0);
  const totalDueWithLateFees = installmentBalances.reduce(
    (sum, item) => sum + item.baseCharge + item.finalLateFee,
    0,
  );
  const totalPaid = installmentBalances.reduce((sum, item) => sum + item.paidAmount, 0);
  const discountClosedAmount = installmentBalances.reduce(
    (sum, item) => sum + (item.discountCloseoutAmount ?? 0),
    0,
  );
  const isYearClear = isYearCleared({
    outstandingAmount: financialSnapshot.currentOutstanding,
    totalPaid,
    discountClosedAmount,
    hasPreparedDues: installmentBalances.length > 0,
  });

  // Oldest-first with a running balance, so the reader can follow how the
  // outstanding figure at the bottom was arrived at. Reversed receipts are shown
  // but contribute nothing.
  const orderedReceipts = [...receipts].sort((left, right) =>
    left.paymentDate.localeCompare(right.paymentDate),
  );
  const timelineReceivedTotal = orderedReceipts.reduce(
    (sum, entry) => (entry.isReversed ? sum : sum + entry.totalAmount),
    0,
  );
  let runningPaid = 0;
  const paymentTimeline = orderedReceipts.map((entry) => {
    if (!entry.isReversed) {
      runningPaid += entry.totalAmount;
    }
    return {
      ...entry,
      isDiscount: entry.paymentModeLabel.toLowerCase().includes("discount"),
      balanceAfter: Math.max(totalDueWithLateFees - runningPaid, 0),
    };
  });

  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border border-border-strong bg-card p-4 text-foreground shadow-sm sm:p-6 print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none">
      <header className="border-b border-border-strong pb-4">
        {/*
          Letterhead left, student right is an A4 idea. On a phone the two halves
          fight for about 170px each and the school name wraps to four lines, so
          they stack instead — and go back to side-by-side from sm up and on paper.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 print:flex-row print:items-start print:justify-between">
          <div>
            <p className="text-base font-semibold uppercase tracking-wide sm:text-lg">{schoolProfile.name}</p>
            <p className="text-sm text-muted-foreground">Master fee statement</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Academic session {financialSnapshot.policy.academicSessionLabel}
            </p>
          </div>
          <div className="flex items-start gap-3 text-sm sm:text-right print:text-right">
            <div>
              <p className="font-semibold text-foreground">{student.fullName}</p>
              <p className="text-muted-foreground">SR no {student.admissionNo}</p>
            </div>
            {/* Same stamp as the receipt, so a parent holding both documents
                sees the same mark. A statement is often what gets asked for at
                admission time in the next school. */}
            {isYearClear ? (
              <Stamp variant="year-cleared" className="shrink-0">
                Year Cleared
              </Stamp>
            ) : null}
          </div>
        </div>
        {isYearClear ? (
          <p className="mt-3 rounded-md bg-success-soft px-3 py-2 text-xs font-semibold text-success-soft-foreground">
            All dues for this session are settled. No further fees are payable.
          </p>
        ) : null}
      </header>

      <section className="grid gap-3 border-b border-border-strong py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Class</p>
          <p className="font-medium">{student.classLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Student status</p>
          <p className="font-medium">{student.studentStatusLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Transport route</p>
          <p className="font-medium">{student.transportRouteLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father</p>
          <p className="font-medium">{student.fatherName || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father phone</p>
          <p className="font-medium">{student.fatherPhone || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother phone</p>
          <p className="font-medium">{student.motherPhone || "-"}</p>
        </div>
      </section>

      <section className="grid gap-4 border-b border-border-strong py-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Fee breakup</p>
          <div className="overflow-hidden rounded-md border border-border-strong">
            <table className="w-full border-collapse text-left text-sm">
              <tbody>
                {feeHeads.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.kind === "discount"
                        ? "border-t border-accent/20 bg-accent-soft/30 text-accent-soft-foreground text-xs"
                        : "border-t border-border first:border-t-0"
                    }
                  >
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong bg-surface-2">
                  <td className="px-3 py-2 font-semibold">Resolved annual total</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total due</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(totalDue)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total paid</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(totalPaid)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding</p>
            <p className="mt-1 font-semibold text-foreground">{formatInr(financialSnapshot.currentOutstanding)}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Open installments</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.openInstallments}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overdue installments</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.overdueInstallments}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Next due</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.nextDueLabel ?? "No pending dues"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {financialSnapshot.nextDueDate ? `${formatShortDate(financialSnapshot.nextDueDate)} | ${formatInr(financialSnapshot.nextDueAmount ?? 0)}` : "-"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Override reason</p>
            <p className="mt-1 font-semibold text-foreground">{financialSnapshot.activeOverrideReason || "-"}</p>
          </div>
        </div>
      </section>

      <section className="py-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Installment-wise dues</p>

        {/*
          Six columns do not fit a phone. Rather than let the table run off the
          edge — the complaint that started this — the same rows are stacked as
          cards below 768px, matching how receipts and dues are read everywhere
          else in the app. The table itself is kept for desktop AND for print,
          because a printed statement is an A4 document regardless of what the
          person printing it was holding.
        */}
        <div className="md:hidden print:hidden divide-y divide-border rounded-md border border-border-strong">
          {installmentBalances.map((item) => (
            <div key={item.installmentId} className="space-y-1.5 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">{item.installmentLabel}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatInr(item.pendingAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Due {formatShortDate(item.dueDate)}</span>
                <span>Outstanding</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Base <span className="font-medium text-foreground">{formatInr(item.baseCharge)}</span>
                </span>
                <span>
                  Paid <span className="font-medium text-foreground">{formatInr(item.paidAmount)}</span>
                </span>
                {item.finalLateFee > 0 ? (
                  <span>
                    Late fee{" "}
                    <span className="font-medium text-destructive">{formatInr(item.finalLateFee)}</span>
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

      </section>

      {/*
        Payments actually made. The document called "statement" listed the fee
        breakup and installment dues and stopped there — a parent asking "what
        have I paid?" got an installment table that answers a different
        question. The only surface that ever listed receipts was the PDF, and it
        silently dropped discount-mode ones.

        Ordered oldest-first with a running balance so the page reads like a
        passbook: each line says what was received and what was still owed after
        it. Reversed receipts stay on the page — the register is append-only, and
        a receipt that vanished would be more alarming than one marked void.
      */}
      {/*
        EMI sits in its own block rather than as extra rows inside the receipt
        register below. The register is append-only and its chronology is what
        a parent reconciles against a receipt in their hand; interleaving
        agreement events into it would make the amounts harder to check, not
        easier. Same page, separate story.
      */}
      {repaymentPlan || repaymentPlanHistory.length > 0 ? (
        <section className="mt-6 border-t border-border-strong pt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Monthly EMI plan
          </p>
          {repaymentPlan ? (
            <>
              <p className="text-sm text-foreground">
                {formatInr(repaymentPlan.summary.monthlyAmount)} a month over{" "}
                {repaymentPlan.summary.termMonths} instalment
                {repaymentPlan.summary.termMonths === 1 ? "" : "s"}, agreed on{" "}
                {formatShortDate(repaymentPlan.summary.activatedAt.slice(0, 10))}
                {repaymentPlan.summary.activatedByLabel
                  ? ` by ${repaymentPlan.summary.activatedByLabel}`
                  : ""}
                . {formatInr(repaymentPlan.summary.paidToDate)} of{" "}
                {formatInr(repaymentPlan.summary.openingBalance)} cleared.
              </p>
              {repaymentPlan.summary.waivedLateFeeTotal > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatInr(repaymentPlan.summary.waivedLateFeeTotal)} of late fees was
                  permanently waived when this plan started.
                </p>
              ) : null}
              {/* Four columns cannot survive 375px, so the phone gets stacked
                  cards and the table is kept for desktop and for paper. */}
              <div className="mt-3 divide-y divide-border rounded-md border border-border-strong md:hidden print:hidden">
                {repaymentPlan.schedule.map((row) => (
                  <div key={row.sequenceNo} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-foreground">
                        EMI {row.sequenceNo}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatShortDate(row.dueDate)}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatInr(row.amount)}
                      </span>
                      <span className="block text-[11px] capitalize text-muted-foreground">
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {repaymentPlanHistory.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {repaymentPlanHistory.map((plan) => (
                <li key={plan.planId}>
                  {formatShortDate(plan.activatedAt.slice(0, 10))} —{" "}
                  {plan.lifecycle === "active"
                    ? "plan activated"
                    : plan.lifecycle === "superseded"
                      ? "plan rescheduled (replaced)"
                      : "plan cancelled"}
                  : {formatInr(plan.openingBalance)} over {plan.termMonths} month
                  {plan.termMonths === 1 ? "" : "s"} at {formatInr(plan.monthlyAmount)}.
                  {plan.cancellationReason ? ` ${plan.cancellationReason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 border-t border-border-strong pt-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Payments received
        </p>
        {paymentTimeline.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong px-3 py-4 text-center text-sm text-muted-foreground">
            No payments have been received for this session yet.
          </p>
        ) : (
          <>
          <div className="md:hidden print:hidden divide-y divide-border rounded-md border border-border-strong">
            {paymentTimeline.map((entry) => (
              <div key={entry.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {entry.receiptNumber}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      entry.isReversed ? "line-through opacity-60" : ""
                    }`}
                  >
                    {formatInr(entry.totalAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatShortDate(entry.paymentDate)}</span>
                  <span className="truncate">
                    {entry.isDiscount ? "Closed as discount" : entry.paymentModeLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {entry.isReversed ? (
                    <Stamp variant="void" size="sm" rotate={-4}>Reversed</Stamp>
                  ) : entry.isDiscount ? (
                    <Stamp variant="closed-as-discount" size="sm" rotate={-4}>Written off</Stamp>
                  ) : (
                    <Stamp variant="paid" size="sm" rotate={-4}>Paid</Stamp>
                  )}
                  {entry.isReversed ? null : (
                    <span className="text-xs text-muted-foreground">
                      Balance after{" "}
                      <span className="font-medium tabular-nums text-foreground">
                        {formatInr(entry.balanceAfter)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2.5">
              <span className="text-sm font-semibold text-foreground">Total received</span>
              <span className="flex items-center gap-2">
                {isYearClear ? (
                  <Stamp variant="year-cleared" size="sm" rotate={-4}>Year Cleared</Stamp>
                ) : null}
                <span className="text-sm font-semibold tabular-nums">
                  {formatInr(timelineReceivedTotal)}
                </span>
              </span>
            </div>
          </div>

          </>
        )}
      </section>

      <section className="border-t border-border-strong pt-4 text-sm space-y-3">
        {financialSnapshot.resolvedBreakdown.conventionalDiscountApplied > 0 && (
          <div className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3 text-xs space-y-2 no-print">
            <p className="font-semibold text-accent-soft-foreground uppercase tracking-wider text-[10px]">Active Conventional Discount Policy</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <span className="text-muted-foreground">Policy:</span>{" "}
                <span className="font-semibold text-foreground">
                  {financialSnapshot.resolvedBreakdown.conventionalDiscountLabels.join(", ")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Baseline Tuition:</span>{" "}
                <span className="font-medium text-muted-foreground line-through">
                  {formatInr(financialSnapshot.resolvedBreakdown.tuitionBeforeConventionalDiscount)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Applied Tuition:</span>{" "}
                <span className="font-bold text-foreground">
                  {formatInr(
                    financialSnapshot.resolvedBreakdown.tuitionBeforeConventionalDiscount -
                      financialSnapshot.resolvedBreakdown.conventionalDiscountApplied
                  )}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Savings:</span>{" "}
                <span className="font-bold text-success">
                  {formatInr(financialSnapshot.resolvedBreakdown.conventionalDiscountApplied)} saved
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <span className="font-semibold">Tuition override:</span>{" "}
            {student.tuitionOverride !== null ? formatInr(student.tuitionOverride) : "Class default"}
          </div>
          <div>
            <span className="font-semibold">Transport override:</span>{" "}
            {student.transportOverride !== null ? formatInr(student.transportOverride) : "Route default"}
          </div>
          <div>
            <span className="font-semibold">Discount:</span> {formatInr(student.discountAmount)}
          </div>
          <div>
            <span className="font-semibold">Late fee waiver:</span> {formatInr(student.lateFeeWaiverAmount)}
          </div>
        </div>
        <p className="mt-3">
          <span className="font-semibold">Other fee / adjustment:</span>{" "}
          {student.otherAdjustmentHead ? `${student.otherAdjustmentHead} | ` : ""}
          {formatInr(student.otherAdjustmentAmount ?? 0)}
        </p>
      </section>
    </article>
  );
}
