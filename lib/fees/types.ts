export type FeeSetupActionStatus = "idle" | "success" | "error";

export type FeeSetupActionState = {
  status: FeeSetupActionStatus;
  message: string | null;
};

export const INITIAL_FEE_SETUP_ACTION_STATE: FeeSetupActionState = {
  status: "idle",
  message: null,
};

export type FeeHeadBreakdown = {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  otherFeeHeads: Record<string, number>;
};

export type SchoolFeeDefault = FeeHeadBreakdown & {
  id: string;
  lateFeeFlatAmount: number;
  installmentCount: number;
  installmentDueDates: string[];
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
  updatedAt: string;
};

export type ClassFeeDefault = FeeHeadBreakdown & {
  id: string;
  classId: string;
  classLabel: string;
  sessionLabel: string;
  annualBaseAmount: number;
  lateFeeFlatAmount: number;
  installmentCount: number;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
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
  customOtherFeeHeads: Record<string, number>;
  customLateFeeFlatAmount: number | null;
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

export type FeeSetupPageData = {
  schoolDefault: SchoolFeeDefault | null;
  classDefaults: ClassFeeDefault[];
  studentOverrides: StudentFeeOverride[];
  classOptions: FeeSetupClassOption[];
  studentOptions: FeeSetupStudentOption[];
};
