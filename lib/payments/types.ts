import type { PaymentMode } from "@/lib/db/types";

export type PaymentEntryActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  receiptNumber: string | null;
};

export const INITIAL_PAYMENT_ENTRY_ACTION_STATE: PaymentEntryActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
};

export type PaymentStudentOption = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
};

export type InstallmentBalanceItem = {
  installmentId: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  amountDue: number;
  paymentsTotal: number;
  adjustmentsTotal: number;
  outstandingAmount: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
};

export type PaymentAllocationItem = {
  installmentId: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  outstandingBefore: number;
  allocatedAmount: number;
  outstandingAfter: number;
};

export type SelectedStudentSummary = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  breakdown: InstallmentBalanceItem[];
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  nextDueInstallmentLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
};

export type PaymentEntryPageData = {
  studentOptions: PaymentStudentOption[];
  selectedStudent: SelectedStudentSummary | null;
  searchQuery: string;
};

export type PaymentModeOption = {
  value: PaymentMode;
  label: string;
};
