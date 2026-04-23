import type { FeeCalculationModel, PaymentMode } from "@/lib/db/types";

export type ConfigChangeScope =
  | "global_policy"
  | "school_defaults"
  | "class_defaults"
  | "transport_defaults"
  | "student_override";

export type ConfigChangeFieldDiff = {
  field: string;
  label: string;
  beforeValue: string;
  afterValue: string;
};

export type ConfigChangeImpactPreview = {
  scope: ConfigChangeScope;
  scopeLabel: string;
  targetLabel: string;
  changedFields: ConfigChangeFieldDiff[];
  studentsInScope: number;
  studentsAffected: number;
  installmentsToInsert: number;
  installmentsToUpdate: number;
  installmentsToCancel: number;
  blockedInstallments: number;
  blockedFullyPaidInstallments: number;
  blockedPartiallyPaidInstallments: number;
  blockedAdjustedInstallments: number;
  updatesLimitedToFutureUnpaid: boolean;
  rowsMarkedForReview: number;
};

export type LedgerRegenerationReviewRow = {
  studentId: string;
  studentLabel: string;
  classLabel: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  balanceStatus: "paid" | "partial" | "unpaid" | "future" | "waived" | "cancelled";
  actionNeeded: "insert" | "update" | "cancel" | "skip" | "review";
  reasonLabel: string;
  outstandingAmount: number;
};

export type LedgerRegenerationPreview = {
  policyRevisionId: string | null;
  policyRevisionLabel: string;
  reason: string;
  totalActiveStudents: number;
  studentsInAcademicSession: number;
  studentsWithResolvedSettings: number;
  studentsMissingSettings: number;
  existingInstallments: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsCancelled: number;
  rowsRecalculated: number;
  rowsSkipped: number;
  rowsRequiringReview: number;
  paidInstallments: number;
  partiallyPaidInstallments: number;
  unpaidInstallments: number;
  futureInstallments: number;
  affectedStudents: number;
  reviewRowsTotal: number;
  reviewRows: LedgerRegenerationReviewRow[];
};

export type LedgerRegenerationActionStatus = "idle" | "preview" | "success" | "error";

export type LedgerRegenerationActionState = {
  status: LedgerRegenerationActionStatus;
  message: string | null;
  batchId: string | null;
  preview: LedgerRegenerationPreview | null;
};

export const INITIAL_LEDGER_REGENERATION_ACTION_STATE: LedgerRegenerationActionState = {
  status: "idle",
  message: null,
  batchId: null,
  preview: null,
};

export type FeeSetupActionStatus = "idle" | "preview" | "success" | "error";

export type FeeSetupActionState = {
  status: FeeSetupActionStatus;
  message: string | null;
  changeBatchId: string | null;
  preview: ConfigChangeImpactPreview | null;
};

export const INITIAL_FEE_SETUP_ACTION_STATE: FeeSetupActionState = {
  status: "idle",
  message: null,
  changeBatchId: null,
  preview: null,
};

export type InstallmentScheduleItem = {
  label: string;
  dueDateLabel: string;
  dueDate: string;
};

export type FeeHeadDefinition = {
  id: string;
  label: string;
};

export type FeeHeadAmount = FeeHeadDefinition & {
  amount: number;
};

export type ResolvedFeeBreakdown = {
  coreHeads: FeeHeadAmount[];
  customHeads: FeeHeadAmount[];
  annualTotal: number;
  calculationModel: FeeCalculationModel;
  studentType: "new" | "existing";
  academicFeeAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number;
  grossBaseBeforeDiscount: number;
  discountApplied: number;
  lateFeeWaiverAmount: number;
  booksExcludedFromWorkbook: boolean;
};

export type FeePolicySummary = {
  id: string | null;
  academicSessionLabel: string;
  calculationModel: FeeCalculationModel;
  installmentCount: number;
  installmentSchedule: InstallmentScheduleItem[];
  lateFeeFlatAmount: number;
  lateFeeLabel: string;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  acceptedPaymentModes: Array<{
    value: PaymentMode;
    label: string;
  }>;
  receiptPrefix: string;
  customFeeHeads: FeeHeadDefinition[];
  notes: string | null;
};

export type SchoolFeeDefault = {
  id: string | null;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
  updatedAt: string | null;
};

export type ClassFeeDefault = {
  id: string;
  classId: string;
  classLabel: string;
  sessionLabel: string;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  annualTotal: number;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
  updatedAt: string;
};

export type TransportDefault = {
  id: string;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  annualFeeAmount: number | null;
  isActive: boolean;
  notes: string | null;
  updatedAt: string;
};

export type StudentFeeOverride = {
  id: string;
  studentId: string;
  studentLabel: string;
  classLabel: string;
  feeSettingId: string;
  customTuitionFeeAmount: number | null;
  customTransportFeeAmount: number | null;
  customBooksFeeAmount: number | null;
  customAdmissionActivityMiscFeeAmount: number | null;
  customFeeHeadAmounts: Record<string, number>;
  customLateFeeFlatAmount: number | null;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  lateFeeWaiverAmount: number;
  discountAmount: number;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  reason: string;
  notes: string | null;
  updatedAt: string;
};

export type FeeSetupClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type FeeSetupStudentOption = {
  id: string;
  label: string;
  classId: string;
  classLabel: string;
};

export type FeeSetupRouteOption = {
  id: string;
  label: string;
  routeCode: string | null;
  isActive: boolean;
};

export type FeeSetupPageData = {
  globalPolicy: FeePolicySummary;
  schoolDefault: SchoolFeeDefault;
  classDefaults: ClassFeeDefault[];
  transportDefaults: TransportDefault[];
  studentOverrides: StudentFeeOverride[];
  classOptions: FeeSetupClassOption[];
  studentOptions: FeeSetupStudentOption[];
  routeOptions: FeeSetupRouteOption[];
};

export type StudentFinancialSnapshot = {
  policy: FeePolicySummary;
  resolvedBreakdown: ResolvedFeeBreakdown;
  currentOutstanding: number;
  openInstallments: number;
  overdueInstallments: number;
  nextDueDate: string | null;
  nextDueLabel: string | null;
  nextDueAmount: number | null;
  activeOverrideReason: string | null;
};
