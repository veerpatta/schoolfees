/**
 * Single source of truth for every money-related label used on staff and
 * parent surfaces. Every figure rendered through `<MoneyWithDefinition>` (or
 * referenced in a `<MoneyGlossary>` modal) must resolve to a `MoneyTerm` here.
 *
 * The clarity contract: a staff member or parent who taps the "ⓘ" next to any
 * number on any screen sees exactly one definition for that label, regardless
 * of which page they came from.
 */

export type MoneyTermKey =
  | "totalDue"
  | "expectedFees"
  | "totalPaid"
  | "outstanding"
  | "pending"
  | "feesPending"
  | "dueNow"
  | "daysOverdue"
  | "balanceDue"
  | "balanceAfterReceipt"
  | "creditBalance"
  | "closedAsDiscount"
  | "discountManual"
  | "discountConventional"
  | "discountCloseout"
  | "discountTotal"
  | "lateFeeCharged"
  | "lateFeeWaived"
  | "lateFeePending"
  | "baseCharge"
  | "amountPaidOnInstallment"
  | "pendingOnInstallment"
  | "receiptAmount"
  | "paymentMode"
  | "paymentDate"
  | "createdAt"
  | "postedBy"
  | "receivedBy"
  | "adjustmentPositive"
  | "adjustmentNegative"
  | "adjustmentNet"
  | "conventionalDiscountPolicy"
  | "todayCollection"
  | "notDueYet"
  | "oldBalance"
  | "advance"
  | "reversed";

export type MoneyTerm = {
  key: MoneyTermKey;
  label: string;
  summary: string;
  /** Longer explanation; rendered on its own paragraph in the glossary modal. */
  detail: string;
  /** Where this label is computed from / what it does not include. */
  source?: string;
};

export const MONEY_GLOSSARY: Record<MoneyTermKey, MoneyTerm> = {
  totalDue: {
    key: "totalDue",
    label: "Total Due",
    summary: "What the student owes right now — fees, plus any unwaived late fee.",
    detail:
      "Sum of tuition + transport + academic fee + other heads, after any annual discount, plus any late fee still owed. Recomputed every time you load the page — no stale snapshots. Note this is what a student OWES, which is not the same as Expected Fees: the school's fee book excludes late fee entirely. If a student owes ₹6,000 of fees and a ₹1,000 late fee, Total Due is ₹7,000 but only ₹6,000 of it is expected fee.",
    source: "v_workbook_student_financials.total_due",
  },
  expectedFees: {
    key: "expectedFees",
    label: "Expected Fees",
    summary: "The fees the school set out to collect. Never includes late fee.",
    detail:
      "Sum of every installment's base charge, after discounts. A late fee is deliberately excluded: it exists to get the fee in on time, it is issued expecting to be waived, and it is not money the school planned to collect. Counting it here would also make the figure grow on its own — every due date that passed would inflate what the school appears to be owed without anyone deciding to charge anything. Late fee is tracked on its own lines instead: Late Fee (charged), Late Fee Waived and Late Fee Pending.",
    source: "v_workbook_student_financials.base_charge_total",
  },
  totalPaid: {
    key: "totalPaid",
    label: "Total Paid",
    summary: "Money actually received against this student in the year.",
    detail:
      "Sum of all posted payment rows for this student in this academic session. Does NOT include amounts written off via the 'Closed as discount' close-out — those are separated for clarity.",
    source: "Sum of payments.amount",
  },
  outstanding: {
    key: "outstanding",
    label: "Outstanding",
    summary: "Total Due − Total Paid. All money still owed today, late fee included.",
    detail:
      "Always equals Total Due − Total Paid for the active academic session, INCLUDING any unpaid late fee. Breaks down as Fees pending (base) + Late fee. Only the Fees-pending part decides whether a student counts as overdue / a defaulter — an unpaid late fee alone never makes a student a defaulter. If the student has a credit balance (paid more than due), Outstanding is ₹0 and the surplus shows as Credit Balance.",
    source: "v_workbook_student_financials.outstanding_amount",
  },
  pending: {
    key: "pending",
    label: "Pending",
    summary: "Total still owed (fees + late fee). Same as Outstanding at student level.",
    detail:
      "When shown next to a specific installment, this is the unpaid portion of THAT installment (including its late fee, minus any waiver). When shown at the student level, it equals Outstanding = Fees pending (base) + Late fee.",
  },
  feesPending: {
    key: "feesPending",
    label: "Fees pending",
    summary: "Fees still owed, late fee excluded. Drives overdue / defaulter status.",
    detail:
      "The base charge (tuition + transport + academic + other heads, after discount) not yet paid. Late fee is deliberately excluded — a student is treated as PAID once Fees pending reaches ₹0, even if a late fee is still owed. This is the figure that determines 'Due now', 'Overdue', and defaulter lists.",
    source: "v_workbook_student_financials.base_outstanding_amount",
  },
  dueNow: {
    key: "dueNow",
    label: "Due now",
    summary: "Fees to collect right now — base of installments due today or earlier.",
    detail:
      "Sum of the unpaid base charge of every installment whose due date is today or in the past. Late fee is shown on its own line, not folded in here. This is the actionable 'collect this today' number.",
  },
  daysOverdue: {
    key: "daysOverdue",
    label: "Days overdue",
    summary: "Days past the oldest unpaid installment's due date.",
    detail:
      "Counted from the due date of the oldest installment that still has unpaid fees (base). 0 when nothing is past due. Based on fees only — an unpaid late fee alone does not start the overdue clock. Computed in Asia/Kolkata time.",
  },
  balanceDue: {
    key: "balanceDue",
    label: "Balance Due",
    summary: "What's still owed AFTER the receipt being viewed.",
    detail:
      "On a receipt, this is the student's outstanding balance immediately after this payment was applied. On a live student view, it is the current outstanding.",
  },
  balanceAfterReceipt: {
    key: "balanceAfterReceipt",
    label: "Balance after receipt",
    summary: "Outstanding immediately after this receipt was posted.",
    detail:
      "Snapshot value: total due at the time of posting minus all payments up to and including this one. Useful for reading out the next call-back amount to a parent.",
  },
  notDueYet: {
    key: "notDueYet",
    label: "Not due yet",
    summary: "Fee for installments whose due date has not arrived.",
    detail:
      "Counted in the year total but never in Pending, and never chased. On the dashboard year bar it is the remainder once Collected and Pending are taken out, so the three segments always add up to Expected.",
  },
  oldBalance: {
    key: "oldBalance",
    label: "Old balance",
    summary: "Unpaid fee carried forward from a previous session.",
    detail:
      "Shown separately from this year's pending so the current session's figures stay clean. Carried by student_carry_forward_balances and surfaced on its own dashboard card rather than blended into Pending.",
  },
  advance: {
    key: "advance",
    label: "Advance",
    summary: "Money taken above the amount currently due.",
    detail:
      "Sits ready on the ledger and applies itself to the next installment. Distinct from a refund: nothing leaves the school, it is simply money received early.",
  },
  reversed: {
    key: "reversed",
    label: "Reversed",
    summary: "A receipt cancelled by an equal and opposite entry.",
    detail:
      "Both rows stay in the register permanently — the original receipt is never edited or deleted. A reversal posts a compensating payment_adjustment, which is why a reversed receipt still prints and still appears in the day book.",
  },
  creditBalance: {
    key: "creditBalance",
    label: "Credit Balance",
    summary: "Surplus paid in excess of total due — available to apply later.",
    detail:
      "Total Paid − Total Due, when positive. Sits as a credit on the student's ledger until a future installment consumes it, or until a refund adjustment is recorded.",
  },
  closedAsDiscount: {
    key: "closedAsDiscount",
    label: "Closed as Discount",
    summary: "Pending amount written off without cash — a non-cash close-out.",
    detail:
      "Posted with payment mode = 'discount'. This is NOT a normal discount on the fee structure — it's a one-time write-off recorded as a receipt so the audit trail stays clean. It does not move money; it only zeroes pending.",
  },
  discountManual: {
    key: "discountManual",
    label: "Manual Discount",
    summary: "Custom discount on this student's annual fee.",
    detail:
      "Recorded via Students → Fee Setup override. Reduces the gross annual base before late fees are computed. Different from conventional discounts (RTE / Staff / 3rd-child) and from 'Closed as Discount' close-outs.",
    source: "student_fee_overrides.discount_amount",
  },
  discountConventional: {
    key: "discountConventional",
    label: "Conventional Discount",
    summary: "Policy-based tuition discount (RTE / Staff Child / 3rd Child).",
    detail:
      "Applies a policy to tuition fee only. Recorded with before/after tuition amounts and the policy code. Maximum 2 active policies per student per year; the lowest-resulting tuition wins.",
    source: "student_conventional_discount_assignments",
  },
  discountCloseout: {
    key: "discountCloseout",
    label: "Discount Close-out",
    summary: "Same as 'Closed as Discount' — a write-off receipt.",
    detail:
      "See 'Closed as Discount'. Listed separately because the word 'discount' is overloaded across the app: this one is a payment posting, not a fee structure adjustment.",
  },
  discountTotal: {
    key: "discountTotal",
    label: "Discount Total",
    summary: "All fee-structure discounts on this student.",
    detail:
      "Sum of the manual override discount and any conventional policy reduction. Does NOT include close-out write-offs (those are tracked separately under 'Closed as Discount').",
  },
  lateFeeCharged: {
    key: "lateFeeCharged",
    label: "Late Fee (charged)",
    summary: "Flat late fee charged because the installment passed its due date unpaid.",
    detail:
      "Charged the day an installment goes past its due date with any fee still unsettled — currently a flat ₹1,000 per overdue installment. Once charged it STAYS owed until it is actually paid or explicitly waived; clearing the base afterwards does not remove it. An installment settled in full on or before its due date is never charged, and a previous-year (carry-forward) row never accrues a late fee at all.",
    source: "v_workbook_installment_balances.raw_late_fee",
  },
  lateFeeWaived: {
    key: "lateFeeWaived",
    label: "Late Fee Waived",
    summary: "Late fee forgiven by the school on a specific installment.",
    detail:
      "Each waiver is recorded against the one installment it forgives, with the amount, the reason, who approved it and when. It stays on that installment permanently — later payments cannot move it. An admin can reverse a waiver, which restores the charge and leaves both the waiver and its reversal in the record.",
    source: "student_late_fee_waivers",
  },
  lateFeePending: {
    key: "lateFeePending",
    label: "Late Fee Pending",
    summary: "Late fee still owed after waivers.",
    detail:
      "Late Fee Charged − Late Fee Waived, summed across the student's installments. This is the late-fee portion of Outstanding. It is tracked separately because it never drives overdue or defaulter status — a student who owes nothing but a late fee is not chased as a defaulter.",
    source: "v_workbook_student_financials.late_fee_outstanding_amount",
  },
  baseCharge: {
    key: "baseCharge",
    label: "Base charge",
    summary: "Installment's principal (tuition share + transport share + academic share).",
    detail:
      "The portion of the annual fee allocated to this installment by the schedule, after any annual discount. Late fee is NOT included here — it's tracked separately.",
  },
  amountPaidOnInstallment: {
    key: "amountPaidOnInstallment",
    label: "Paid on this installment",
    summary: "Sum of all payments allocated to this specific installment.",
    detail:
      "Includes payments across multiple receipts that were applied to this installment. Does not include adjustments — those appear as separate entries.",
  },
  pendingOnInstallment: {
    key: "pendingOnInstallment",
    label: "Pending on this installment",
    summary: "Unpaid portion of this installment, including its late fee.",
    detail:
      "Base charge + Late Fee Charged − Late Fee Waived − Paid − Adjustments. Becomes ₹0 once the installment is fully settled.",
  },
  receiptAmount: {
    key: "receiptAmount",
    label: "Receipt amount",
    summary: "Total money received against this single receipt.",
    detail:
      "Equals the sum of payment-row amounts under this receipt. For 'Closed as Discount' receipts, this is the amount written off — no cash moved.",
  },
  paymentMode: {
    key: "paymentMode",
    label: "Payment mode",
    summary: "How the money was received.",
    detail:
      "One of Cash, UPI, Bank transfer, Cheque, or Discount close-out. The 'Discount' mode is a non-cash write-off — see 'Closed as Discount'.",
  },
  paymentDate: {
    key: "paymentDate",
    label: "Payment date",
    summary: "Calendar date the money was received.",
    detail:
      "Set at posting. May differ from the row's created-at timestamp if the receipt was back-dated (e.g. posted in the morning for cash received the previous evening).",
  },
  createdAt: {
    key: "createdAt",
    label: "Posted at",
    summary: "When the row was actually entered into the system (IST).",
    detail:
      "Wall-clock timestamp of when the staff member saved the receipt. Used for audit. Always shown in Asia/Kolkata time, never in browser local time.",
  },
  postedBy: {
    key: "postedBy",
    label: "Posted by",
    summary: "Staff member who entered this receipt.",
    detail:
      "Resolved from receipts.created_by (the authenticated user). Used for audit. If the staff account has been deactivated, the historical posting is still attributed correctly.",
  },
  receivedBy: {
    key: "receivedBy",
    label: "Received by",
    summary: "Free-text name of the person who physically received the cash.",
    detail:
      "Optional. Useful when the person at the counter is different from the system user (e.g. a temporary staff member posting under another account).",
  },
  adjustmentPositive: {
    key: "adjustmentPositive",
    label: "Positive adjustment (+)",
    summary: "A correction that REDUCES the student's outstanding.",
    detail:
      "Recorded against a specific payment row with a mandatory reason. Examples: a recorded waiver, a correction for over-charging, a write-off.",
  },
  adjustmentNegative: {
    key: "adjustmentNegative",
    label: "Negative adjustment (−)",
    summary: "A correction that INCREASES the student's outstanding.",
    detail:
      "Recorded when an earlier payment was over-credited or reversed. The original payment row is never edited; the adjustment row creates an offsetting entry.",
  },
  adjustmentNet: {
    key: "adjustmentNet",
    label: "Adjustment net",
    summary: "Sum of positive + negative adjustments on this student.",
    detail:
      "Positive net = system has reduced the student's due. Negative net = system has increased it. Original payment rows remain unchanged — adjustments are appended.",
  },
  conventionalDiscountPolicy: {
    key: "conventionalDiscountPolicy",
    label: "Conventional discount policy",
    summary: "RTE / Staff Child / 3rd Child Policy.",
    detail:
      "Each policy has a defined tuition treatment: RTE → tuition ₹0, Staff Child → 50%, 3rd Child → ₹6,000. A student may have at most 2 active policies; the one resulting in the lowest tuition wins.",
  },
  todayCollection: {
    key: "todayCollection",
    label: "Today's collection",
    summary: "All money received today (calendar day, IST).",
    detail:
      "Sum of receipts.total_amount where payment_date = today (Asia/Kolkata). Excludes 'Closed as discount' receipts because no cash moved.",
  },
};

export function getMoneyTerm(key: MoneyTermKey): MoneyTerm {
  return MONEY_GLOSSARY[key];
}

export const MONEY_GLOSSARY_ORDER: readonly MoneyTermKey[] = [
  "expectedFees",
  "totalDue",
  "totalPaid",
  "outstanding",
  "pending",
  "feesPending",
  "dueNow",
  "daysOverdue",
  "balanceDue",
  "balanceAfterReceipt",
  "notDueYet",
  "oldBalance",
  "advance",
  "creditBalance",
  "reversed",
  "closedAsDiscount",
  "discountManual",
  "discountConventional",
  "discountCloseout",
  "discountTotal",
  "lateFeeCharged",
  "lateFeeWaived",
  "lateFeePending",
  "baseCharge",
  "amountPaidOnInstallment",
  "pendingOnInstallment",
  "receiptAmount",
  "paymentMode",
  "paymentDate",
  "createdAt",
  "postedBy",
  "receivedBy",
  "adjustmentPositive",
  "adjustmentNegative",
  "adjustmentNet",
  "conventionalDiscountPolicy",
  "todayCollection",
] as const;
