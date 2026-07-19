import type { PaymentMode } from "@/lib/db/types";

export type ReceiptListItem = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
  studentFullName: string;
  admissionNo: string;
  classLabel: string;
};

export type ReceiptBreakdownItem = {
  paymentId: string;
  installmentNo: number;
  installmentLabel: string;
  sessionLabel: string | null;
  dueDate: string;
  amount: number;
  notes: string | null;
  // Allocation snapshot — populated for payments posted after the
  // 20260527000000_persist_payment_allocation_snapshot.sql migration. Older
  // rows have these as `null`, which the UI renders as "—".
  discountAppliedAtPosting: number | null;
  waiverAppliedAtPosting: number | null;
  pendingBeforePosting: number | null;
  pendingAfterPosting: number | null;
};

export type ReceiptFeeSummaryItem = {
  label: string;
  amount: number;
};

/**
 * Live, per-installment status for the whole academic session — sourced from
 * `v_workbook_installment_balances`. Unlike `ReceiptBreakdownItem` (which is the
 * frozen moment-of-posting snapshot for installments THIS receipt touched), this
 * reflects the student's current standing across every installment so the
 * receipt can show a green tick when an installment is fully cleared or the
 * amount still due when it isn't.
 */
export type ReceiptInstallmentStatusItem = {
  installmentNo: number;
  label: string;
  dueDate: string;
  expected: number;
  paid: number;
  pending: number;
  lateFee: number;
  status: "paid" | "partial" | "overdue" | "pending";
};

/** A prior receipt for the same student, shown for context on the receipt. */
export type ReceiptHistoryItem = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  totalAmount: number;
};

export type ConventionalDiscountAssignmentSummary = {
  assignmentId: string;
  policyCode: string;
  policyDisplayName: string;
  beforeTuitionAmount: number;
  resultingTuitionAmount: number;
  /**
   * True for the single assignment whose `resultingTuitionAmount` actually applies
   * (lowest candidate wins per school rule). Other rows are kept for the audit
   * trail but their savings have already been superseded.
   */
  isWinningPolicy: boolean;
};

export type ReceiptDetail = {
  id: string;
  studentId: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
  createdByName: string | null;
  studentFullName: string;
  admissionNo: string;
  fatherName: string | null;
  fatherPhone: string | null;
  parentEmail: string | null;
  classLabel: string;
  sessionLabel: string;
  transportRouteLabel: string;
  studentStatusLabel: "New" | "Old";
  feeSummary: ReceiptFeeSummaryItem[];
  totalDue: number;
  totalPaidBeforeReceipt: number;
  totalPaidToDate: number;
  outstandingAfterReceipt: number;
  currentOutstanding: number;
  discountAmount: number;
  lateFeeAmount: number;
  lateFeeWaived: number;
  breakdown: ReceiptBreakdownItem[];
  installmentStatus: ReceiptInstallmentStatusItem[];
  previousReceipts: ReceiptHistoryItem[];
  conventionalDiscountAssignments: ConventionalDiscountAssignmentSummary[];
  /** Total money reversed off this receipt via payment_adjustments (positive).
   * Optional — draft previews and older fixtures don't carry reversal context. */
  reversedAmount?: number;
  /** True when reversals cancel the receipt in full (undo or full refund). */
  isVoided?: boolean;
  /** Reason of the first reversal adjustment, for the VOID banner. */
  voidReason?: string | null;
};
