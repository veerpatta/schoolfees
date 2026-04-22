import type { ClassStatus, PaymentMode } from "@/lib/db/types";
import type { FeePolicySummary, SchoolFeeDefault } from "@/lib/fees/types";

export type SetupActionStatus = "idle" | "success" | "error";

export type SetupActionState = {
  status: SetupActionStatus;
  message: string | null;
};

export const INITIAL_SETUP_ACTION_STATE: SetupActionState = {
  status: "idle",
  message: null,
};

export type SetupChecklistStatus = "complete" | "incomplete" | "warning";

export type SetupChecklistItem = {
  key: string;
  label: string;
  detail: string;
  status: SetupChecklistStatus;
  blocking: boolean;
  href: string;
};

export type SetupFlowStatus = "done" | "current" | "attention" | "upcoming";

export type SetupFlowItem = {
  key: string;
  label: string;
  detail: string;
  href: string;
  status: SetupFlowStatus;
};

export type SetupClassRow = {
  id: string;
  className: string;
  section: string | null;
  streamName: string | null;
  sortOrder: number;
  status: ClassStatus;
  notes: string | null;
  label: string;
};

export type SetupRouteRow = {
  id: string;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  isActive: boolean;
  notes: string | null;
};

export type SetupClassDefaultRow = {
  classId: string;
  classLabel: string;
  hasSavedDefault: boolean;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
};

export type SetupCompletionState = {
  id: string | null;
  setupCompletedAt: string | null;
  completionNotes: string | null;
};

export type SetupReadinessSummary = {
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  readyForCompletion: boolean;
  collectionDeskReady: boolean;
  checklist: SetupChecklistItem[];
  missingBlockingItems: SetupChecklistItem[];
};

export type SetupImportSummary = {
  completedBatches: number;
  batchesWithAnomalies: number;
};

export type SetupWizardData = {
  policy: FeePolicySummary;
  schoolDefault: SchoolFeeDefault;
  sessionSuggestions: string[];
  activeSessionClasses: SetupClassRow[];
  routes: SetupRouteRow[];
  classDefaults: SetupClassDefaultRow[];
  completionState: SetupCompletionState;
  readiness: SetupReadinessSummary;
  flow: SetupFlowItem[];
  importSummary: SetupImportSummary;
  activeSessionStudentCount: number;
  activeSessionClassDefaultCount: number;
  installmentCount: number;
};

export type SaveSetupPolicyInput = {
  academicSessionLabel: string;
  installmentDueDateLabels: string[];
  lateFeeFlatAmount: number;
  acceptedPaymentModes: PaymentMode[];
  receiptPrefix: string | null;
};

export type SaveSetupSchoolDefaultsInput = {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
};

export type SaveSetupClassRowInput = {
  id: string | null;
  className: string;
  section: string | null;
  streamName: string | null;
  sortOrder: number;
  status: ClassStatus;
  notes: string | null;
};

export type SaveSetupRouteRowInput = {
  id: string | null;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  isActive: boolean;
  notes: string | null;
};

export type SaveSetupClassDefaultInput = {
  classId: string;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
};
