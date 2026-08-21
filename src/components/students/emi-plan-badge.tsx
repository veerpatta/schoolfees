import { Badge } from "@/ui/primitives/badge";
import { formatInr } from "@/platform/helpers/currency";
import type { RepaymentPlanPaymentStatus } from "@/lib/repayment-plans/types";
import { cn } from "@/platform/utils";

/**
 * The "this family is on an EMI plan" label.
 *
 * Shared by the student list, Defaulters and the Payment Desk so the same
 * family never reads as "on track" on one screen and "behind" on another. It
 * exists because without it the office sees dues months past their installment
 * dates and no reason why nobody is chasing them.
 */
type Tone = "success" | "info" | "warning" | "danger";

const STATUS_TONE: Record<RepaymentPlanPaymentStatus, Tone> = {
  upcoming: "info",
  on_track: "success",
  due: "warning",
  behind: "danger",
  completed: "success",
};

const STATUS_LABEL: Record<RepaymentPlanPaymentStatus, string> = {
  upcoming: "EMI starts soon",
  on_track: "EMI on track",
  due: "EMI due",
  behind: "EMI missed",
  completed: "EMI cleared",
};

export function EmiPlanBadge({
  plan,
  className,
  /** Adds the catch-up / monthly figure under the chip. */
  showAmount = false,
}: {
  plan: {
    paymentStatus: RepaymentPlanPaymentStatus;
    monthlyAmount: number;
    catchUpAmount: number;
    missedInstallmentCount: number;
    planReviewNeeded: boolean;
  };
  className?: string;
  showAmount?: boolean;
}) {
  const tone = STATUS_TONE[plan.paymentStatus] ?? "info";

  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      <Badge
        variant={tone}
        dot
        className="rounded-full whitespace-nowrap px-2 py-0 text-[10px] font-semibold"
      >
        {STATUS_LABEL[plan.paymentStatus] ?? "On EMI"}
        {plan.missedInstallmentCount > 1 ? ` ×${plan.missedInstallmentCount}` : ""}
      </Badge>
      {showAmount ? (
        <span className="whitespace-nowrap text-[9px] font-semibold text-muted-foreground">
          {plan.catchUpAmount > 0
            ? `catch up ${formatInr(plan.catchUpAmount)}`
            : `${formatInr(plan.monthlyAmount)}/month`}
        </span>
      ) : null}
      {plan.planReviewNeeded ? (
        <span className="whitespace-nowrap text-[9px] font-semibold text-warning-soft-foreground">
          plan review needed
        </span>
      ) : null}
    </span>
  );
}
