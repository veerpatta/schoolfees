"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { Textarea } from "@/ui/primitives/textarea";
import { useActionFeedbackMany } from "@/ui/hooks/use-action-feedback";
import { formatInr } from "@/platform/helpers/currency";
import {
  buildRepaymentSchedule,
  calculateRepaymentTermMonths,
  minimumMonthlyAmountForMaxTerm,
  validateRepaymentPlanDraft,
} from "@/lib/repayment-plans/schedule";
import {
  getDuesOutsidePlan,
  REPAYMENT_PLAN_MAX_TERM_MONTHS,
  REPAYMENT_PLAN_SCOPE_LABELS as SCOPE_LABELS,
  type RepaymentPlanScope,
  type RepaymentPlanSummary,
} from "@/lib/repayment-plans/types";

import {
  activateRepaymentPlanAction,
  cancelRepaymentPlanAction,
  rescheduleRepaymentPlanAction,
} from "@/app/protected/students/repayment-plan-actions";
import {
  INITIAL_REPAYMENT_PLAN_ACTION_STATE,
  REPAYMENT_PLAN_FORM_IDS,
} from "@/app/protected/students/repayment-plan-action-state";

/** Balances for one scope, priced on the server when the page rendered. */
export type RepaymentScopeOption = {
  scope: RepaymentPlanScope;
  openingBalance: number;
  oldBalanceIncluded: number;
  currentYearIncluded: number;
  lateFeeWaived: number;
  installmentCount: number;
};

type StudentRepaymentPlanSectionProps = {
  studentId: string;
  sessionLabel: string;
  scopeOptions: RepaymentScopeOption[];
  /** Messages from previews that failed to load. Never silently empty scopes. */
  loadErrors?: string[];
  activePlan: RepaymentPlanSummary | null;
  /** False in production until the rollout flag is turned on. */
  creationEnabled: boolean;
  /** Stable id minted on the server so a double-submit is idempotent. */
  clientRequestId: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function StudentRepaymentPlanSection({
  studentId,
  sessionLabel,
  scopeOptions,
  loadErrors,
  activePlan,
  creationEnabled,
  clientRequestId,
}: StudentRepaymentPlanSectionProps) {
  const fieldId = useId();

  const [activateState, activateAction, activatePending] = useActionState(
    activateRepaymentPlanAction,
    INITIAL_REPAYMENT_PLAN_ACTION_STATE,
  );
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    rescheduleRepaymentPlanAction,
    INITIAL_REPAYMENT_PLAN_ACTION_STATE,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelRepaymentPlanAction,
    INITIAL_REPAYMENT_PLAN_ACTION_STATE,
  );

  useActionFeedbackMany([activateState, rescheduleState, cancelState], {
    successTitle: "EMI plan updated",
    errorTitle: "EMI plan not saved",
  });

  if (activePlan) {
    return (
      <ActivePlanControls
        plan={activePlan}
        studentId={studentId}
        sessionLabel={sessionLabel}
        creationEnabled={creationEnabled}
        rescheduleAction={rescheduleAction}
        reschedulePending={reschedulePending}
        rescheduleMessage={
          rescheduleState.action === "reschedule" ? rescheduleState : null
        }
        cancelAction={cancelAction}
        cancelPending={cancelPending}
        cancelMessage={cancelState.action === "cancel" ? cancelState : null}
      />
    );
  }

  return (
    <ActivationForm
      fieldId={fieldId}
      studentId={studentId}
      sessionLabel={sessionLabel}
      scopeOptions={scopeOptions}
      loadErrors={loadErrors}
      creationEnabled={creationEnabled}
      clientRequestId={clientRequestId}
      formAction={activateAction}
      pending={activatePending}
      state={activateState.action === "activate" ? activateState : null}
    />
  );
}

function ActivationForm({
  fieldId,
  studentId,
  sessionLabel,
  scopeOptions,
  loadErrors,
  creationEnabled,
  clientRequestId,
  formAction,
  pending,
  state,
}: {
  fieldId: string;
  studentId: string;
  sessionLabel: string;
  scopeOptions: RepaymentScopeOption[];
  loadErrors?: string[];
  creationEnabled: boolean;
  clientRequestId: string;
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: { status: string; message: string | null } | null;
}) {
  const [scope, setScope] = useState<RepaymentPlanScope>(
    scopeOptions.find((option) => option.openingBalance > 0)?.scope ?? "old_balance_only",
  );
  const [monthlyInput, setMonthlyInput] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  // Sparse by design: index -> overridden date. Untouched rows keep the
  // generated monthly date, so moving one EMI does not restate the others.
  const [customDates, setCustomDates] = useState<Record<number, string>>({});

  const selected = useMemo(
    () => scopeOptions.find((option) => option.scope === scope) ?? null,
    [scope, scopeOptions],
  );

  const monthlyAmount = Number(monthlyInput);
  const openingBalance = selected?.openingBalance ?? 0;

  const derived = useMemo(() => {
    if (!Number.isInteger(monthlyAmount) || monthlyAmount <= 0 || openingBalance <= 0) {
      return null;
    }

    const termMonths = calculateRepaymentTermMonths(openingBalance, monthlyAmount);
    const schedule = firstDueDate
      ? buildRepaymentSchedule({
          openingBalance,
          monthlyAmount,
          firstDueDate,
          customDueDates: Array.from({ length: termMonths }, (_u, i) => customDates[i]),
        })
      : [];

    return {
      termMonths,
      schedule,
      endDate: schedule.length ? schedule[schedule.length - 1].dueDate : null,
      finalAmount: schedule.length ? schedule[schedule.length - 1].amount : null,
      exceedsCap: termMonths > REPAYMENT_PLAN_MAX_TERM_MONTHS,
    };
  }, [customDates, firstDueDate, monthlyAmount, openingBalance]);

  const validation = validateRepaymentPlanDraft({
    openingBalance,
    monthlyAmount: Number.isInteger(monthlyAmount) ? monthlyAmount : 0,
    firstDueDate,
    reason,
    acknowledged,
    customDueDates: derived?.schedule.map((row) => row.dueDate),
  });

  // Order matters: a read that failed must never be reported as a fact about
  // the student's dues.
  if (loadErrors && loadErrors.length > 0) {
    return (
      <Notice tone="danger" title="Could not read this student's dues">
        <p>The EMI options cannot be shown until this is resolved.</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {loadErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </Notice>
    );
  }

  const nothingToConvert = scopeOptions.every((option) => option.openingBalance <= 0);

  if (nothingToConvert) {
    return (
      <Notice tone="neutral" title="Nothing to convert">
        This student has no unpaid dues, so there is nothing to put on a monthly EMI plan.
      </Notice>
    );
  }

  return (
    <div className="space-y-5">
      {!creationEnabled ? (
        <Notice tone="warning" title="EMI plan creation is switched off here">
          The schedule and every read surface are live, but activation is behind the{" "}
          <code className="font-mono text-xs">REPAYMENT_PLANS</code> rollout flag in this
          environment. Turn it on once UAT signs off.
        </Notice>
      ) : null}

      <form id={REPAYMENT_PLAN_FORM_IDS.activate} action={formAction} className="space-y-5">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="expectedOpeningBalance" value={openingBalance} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What should the plan cover?</legend>
          {scopeOptions.map((option) => {
            const disabled = option.openingBalance <= 0;
            // What this shape leaves out, priced from its sibling option so the
            // admin sees the trade-off before choosing.
            const excludes = getDuesOutsidePlan(option.scope);
            const excludedAmount =
              excludes === "current_year"
                ? (scopeOptions.find((other) => other.scope === "current_year_only")
                    ?.openingBalance ?? 0)
                : excludes === "previous_year"
                  ? (scopeOptions.find((other) => other.scope === "old_balance_only")
                      ?.openingBalance ?? 0)
                  : 0;

            return (
              <label
                key={option.scope}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  scope === option.scope ? "border-primary bg-surface-2" : "border-border"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="scopeChoice"
                  className="mt-1"
                  value={option.scope}
                  checked={scope === option.scope}
                  disabled={disabled}
                  onChange={() => setScope(option.scope)}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{SCOPE_LABELS[option.scope]}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatInr(option.openingBalance)} across {option.installmentCount}{" "}
                    installment{option.installmentCount === 1 ? "" : "s"}
                    {/* Only worth saying when the option MIXES the two: on
                        "current year only" it restates the option's own name,
                        and the amount is the total already shown. */}
                    {option.currentYearIncluded > 0 && option.oldBalanceIncluded > 0
                      ? ` — of which ${formatInr(option.currentYearIncluded)} is current-year fees not yet due`
                      : ""}
                  </span>
                  {excludedAmount > 0 && !disabled ? (
                    <span className="block text-sm text-muted-foreground">
                      Leaves {formatInr(excludedAmount)} of{" "}
                      {excludes === "current_year" ? "current-year" : "previous-year"} dues outside
                      the plan.
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        {selected ? (
          <div className="rounded-lg border bg-surface-2 p-4">
            <SummaryRow
              label="Previous-year balance"
              value={formatInr(selected.oldBalanceIncluded)}
            />
            <SummaryRow
              label="Current-year balance"
              value={formatInr(selected.currentYearIncluded)}
            />
            <SummaryRow label="Plan opening balance" value={formatInr(selected.openingBalance)} />
            <SummaryRow
              label="Late fees waived permanently"
              value={formatInr(selected.lateFeeWaived)}
            />
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-monthly`}>Monthly EMI amount</Label>
            <Input
              id={`${fieldId}-monthly`}
              name="monthlyAmount"
              inputMode="numeric"
              placeholder="e.g. 4000"
              value={monthlyInput}
              onChange={(event) => setMonthlyInput(event.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-first-due`}>First EMI due date</Label>
            <Input
              id={`${fieldId}-first-due`}
              name="firstDueDate"
              type="date"
              value={firstDueDate}
              onChange={(event) => setFirstDueDate(event.target.value)}
            />
          </div>
        </div>

        {derived?.exceedsCap ? (
          <Notice tone="warning" title="That term is too long">
            At {formatInr(monthlyAmount)} a month this plan needs {derived.termMonths} months. The
            maximum is {REPAYMENT_PLAN_MAX_TERM_MONTHS} months —{" "}
            {formatInr(minimumMonthlyAmountForMaxTerm(openingBalance))} a month or more clears it in
            time.
          </Notice>
        ) : null}

        {derived && !derived.exceedsCap && derived.schedule.length ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {derived.termMonths} monthly instalment{derived.termMonths === 1 ? "" : "s"}, ending{" "}
              {formatDate(derived.endDate)}. The last EMI is {formatInr(derived.finalAmount)}.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Due date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.schedule.map((row, index) => (
                    <tr key={row.sequenceNo} className="border-t">
                      <td className="px-3 py-1.5 tabular-nums">{row.sequenceNo}</td>
                      <td className="px-2 py-1">
                        {/* Each date is editable: real arrangements bend around
                            a harvest or a salary date, and the schedule on file
                            has to be the one the office actually agreed. */}
                        <Input
                          type="date"
                          aria-label={`Due date for EMI ${row.sequenceNo}`}
                          className="h-8"
                          name="dueDate"
                          value={row.dueDate}
                          onChange={(event) =>
                            setCustomDates((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatInr(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(customDates).length > 0 ? (
              <button
                type="button"
                className="text-[12px] font-semibold underline underline-offset-4"
                onClick={() => setCustomDates({})}
              >
                Reset to monthly dates
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-reason`}>Reason</Label>
          <Textarea
            id={`${fieldId}-reason`}
            name="reason"
            rows={2}
            placeholder="Why is this family being moved to monthly EMI?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            name="acknowledged"
            aria-label="Acknowledge repayment plan terms"
            checked={acknowledged}
            onCheckedChange={(value) => setAcknowledged(value === true)}
          />
          <span className="text-sm">
            I understand that while this plan is active, every payment clears the EMI balance
            before any other fee, and discounts and late-fee waivers are disabled at the Payment
            Desk.
          </span>
        </label>

        {!validation.ok && (monthlyInput || firstDueDate || reason) ? (
          <p className="text-sm text-destructive">{validation.message}</p>
        ) : null}

        {state?.status === "error" && state.message ? (
          <Notice tone="danger" title="Could not activate the plan">
            {state.message}
          </Notice>
        ) : null}
        {state?.status === "success" && state.message ? (
          <Notice tone="success" title="EMI plan activated">
            {state.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={!validation.ok || pending || !creationEnabled}>
          {pending ? "Activating…" : "Activate EMI plan"}
        </Button>
      </form>
    </div>
  );
}

function ActivePlanControls({
  plan,
  studentId,
  sessionLabel,
  creationEnabled,
  rescheduleAction,
  reschedulePending,
  rescheduleMessage,
  cancelAction,
  cancelPending,
  cancelMessage,
}: {
  plan: RepaymentPlanSummary;
  studentId: string;
  sessionLabel: string;
  creationEnabled: boolean;
  rescheduleAction: (payload: FormData) => void;
  reschedulePending: boolean;
  rescheduleMessage: { status: string; message: string | null } | null;
  cancelAction: (payload: FormData) => void;
  cancelPending: boolean;
  cancelMessage: { status: string; message: string | null } | null;
}) {
  const [mode, setMode] = useState<"none" | "reschedule" | "cancel">("none");
  const [monthlyInput, setMonthlyInput] = useState(String(plan.monthlyAmount));
  const [firstDueDate, setFirstDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (rescheduleMessage?.status === "success" || cancelMessage?.status === "success") {
      setMode("none");
    }
  }, [cancelMessage?.status, rescheduleMessage?.status]);

  const monthlyAmount = Number(monthlyInput);
  const rescheduleTerm =
    Number.isInteger(monthlyAmount) && monthlyAmount > 0
      ? calculateRepaymentTermMonths(plan.remainingBalance, monthlyAmount)
      : 0;
  const rescheduleExceedsCap = rescheduleTerm > REPAYMENT_PLAN_MAX_TERM_MONTHS;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-surface-2 p-4">
        <SummaryRow label="Covers" value={SCOPE_LABELS[plan.scope]} />
        <SummaryRow label="Monthly EMI" value={formatInr(plan.monthlyAmount)} />
        <SummaryRow
          label="Plan balance"
          value={`${formatInr(plan.remainingBalance)} of ${formatInr(plan.openingBalance)}`}
        />
        <SummaryRow
          label="Next due"
          value={
            plan.nextDueDate
              ? `${formatInr(plan.nextDueAmount)} on ${formatDate(plan.nextDueDate)}`
              : "Plan cleared"
          }
        />
        <SummaryRow label="Ends" value={formatDate(plan.endDate)} />
        <SummaryRow label="Late fees waived" value={formatInr(plan.waivedLateFeeTotal)} />
      </div>

      {plan.planReviewNeeded ? (
        <Notice tone="warning" title="Plan review needed">
          A fee covered by this plan changed, or a new unpaid charge appeared inside its scope.
          Nothing was altered automatically — reschedule the plan to fold the change in, or leave
          it and collect the difference separately.
        </Notice>
      ) : null}

      {getDuesOutsidePlan(plan.scope) === "current_year" ? (
        <Notice tone="info" title="Current-year fees are outside this plan">
          Only the previous-year balance is on EMI. Current-year installments keep their own due
          dates and stay collectable, but payments clear the EMI balance first.
        </Notice>
      ) : null}

      {getDuesOutsidePlan(plan.scope) === "previous_year" ? (
        <Notice tone="info" title="Previous-year dues are outside this plan">
          Only this year&rsquo;s fees are on EMI. The previous-year balance keeps its own due date
          and stays collectable, but payments clear the EMI balance first.
        </Notice>
      ) : null}

      {rescheduleMessage?.message ? (
        <Notice tone={rescheduleMessage.status === "error" ? "danger" : "success"}>
          {rescheduleMessage.message}
        </Notice>
      ) : null}
      {cancelMessage?.message ? (
        <Notice tone={cancelMessage.status === "error" ? "danger" : "success"}>
          {cancelMessage.message}
        </Notice>
      ) : null}

      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!creationEnabled}
            onClick={() => setMode("reschedule")}
          >
            Reschedule plan
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("cancel")}>
            Cancel plan
          </Button>
        </div>
      ) : null}

      {mode === "reschedule" ? (
        <form
          id={REPAYMENT_PLAN_FORM_IDS.reschedule}
          action={rescheduleAction}
          className="space-y-4 rounded-lg border p-4"
        >
          <input type="hidden" name="planId" value={plan.planId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="sessionLabel" value={sessionLabel} />
          <input
            type="hidden"
            name="expectedRemainingBalance"
            value={plan.remainingBalance}
          />

          <p className="text-sm text-muted-foreground">
            Rescheduling writes a new plan for the {formatInr(plan.remainingBalance)} still owed and
            keeps this one on file as superseded. The late fees already waived stay waived.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-monthly">New monthly EMI</Label>
              <Input
                id="reschedule-monthly"
                name="monthlyAmount"
                inputMode="numeric"
                value={monthlyInput}
                onChange={(event) => setMonthlyInput(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-first-due">New first due date</Label>
              <Input
                id="reschedule-first-due"
                name="firstDueDate"
                type="date"
                value={firstDueDate}
                onChange={(event) => setFirstDueDate(event.target.value)}
              />
            </div>
          </div>

          {rescheduleExceedsCap ? (
            <p className="text-sm text-destructive">
              That is {rescheduleTerm} months. The maximum term is{" "}
              {REPAYMENT_PLAN_MAX_TERM_MONTHS} months — try{" "}
              {formatInr(minimumMonthlyAmountForMaxTerm(plan.remainingBalance))} a month or more.
            </p>
          ) : rescheduleTerm > 0 ? (
            <p className="text-sm text-muted-foreground">
              {rescheduleTerm} monthly instalment{rescheduleTerm === 1 ? "" : "s"}.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="reschedule-reason">Reason</Label>
            <Textarea
              id="reschedule-reason"
              name="reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={
                reschedulePending ||
                rescheduleExceedsCap ||
                rescheduleTerm <= 0 ||
                !firstDueDate ||
                reason.trim().length < 4
              }
            >
              {reschedulePending ? "Rescheduling…" : "Confirm reschedule"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("none")}>
              Back
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "cancel" ? (
        <form
          id={REPAYMENT_PLAN_FORM_IDS.cancel}
          action={cancelAction}
          className="space-y-4 rounded-lg border border-destructive/40 p-4"
        >
          <input type="hidden" name="planId" value={plan.planId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="sessionLabel" value={sessionLabel} />

          <Notice tone="warning" title="What cancelling does">
            {formatInr(plan.remainingBalance)} goes back to the original installment due dates and
            becomes normal follow-up again. The {formatInr(plan.waivedLateFeeTotal)} of late fees
            already waived is <strong>not</strong> re-charged.
          </Notice>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              name="reason"
              rows={2}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="destructive"
              disabled={cancelPending || cancelReason.trim().length < 4}
            >
              {cancelPending ? "Cancelling…" : "Cancel EMI plan"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("none")}>
              Back
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
