/**
 * The shape of a workbook row.
 *
 * These lived in data/queries.ts beside the functions that fetch them, which
 * meant three pure modules had to import a data file to name a row type. A
 * type describes a shape, not an act of IO, so it belongs here.
 */

export type WorkbookClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type WorkbookStudentFinancial = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  recordStatus: string;
  classId: string;
  sessionLabel: string;
  className: string;
  classLabel: string;
  sortOrder: number;
  transportRouteId: string | null;
  transportRouteName: string | null;
  transportRouteCode: string | null;
  studentStatusCode: "new" | "existing";
  studentStatusLabel: "New" | "Old";
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number;
  grossBaseBeforeDiscount: number;
  /**
   * Total of both discount lines. Split across the two fields below: the
   * conventional part comes from an RTE / Staff Child / 3rd Child policy, the
   * student part is the owner-entered extra on top of it.
   */
  discountAmount: number;
  conventionalDiscountAmount: number;
  studentDiscountAmount: number;
  conventionalDiscountLabels: string | null;
  lateFeeWaiverAmount: number;
  baseChargeTotal: number;
  lateFeeTotal: number;
  /** Balance cleared by a `payment_mode = 'discount'` write-off. Not cash. */
  discountClosedAmount: number;
  totalDue: number;
  totalPaid: number;
  /**
   * Fees still owed. Never contains a late fee -- see the late-fee split in
   * 20260812120000. This is the number that decides overdue and defaulter
   * status, so a family whose only debt is a late fee is not a defaulter.
   */
  outstandingAmount: number;
  /** Identical to outstandingAmount since the split. Kept for readability. */
  baseOutstandingAmount: number;
  lateFeeOutstandingAmount: number;
  /** Fees + late fee. What a cashier can actually collect from this student. */
  totalOwedAmount: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  nextDueLabel: string | null;
  lastPaymentDate: string | null;
  inst1Pending: number;
  inst2Pending: number;
  inst3Pending: number;
  inst4Pending: number;
  statusLabel: "" | "PAID" | "NOT STARTED" | "OVERDUE" | "PARTLY PAID";
  overrideReason: string | null;
  paidInstallmentCount: number;
  partlyPaidInstallmentCount: number;
  overdueInstallmentCount: number;
};

export type WorkbookInstallmentBalance = {
  installmentId: string;
  studentId: string;
  admissionNo: string;
  studentName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  sessionLabel: string;
  classId: string;
  className: string;
  classLabel: string;
  section: string;
  streamName: string;
  installmentNo: number;
  installmentLabel: string;
  isCarryForward?: boolean;
  sourceSessionLabel?: string | null;
  targetSessionLabel?: string | null;
  feeBucket?: string | null;
  dueDate: string;
  transportRouteId: string | null;
  transportRouteName: string | null;
  transportRouteCode: string | null;
  lastPaymentDate: string | null;
  baseCharge: number;
  /**
   * Raw cash receipted against this installment, BEFORE adjustments.
   *
   * Almost never the figure to show a user: it still counts a reversed
   * receipt. Use `appliedAmount` for "how much has this student actually
   * paid".
   */
  paidAmount: number;
  /**
   * Cash that actually stuck to the PIN: `paidAmount` net of cash adjustments,
   * floored at zero. Since 20260905090000 this is the historical record of
   * which installment a receipt was written against — it is what `total_paid`
   * sums, but it is NOT where the money is read as sitting. For "how much of
   * this installment is paid" use `settledAmount`.
   */
  appliedAmount: number;
  /**
   * What the family's money has settled on this row, oldest row first. Every
   * rupee paid this session is one pool that clears installment 1, then 2,
   * then 3, then 4 — each row's fees first, then its late fee — whatever
   * installment the receipt was pinned to. `pendingAmount`, `lateFeePending`
   * and `balanceStatus` are derived from this, never from `appliedAmount`.
   */
  settledAmount: number;
  /** The part of `settledAmount` that covers fees. `min(settledAmount, baseCharge)`. */
  feeSettledAmount: number;
  /** The part of `settledAmount` that covers the late fee. */
  lateFeeSettledAmount: number;
  /** 0 when an active EMI plan covers the row (settled first), else 1. */
  planPriority: number;
  /** 1-based position in the pool's settlement order for this student and session. */
  settlementRank: number;
  /** Balance cleared by a discount-mode write-off. Not cash. */
  discountCloseoutAmount: number;
  /** Every adjustment on the row — cash reversals AND discount write-offs. */
  adjustmentAmount: number;
  rawLateFee: number;
  waiverApplied: number;
  finalLateFee: number;
  totalCharge: number;
  /**
   * Fees still owed on this installment. Never contains a late fee, and
   * `balanceStatus` reads 'paid' as soon as it hits zero even while
   * `lateFeePending` is still positive.
   */
  pendingAmount: number;
  /** Late fee still owed here, after waivers and after any payment on it. */
  lateFeePending: number;
  /** `pendingAmount + lateFeePending`. What the counter can collect. */
  totalPending: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
  lateFeeStatus: "none" | "pending" | "waived" | "paid";
};

export type WorkbookTransaction = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  createdAt?: string | null;
  paymentMode: string;
  referenceNumber: string | null;
  receivedBy?: string | null;
  totalAmount: number;
  studentId: string;
  studentName: string;
  admissionNo: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classId: string | null;
  classLabel: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
  sessionLabel: string | null;
  currentOutstanding: number;
  currentTotalPaid: number;
  discountApplied: number;
  lateFeeWaived: number;
  /** True when reversal adjustments cancel this receipt in full (undo/refund). */
  isReversed?: boolean;
};
