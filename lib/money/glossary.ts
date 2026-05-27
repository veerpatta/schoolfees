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
  | "totalPaid"
  | "outstanding"
  | "pending"
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
  | "todayCollection";

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
    summary: "What the student owes for the academic year.",
    detail:
      "Sum of tuition + transport + academic fee + other heads, after any annual discount, plus any late fees the system has charged this year. Recomputed every time you load the page — no stale snapshots.",
    source: "v_workbook_student_financials.total_due",
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
    summary: "Total Due − Total Paid. Money still owed today.",
    detail:
      "Always equals Total Due − Total Paid for the active academic session. If the student has a credit balance (paid more than due), Outstanding is ₹0 and the surplus shows as Credit Balance.",
  },
  pending: {
    key: "pending",
    label: "Pending",
    summary: "Same as Outstanding, shown on installment-level views.",
    detail:
      "When shown next to a specific installment, this is the unpaid portion of THAT installment (including its late fee, minus any waiver). When shown at the student level, it equals Outstanding.",
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
    summary: "Raw late fee the system charged this installment.",
    detail:
      "Charged when an installment had any payment after its due date. Currently a flat ₹1,000 per overdue installment (per active policy). The 'waived' portion may be subtracted before the parent owes it — see Late Fee Waived.",
  },
  lateFeeWaived: {
    key: "lateFeeWaived",
    label: "Late Fee Waived",
    summary: "Portion of the late fee written off by the school.",
    detail:
      "Authorized waiver amount, applied in installment order. If the late fee charged equals the waiver, the parent owes ₹0 on the late-fee line for that installment.",
    source: "student_fee_overrides.late_fee_waiver_amount",
  },
  lateFeePending: {
    key: "lateFeePending",
    label: "Late Fee Pending",
    summary: "Late fee still owed after waiver.",
    detail:
      "Late Fee Charged − Late Fee Waived, on the installments where the charged amount exceeds the waiver. Aggregated across all installments at the student level.",
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
  "totalDue",
  "totalPaid",
  "outstanding",
  "pending",
  "balanceDue",
  "balanceAfterReceipt",
  "creditBalance",
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
