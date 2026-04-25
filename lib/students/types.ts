import type { StudentStatus } from "@/lib/db/types";

export type StudentClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type StudentRouteOption = {
  id: string;
  label: string;
  routeCode: string | null;
  isActive: boolean;
};

export type StudentListFilters = {
  query: string;
  sessionLabel: string;
  classId: string;
  transportRouteId: string;
  status: "" | StudentStatus;
};

export type StudentSessionOption = {
  value: string;
  label: string;
};

export type StudentListItem = {
  id: string;
  workbookStudentKey: string;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string | null;
  status: StudentStatus;
  studentStatusLabel: "New" | "Old";
  classLabel: string;
  transportRouteLabel: string;
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  grossBaseBeforeDiscount: number;
  discountAmount: number;
  baseTotalDue: number;
  installment1Base: number;
  installment2Base: number;
  installment3Base: number;
  installment4Base: number;
  totalPaid: number;
  lateFeeTotal: number;
  totalDue: number;
  hasFeeProfile: boolean;
  feeProfileStatusLabel: string;
  fatherPhone: string | null;
  motherPhone: string | null;
  nextDueLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  statusLabel: "" | "PAID" | "NOT STARTED" | "OVERDUE" | "PARTLY PAID";
  duesStatus: "generated" | "missing_dues" | "needs_repair" | "session_mismatch" | "class_fee_missing";
  duesStatusLabel: string;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  duplicateSrFlag: boolean;
  missingDobFlag: boolean;
  missingClassFlag: boolean;
  missingStatusFlag: boolean;
  outstandingAmount: number;
  updatedAt: string;
};

export type StudentDetail = {
  id: string;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  classId: string;
  classLabel: string;
  classSessionLabel: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
  status: StudentStatus;
  studentTypeOverride: "new" | "existing" | null;
  studentStatusLabel: "New" | "Old";
  tuitionOverride: number | null;
  transportOverride: number | null;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  overrideReason: string | null;
  overrideNotes: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentDeletionSafety = {
  studentId: string;
  hasFinancialHistory: boolean;
  hardDeleteAllowed: boolean;
  generatedDuesDeleteAllowed: boolean;
  canForceDeleteTestRecord: boolean;
  installmentCount: number;
  receiptCount: number;
  paymentCount: number;
  adjustmentCount: number;
  auditLogCount: number;
  sessionLabel: string;
  admissionNo: string;
  fullName: string;
};

export type StudentFormInput = {
  fullName: string;
  classId: string;
  admissionNo: string;
  dateOfBirth: string;
  fatherName: string;
  motherName: string;
  fatherPhone: string;
  motherPhone: string;
  address: string;
  transportRouteId: string;
  status: string;
  studentTypeOverride: string;
  tuitionOverride: string;
  transportOverride: string;
  discountAmount: string;
  lateFeeWaiverAmount: string;
  otherAdjustmentHead: string;
  otherAdjustmentAmount: string;
  feeProfileReason: string;
  feeProfileNotes: string;
  notes: string;
};

export type StudentValidatedInput = {
  fullName: string;
  classId: string;
  admissionNo: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  transportRouteId: string | null;
  status: StudentStatus;
  studentTypeOverride: "new" | "existing" | null;
  tuitionOverride: number | null;
  transportOverride: number | null;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  feeProfileReason: string;
  feeProfileNotes: string | null;
  notes: string | null;
};

export type StudentFormFieldErrors = Partial<Record<keyof StudentFormInput, string>>;

export type StudentFormActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: StudentFormFieldErrors;
  studentId: string | null;
};

export const INITIAL_STUDENT_FORM_ACTION_STATE: StudentFormActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  studentId: null,
};

export const EMPTY_STUDENT_FILTERS: StudentListFilters = {
  query: "",
  sessionLabel: "",
  classId: "",
  transportRouteId: "",
  status: "",
};
