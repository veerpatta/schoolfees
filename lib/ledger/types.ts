import type { AdjustmentType, PaymentMode } from "@/lib/db/types";

export type LedgerStudentOption = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
};

export type LedgerPaymentRow = {
  id: string;
  createdAt: string;
  paymentDate: string;
  receiptNumber: string;
  installmentLabel: string;
  dueDate: string;
  paymentMode: PaymentMode;
  paymentAmount: number;
  referenceNumber: string | null;
  receivedBy: string | null;
  notes: string | null;
  adjustmentCount: number;
  adjustmentNetDelta: number;
};

export type LedgerAdjustmentRow = {
  id: string;
  createdAt: string;
  paymentId: string;
  receiptNumber: string;
  paymentDate: string;
  installmentLabel: string;
  dueDate: string;
  paymentAmount: number;
  adjustmentType: AdjustmentType;
  amountDelta: number;
  reason: string;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
};

export type LedgerSelectedStudent = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  paymentOptions: LedgerPaymentRow[];
  payments: LedgerPaymentRow[];
  adjustments: LedgerAdjustmentRow[];
  totalPayments: number;
  totalAdjustmentNet: number;
  totalCreditAdjustments: number;
  totalDebitAdjustments: number;
};

export type LedgerEntryFilter = "all" | "payments" | "adjustments";

export type LedgerPageData = {
  searchQuery: string;
  entryQuery: string;
  entryFilter: LedgerEntryFilter;
  studentOptions: LedgerStudentOption[];
  selectedStudent: LedgerSelectedStudent | null;
};

export type LedgerAdjustmentActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const INITIAL_LEDGER_ADJUSTMENT_ACTION_STATE: LedgerAdjustmentActionState = {
  status: "idle",
  message: null,
};
