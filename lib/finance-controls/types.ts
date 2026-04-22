import type {
  CashDepositStatus,
  CollectionCloseStatus,
  CorrectionReviewStatus,
  PaymentMode,
  ReconciliationStatus,
  RefundRequestStatus,
} from "@/lib/db/types";

export type FinanceModeTotal = {
  paymentMode: PaymentMode;
  totalAmount: number;
  receiptCount: number;
};

export type FinanceReceivedByTotal = {
  receivedBy: string;
  totalAmount: number;
  receiptCount: number;
};

export type FinanceDaySummarySnapshot = {
  receiptCount: number;
  receiptTotal: number;
  refundRequestCount: number;
  refundRequestTotal: number;
  refundProcessedCount: number;
  refundProcessedTotal: number;
  netCashTotal: number;
  pendingRefundCount: number;
  pendingRefundTotal: number;
  correctionCount: number;
  correctionNet: number;
  pendingCorrectionCount: number;
  pendingCorrectionNet: number;
  modeTotals: FinanceModeTotal[];
  receivedByTotals: FinanceReceivedByTotal[];
  closeStatus: CollectionCloseStatus | null;
  cashDepositStatus: CashDepositStatus | null;
  reconciliationStatus: ReconciliationStatus | null;
};

export type FinanceClosureRecord = {
  id: string;
  paymentDate: string;
  status: CollectionCloseStatus;
  cashDepositStatus: CashDepositStatus;
  reconciliationStatus: ReconciliationStatus;
  bankDepositReference: string | null;
  closeNote: string | null;
  summarySnapshot: FinanceDaySummarySnapshot;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
};

export type FinanceDayBookRow = {
  entryType: "collection" | "refund" | "correction";
  entryId: string;
  entryDate: string;
  postedAt: string;
  studentId: string | null;
  studentName: string;
  admissionNo: string | null;
  classLabel: string | null;
  receiptNumber: string | null;
  referenceNumber: string | null;
  paymentMode: PaymentMode | null;
  receivedBy: string | null;
  cashIn: number;
  cashOut: number;
  ledgerEffect: number;
  statusLabel: string;
  statusTone: "good" | "warning" | "neutral" | "accent";
  createdByName: string | null;
  note: string | null;
};

export type FinanceRefundRequestRow = {
  refundRequestId: string;
  refundDate: string;
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  refundMethod: PaymentMode;
  requestedAmount: number;
  refundReference: string | null;
  status: RefundRequestStatus;
  reason: string;
  notes: string | null;
  approvalNote: string | null;
  processingNote: string | null;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  processedByName: string | null;
};

export type FinanceCorrectionReviewRow = {
  paymentAdjustmentId: string;
  paymentId: string;
  entryDate: string;
  postedAt: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  paymentMode: PaymentMode;
  receivedBy: string | null;
  receiptNumber: string;
  paymentDate: string;
  installmentLabel: string;
  adjustmentType: string;
  amountDelta: number;
  reason: string;
  notes: string | null;
  reviewStatus: CorrectionReviewStatus | "pending";
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdByName: string | null;
};

export type FinanceReceiptOption = {
  id: string;
  label: string;
  receiptNumber: string;
  paymentDate: string;
  totalAmount: number;
};

export type FinanceControlsPageData = {
  selectedDate: string;
  summary: FinanceDaySummarySnapshot;
  closure: FinanceClosureRecord | null;
  modeTotals: FinanceModeTotal[];
  receivedByTotals: FinanceReceivedByTotal[];
  dayBookRows: FinanceDayBookRow[];
  refundRequests: FinanceRefundRequestRow[];
  correctionRows: FinanceCorrectionReviewRow[];
  receiptOptions: FinanceReceiptOption[];
};

export type FinanceControlsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
