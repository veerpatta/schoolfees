"use client";

import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";
import type { PaymentQuickAmount } from "@/lib/payments/workflow";
import { splitPaymentAcrossPlan } from "@/lib/repayment-plans/defaulter-view";
import type { RepaymentPlanCollectionContext } from "@/lib/repayment-plans/types";

/**
 * Lives outside payment-desk-mobile.tsx on purpose: that file drives both
 * breakpoints and is held to a line budget, so anything self-contained belongs
 * here rather than growing it further.
 */
export function PaymentDeskEmiBanner({
  plan,
  paymentAmount,
}: {
  plan: RepaymentPlanCollectionContext;
  /** What the cashier has typed so far, so the split can be previewed live. */
  paymentAmount: number;
}) {
  const split = splitPaymentAcrossPlan({
    amount: paymentAmount,
    planRemainingBalance: plan.remainingBalance,
  });

  return (
    <div className="border-b border-border bg-info-soft/40 px-3 py-2.5 text-info-soft-foreground">
      <p className="text-[11px] font-extrabold uppercase tracking-wide">On a monthly EMI plan</p>
      <p className="mt-0.5 text-[12px] leading-relaxed">
        {formatInr(plan.monthlyAmount)} a month · {formatInr(plan.remainingBalance)} left
        {plan.nextDueDate
          ? ` · next ${formatInr(plan.nextDueAmount ?? 0)} on ${plan.nextDueDate}`
          : ""}
        {plan.catchUpAmount > 0 ? ` · behind by ${formatInr(plan.catchUpAmount)}` : ""}
      </p>
      <p className="mt-1 text-[11px] opacity-90">
        This payment clears the EMI installments first; anything extra spills into the rest
        automatically. Discounts and late-fee waivers are disabled while the plan is active.
      </p>
      {plan.duesOutsidePlan === "current_year" ? (
        <p className="mt-1 text-[11px] font-semibold">
          Previous-year balance only — current-year fees sit outside this plan and stay unpaid.
        </p>
      ) : null}
      {plan.duesOutsidePlan === "previous_year" ? (
        <p className="mt-1 text-[11px] font-semibold">
          Current year only — previous-year dues sit outside this plan and stay unpaid.
        </p>
      ) : null}
      {plan.planReviewNeeded ? (
        <p className="mt-1 text-[11px] font-semibold">
          Plan review needed — a covered fee changed since the plan was agreed.
        </p>
      ) : null}
      {paymentAmount > 0 ? (
        <p className="mt-1.5 border-t border-current/20 pt-1.5 text-[11px] font-semibold">
          {split.toOtherDues > 0
            ? `This ${formatInr(paymentAmount)}: ${formatInr(split.toPlan)} to the EMI plan, ${formatInr(split.toOtherDues)} to other dues.`
            : `All ${formatInr(paymentAmount)} goes to the EMI plan.`}
        </p>
      ) : null}
    </div>
  );
}

/** Chip caption for the quick-amount row, including the EMI-only shortcuts. */
export function getQuickAmountChipLabel(quickAmount: PaymentQuickAmount) {
  const withAmount = (prefix: string) =>
    quickAmount.disabled || !quickAmount.amount
      ? prefix
      : `${prefix} ${formatInr(quickAmount.amount)}`;

  switch (quickAmount.key) {
    case "full":
      return withAmount("Full Due");
    case "next":
      return withAmount("Next");
    case "emiCatchUp":
      return withAmount("Catch up");
    case "emiMonthly":
      return withAmount("Monthly EMI");
    case "emiFullPlan":
      return withAmount("Full plan");
    case "overdue":
      return "Overdue";
    case "lateFee":
      return "Late Fee";
    case "lastAmount":
      return "Last";
    default:
      return "Clear x";
  }
}

/** Button variant for a quick-amount chip. */
export function getQuickAmountChipVariant(quickAmount: PaymentQuickAmount) {
  if (quickAmount.key === "full") return "accent";
  if (quickAmount.key === "next") return "soft";
  if (quickAmount.key === "clear") return "ghost";
  return "outline";
}

/** Extra classes for a quick-amount chip — overdue reads as money at risk. */
export function getQuickAmountChipClassName(quickAmount: PaymentQuickAmount) {
  return cn(
    "shrink-0 disabled:cursor-not-allowed disabled:opacity-40",
    quickAmount.key === "overdue" && (quickAmount.amount ?? 0) > 0 ? "text-destructive" : "",
  );
}
