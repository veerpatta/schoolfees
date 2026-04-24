import type { PaymentMode } from "@/lib/db/types";

export type PaymentEntryActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  receiptNumber: string | null;
  receiptId: string | null;
  studentId: string | null;
};

export const INITIAL_PAYMENT_ENTRY_ACTION_STATE: PaymentEntryActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
  receiptId: null,
  studentId: null,
};

export type PaymentStudentOption = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  pendingAmount: number;
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
  rawLateFee: number;
  waiverApplied: number;
  finalLateFee: number;
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
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  studentStatusLabel: string;
  transportRouteLabel: string;
  breakdown: InstallmentBalanceItem[];
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  overdueAmount: number;
  nextDueInstallmentLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
};

export type PaymentDeskIssue = {
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export type PaymentEntryPageData = {
  studentOptions: PaymentStudentOption[];
  selectedStudent: SelectedStudentSummary | null;
  selectedStudentIssue: PaymentDeskIssue | null;
  searchQuery: string;
  classId: string;
  modeOptions: PaymentModeOption[];
  policyNote: string;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    studentId: string;
    studentLabel: string;
    totalAmount: number;
  }>;
  todayCollection: {
    receiptCount: number;
    totalAmount: number;
  };
};

export type PaymentModeOption = {
  value: PaymentMode;
  label: string;
};
