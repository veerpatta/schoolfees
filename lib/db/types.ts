import type { StaffRole } from "@/lib/auth/roles";

export type ClassStatus = "active" | "inactive" | "archived";
export type StudentStatus = "active" | "inactive" | "left" | "graduated";
export type InstallmentStatus = "scheduled" | "waived" | "cancelled";
export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";
export type AdjustmentType =
  | "reversal"
  | "correction"
  | "discount"
  | "writeoff";
export type AuditAction = "insert" | "update" | "delete";

export type UserRecord = {
  id: string;
  fullName: string;
  role: StaffRole;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ClassRecord = {
  id: string;
  sessionLabel: string;
  className: string;
  section: string | null;
  streamName: string | null;
  sortOrder: number;
  status: ClassStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type TransportRouteRecord = {
  id: string;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type StudentRecord = {
  id: string;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  address: string | null;
  classId: string;
  transportRouteId: string | null;
  status: StudentStatus;
  joinedOn: string | null;
  leftOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type FeeSettingRecord = {
  id: string;
  classId: string;
  annualBaseAmount: number;
  tuitionFeeAmount: number;
  transportFeeAmount: number;
  booksFeeAmount: number;
  admissionActivityMiscFeeAmount: number;
  otherFeeHeads: Record<string, number>;
  lateFeeFlatAmount: number;
  installmentCount: number;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type SchoolFeeDefaultRecord = {
  id: string;
  tuitionFeeAmount: number;
  transportFeeAmount: number;
  booksFeeAmount: number;
  admissionActivityMiscFeeAmount: number;
  otherFeeHeads: Record<string, number>;
  lateFeeFlatAmount: number;
  installmentCount: number;
  installmentDueDates: string[];
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type StudentFeeOverrideRecord = {
  id: string;
  studentId: string;
  feeSettingId: string;
  customAnnualBaseAmount: number | null;
  customTransportInstallmentAmount: number | null;
  customTuitionFeeAmount: number | null;
  customTransportFeeAmount: number | null;
  customBooksFeeAmount: number | null;
  customAdmissionActivityMiscFeeAmount: number | null;
  customOtherFeeHeads: Record<string, number> | null;
  customLateFeeFlatAmount: number | null;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  discountAmount: number;
  reason: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type InstallmentRecord = {
  id: string;
  studentId: string;
  classId: string;
  feeSettingId: string;
  studentFeeOverrideId: string | null;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  baseAmount: number;
  transportAmount: number;
  discountAmount: number;
  amountDue: number;
  lateFeeFlatAmount: number;
  status: InstallmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ReceiptRecord = {
  id: string;
  receiptNumber: string;
  studentId: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type PaymentRecord = {
  id: string;
  receiptId: string;
  studentId: string;
  installmentId: string;
  amount: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type PaymentAdjustmentRecord = {
  id: string;
  paymentId: string;
  studentId: string;
  installmentId: string;
  adjustmentType: AdjustmentType;
  amountDelta: number;
  reason: string;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type AuditLogRecord = {
  id: string;
  tableName: string;
  recordId: string;
  action: AuditAction;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedBy: string | null;
  createdAt: string;
};
