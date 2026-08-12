/**
 * Monthly EMI repayment plans.
 *
 * A plan is an auditable agreement layered over dues that already exist. It
 * never rewrites installments, receipts or the fee engine — it names the exact
 * installments a family will clear monthly, fixes the calendar, and forgives
 * the late fees on those rows.
 *
 * Lifecycle and payment standing are separate axes on purpose. A plan can be
 * `active` (lifecycle) and `behind` (standing) at the same time; cancelling it
 * changes the first and says nothing about the second.
 */

/**
 * Which dues a plan absorbs.
 *
 * Three shapes, because families arrange it three ways: last year monthly with
 * this year left on the normal four installments, this whole year monthly with
 * last year settled separately, or both together.
 */
export type RepaymentPlanScope =
  | "old_balance_only"
  | "current_year_only"
  | "old_and_current";

/** Where the agreement itself stands. Set by admins, never by the calendar. */
export type RepaymentPlanLifecycle = "active" | "cancelled" | "superseded";

/**
 * Where the family stands against the agreed calendar. Derived, never stored.
 *
 * - `upcoming`  — the first EMI is not due yet.
 * - `on_track`  — everything due so far is paid.
 * - `due`       — today's EMI is outstanding, but nothing has gone past due.
 * - `behind`    — at least one EMI whose due date has passed is unpaid.
 * - `completed` — the plan balance is cleared.
 */
export type RepaymentPlanPaymentStatus =
  | "upcoming"
  | "on_track"
  | "due"
  | "behind"
  | "completed";

export type RepaymentScheduleItem = {
  sequenceNo: number;
  dueDate: string;
  amount: number;
};

/**
 * The flat late fee charged because an EMI went past its due date unpaid.
 *
 * It is a real installment, not a note against the plan — that is what makes it
 * collectable at the Payment Desk and waivable through the ordinary flow.
 */
export type RepaymentEmiLateFee = {
  /** The zero-base installment carrying the charge. */
  installmentId: string;
  amount: number;
  waivedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
};

/**
 * One row of the monthly calendar, priced against what has actually been paid.
 * `status` is per-row and independent of the plan's overall standing.
 */
export type RepaymentScheduleRow = RepaymentScheduleItem & {
  paidAmount: number;
  status: "paid_on_time" | "paid_late" | "partial" | "missed" | "upcoming";
  /** Null until this EMI is missed and the nightly job charges it. */
  lateFee: RepaymentEmiLateFee | null;
};

/** An installment the plan covers, with the snapshot taken at activation. */
export type RepaymentPlanItem = {
  installmentId: string;
  installmentNo: number | null;
  installmentLabel: string | null;
  dueDate: string;
  isCarryForward: boolean;
  /** Base charge on the row when the plan was agreed. */
  snapshotBaseCharge: number;
  /** Still owed on the row when the plan was agreed. Sums to openingBalance. */
  includedBaseBalance: number;
  /** Late fee live on the row at activation, now permanently forgiven. */
  waivedLateFee: number;
};

export type RepaymentPlanSummary = {
  planId: string;
  studentId: string;
  sessionLabel: string;
  scope: RepaymentPlanScope;
  lifecycle: RepaymentPlanLifecycle;
  paymentStatus: RepaymentPlanPaymentStatus;

  openingBalance: number;
  monthlyAmount: number;
  firstDueDate: string;
  termMonths: number;
  finalInstallmentAmount: number;
  endDate: string | null;

  /** Late fee forgiven when the plan was activated. */
  waivedLateFeeTotal: number;

  itemCount: number;
  remainingBalance: number;
  paidToDate: number;
  /** Sum of every EMI whose due date has arrived. */
  expectedToDate: number;
  /** What the family must pay right now to be back on the calendar. */
  catchUpAmount: number;
  missedInstallmentCount: number;
  paidInstallmentCount: number;

  nextDueSequenceNo: number | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;

  reason: string;
  activatedAt: string;
  activatedByLabel: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  supersedesPlanId: string | null;
  supersededByPlanId: string | null;

  /**
   * A covered charge moved after the plan was agreed, or a new unpaid charge
   * appeared inside the plan's scope. The monthly amount is NOT changed
   * silently — an admin reviews and reschedules.
   */
  planReviewNeeded: boolean;
};

/** Everything the Student surfaces need in one shot. */
export type RepaymentPlanDetail = {
  summary: RepaymentPlanSummary;
  schedule: RepaymentScheduleRow[];
  items: RepaymentPlanItem[];
};

/** Output of `preview_student_repayment_plan`, before anything is committed. */
export type RepaymentPlanPreview = {
  studentId: string;
  sessionLabel: string;
  scope: RepaymentPlanScope;
  openingBalance: number;
  oldBalanceIncluded: number;
  currentYearIncluded: number;
  /** Late fees that activation would permanently waive. */
  lateFeeWaived: number;
  installmentCount: number;
  monthlyAmount: number | null;
  firstDueDate: string | null;
  termMonths: number | null;
  finalInstallmentAmount: number | null;
  endDate: string | null;
  items: Array<{
    installmentId: string;
    installmentNo: number | null;
    installmentLabel: string | null;
    dueDate: string;
    isCarryForward: boolean;
    baseCharge: number;
    includedBaseBalance: number;
    chargedLateFee: number;
  }>;
  schedule: RepaymentScheduleItem[];
  hasActivePlan: boolean;
  errors: string[];
  canActivate: boolean;
};

/**
 * What the Payment Desk needs to steer a collection. Derived from the plan
 * summary so the desk cannot disagree with the student page.
 */
export type RepaymentPlanCollectionContext = {
  planId: string;
  scope: RepaymentPlanScope;
  paymentStatus: RepaymentPlanPaymentStatus;
  monthlyAmount: number;
  remainingBalance: number;
  catchUpAmount: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  missedInstallmentCount: number;
  planReviewNeeded: boolean;
  /** Installments the plan covers — the desk marks these "Covered by EMI plan". */
  coveredInstallmentIds: string[];
  /**
   * Which dues the plan deliberately leaves outside itself, so the cashier is
   * told before taking the money. Null when the plan covers everything.
   */
  duesOutsidePlan: "current_year" | "previous_year" | null;
  /**
   * What that omission is actually worth. Zero means the partial scope happens
   * to cover everything owed, so warning about it would name a balance the
   * student does not have.
   */
  duesOutsidePlanAmount: number;
};

export const REPAYMENT_PLAN_MAX_TERM_MONTHS = 12;
export const REPAYMENT_PLAN_MIN_REASON_LENGTH = 4;

export const REPAYMENT_PLAN_SCOPES = [
  "old_balance_only",
  "current_year_only",
  "old_and_current",
] as const satisfies readonly RepaymentPlanScope[];

export function isRepaymentPlanScope(value: unknown): value is RepaymentPlanScope {
  return REPAYMENT_PLAN_SCOPES.includes(value as RepaymentPlanScope);
}

export const REPAYMENT_PLAN_SCOPE_LABELS: Record<RepaymentPlanScope, string> = {
  old_balance_only: "Previous-year balance only",
  current_year_only: "Current year only",
  old_and_current: "Previous year + full current year",
};

/**
 * What a scope deliberately leaves out. Lives here rather than in `data.ts`
 * because the Payment Desk banner and the plan card are client components and
 * `data.ts` is server-only.
 */
export function getDuesOutsidePlan(
  scope: RepaymentPlanScope,
): RepaymentPlanCollectionContext["duesOutsidePlan"] {
  if (scope === "old_balance_only") return "current_year";
  if (scope === "current_year_only") return "previous_year";

  return null;
}
