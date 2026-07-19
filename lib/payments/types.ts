import type { PaymentMode } from "@/lib/db/types";
import type { OfficeSyncOutcome } from "@/lib/system-sync/office-sync";

export type DuplicatePaymentKind = "near-duplicate" | "daily-amount";

export type PaymentEntryActionState = {
  status: "idle" | "error" | "success" | "duplicate";
  message: string | null;
  receiptNumber: string | null;
  receiptId: string | null;
  studentId: string | null;
  amountReceived?: number | null;
  quickDiscountApplied?: number | null;
  lateFeeWaivedApplied?: number | null;
  paymentDate?: string | null;
  paymentMode?: PaymentMode | null;
  referenceNumber?: string | null;
  receivedBy?: string | null;
  clientRequestId?: string | null;
  remainingBalance?: number | null;
  diagnostic?: PaymentPostingDiagnostic | null;
  syncOutcome?: OfficeSyncOutcome | null;
  /** Audit 1.4 — distinguish near-duplicate (hard) from daily-amount (soft override). */
  duplicateKind?: DuplicatePaymentKind | null;
  /** Details of the receipt a duplicate warning matched, so the sheet can show
   * "Receipt SVP-NNNN for ₹N (Cash) was saved at HH:MM". Optional so in-flight
   * clients from an older deploy degrade gracefully. */
  existingReceiptCreatedAt?: string | null;
  existingReceiptAmount?: number | null;
  existingReceiptMode?: string | null;
};

export const INITIAL_PAYMENT_ENTRY_ACTION_STATE: PaymentEntryActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
  receiptId: null,
  studentId: null,
  amountReceived: null,
  quickDiscountApplied: null,
  lateFeeWaivedApplied: null,
  paymentDate: null,
  paymentMode: null,
  referenceNumber: null,
  receivedBy: null,
  clientRequestId: null,
  remainingBalance: null,
  diagnostic: null,
  syncOutcome: null,
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
  fatherPhone?: string | null;
  studentStatus: string;
};

export type InstallmentBalanceItem = {
  installmentId: string;
  installmentNo: number;
  installmentLabel: string;
  displayLabel?: string;
  isCarryForward?: boolean;
  sourceSessionLabel?: string | null;
  targetSessionLabel?: string | null;
  feeBucket?: string | null;
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
  displayLabel?: string;
  isCarryForward?: boolean;
  sourceSessionLabel?: string | null;
  dueDate: string;
  outstandingBefore: number;
  allocatedAmount: number;
  outstandingAfter: number;
};

export type FeeHeadDistribution = {
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number;
  /** Manual / flat discount amount applied at the student level. */
  discountAmount: number;
  /** Total reduction from conventional discount policies (e.g. RTE / Staff Child / 3rd Child). */
  conventionalDiscountAmount: number;
  /** Human-readable conventional discount labels (e.g. ["RTE"]). */
  conventionalDiscountLabels: string[];
  installmentCount: number;
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
  /** Base owed, late fee excluded — drives Due now / Overdue / defaulter status. */
  baseOutstandingAmount: number;
  /** Late-fee remainder still owed (separate fine). */
  lateFeeOutstandingAmount: number;
  creditBalance: number;
  overpaidAmount: number;
  refundableAmount: number;
  rowsKeptForReview: number;
  overdueAmount: number;
  nextDueInstallmentLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  feeHeadDistribution?: FeeHeadDistribution;
  confirmedFamilyGroupId?: string | null;
  confirmedSiblingCount?: number;
};

export type PaymentDeskIssue = {
  /**
   * Stable identifier mirroring `PaymentDeskBlockingReasonKey`. Optional so
   * legacy emission sites still typecheck while we migrate the table; render
   * sites should translate by key when present and fall back to the
   * shipped-from-server English title/detail/actionLabel otherwise.
   */
  key?: string;
  keyValues?: Record<string, string | number>;
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
  repairStudentId?: string | null;
};

/**
 * Where a payment is being collected from. `left_student_recovery` is the
 * guarded mode used by the Admin Tools recovery queue to collect existing dues
 * from students who have LEFT — it relaxes the active-student posting gate but
 * never prepares new dues or reactivates the student.
 */
export type PaymentCollectionContext = "regular" | "left_student_recovery";

export type PaymentEntryPageData = {
  studentIndex: PaymentStudentIndexItem[];
  initialStudentId: string | null;
  initialClassId: string;
  /** Set to `left_student_recovery` when the desk is opened in recovery mode. */
  collectionContext?: PaymentCollectionContext;
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
  sessionLabel: string;
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
