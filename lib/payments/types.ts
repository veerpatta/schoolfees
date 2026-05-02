import type { PaymentMode } from "@/lib/db/types";

export type PaymentEntryActionState = {
  status: "idle" | "error" | "success" | "duplicate";
  message: string | null;
  receiptNumber: string | null;
  receiptId: string | null;
  studentId: string | null;
  amountReceived?: number | null;
  paymentDate?: string | null;
  paymentMode?: PaymentMode | null;
  referenceNumber?: string | null;
  receivedBy?: string | null;
  clientRequestId?: string | null;
  remainingBalance?: number | null;
  diagnostic?: PaymentPostingDiagnostic | null;
};

export const INITIAL_PAYMENT_ENTRY_ACTION_STATE: PaymentEntryActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
  receiptId: null,
  studentId: null,
  amountReceived: null,
  paymentDate: null,
  paymentMode: null,
  referenceNumber: null,
  receivedBy: null,
  clientRequestId: null,
  remainingBalance: null,
  diagnostic: null,
};

export type PaymentPostingDiagnostic = {
  rawRpcErrorCode: string | null;
  rawRpcErrorMessage: string | null;
  studentId: string | null;
  activeFeeSetupSession: string | null;
  studentClassSession: string | null;
  installmentCount: number | null;
  previewPendingAmount: number | null;
  revisedPendingAmount?: number | null;
  selectedPaymentDate: string | null;
  previewWorked: boolean;
  postStudentPaymentWorked: boolean;
  autoPrepareAttempted: boolean;
  autoPrepareWorked: boolean | null;
  reason: string;
};

export type PaymentStudentOption = {
  id: string;
  fullName: string;
  admissionNo: string;
  classId?: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  studentStatus?: string;
  pendingAmount: number | null;
};

export type PaymentStudentIndexItem = {
  id: string;
  fullName: string;
  admissionNo: string;
  classId: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  studentStatus: string;
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
  creditBalance: number;
  overpaidAmount: number;
  refundableAmount: number;
  rowsKeptForReview: number;
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
  repairStudentId?: string | null;
};

export type PaymentEntryPageData = {
  studentIndex: PaymentStudentIndexItem[];
  initialStudentId: string | null;
  initialClassId: string;
  initialStudentSummary: SelectedStudentSummary | null;
  initialStudentIssue: PaymentDeskIssue | null;
  initialLatestReceipt: {
    id: string;
    receiptNumber: string;
    studentId: string;
    studentLabel: string;
    totalAmount: number;
    paymentMode: string;
    paymentDate: string;
    createdAt: string | null;
  } | null;
  modeOptions: PaymentModeOption[];
  policyNote: string;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    studentId: string;
    studentLabel: string;
    totalAmount: number;
    paymentMode: string;
    paymentDate: string;
    createdAt: string | null;
  }>;
  todayCollection: {
    receiptCount: number;
    totalAmount: number;
  };
};

export type PaymentDeskStudentSummary = {
  student: SelectedStudentSummary | null;
  issue: PaymentDeskIssue | null;
  latestReceipt: PaymentEntryPageData["initialLatestReceipt"];
  suggestedDefaultAmount: number | null;
  paymentDate: string;
};

export type PaymentModeOption = {
  value: PaymentMode;
  label: string;
};
