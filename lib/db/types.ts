import type { StaffRole } from "@/lib/auth/roles";

export type StudentStatus = "active" | "inactive" | "left" | "graduated";
export type RecordSource = "manual" | "import";
export type LedgerStatus = "pending" | "partial" | "paid" | "waived";
export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";
export type ImportBatchStatus = "draft" | "validated" | "posted" | "failed";
export type AuditAction = "insert" | "update" | "delete";

export type StudentRecord = {
  id: string;
  admissionNo: string;
  fullName: string;
  guardianName: string | null;
  mobileNo: string | null;
  className: string;
  section: string | null;
  sessionLabel: string;
  status: StudentStatus;
  source: RecordSource;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type FeeStructureRecord = {
  id: string;
  sessionLabel: string;
  className: string;
  streamName: string | null;
  annualFee: number;
  installmentCount: number;
  lateFeeFlat: number;
  installmentDueDates: string[];
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type FeeLedgerEntry = {
  id: string;
  studentId: string;
  feeStructureId: string | null;
  sessionLabel: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  scheduledAmount: number;
  lateFeeFlat: number;
  concessionAmount: number;
  receivedAmount: number;
  status: LedgerStatus;
  lastCollectionOn: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type CollectionRecord = {
  id: string;
  ledgerId: string;
  studentId: string;
  receiptNo: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  amountReceived: number;
  lateFeeCollected: number;
  referenceNo: string | null;
  remarks: string | null;
  source: RecordSource;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ImportBatchRecord = {
  id: string;
  batchLabel: string;
  sourceFilename: string | null;
  status: ImportBatchStatus;
  rowsReceived: number;
  rowsImported: number;
  rowsRejected: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type StaffProfileRecord = {
  id: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogRecord = {
  id: string;
  entityTable: string;
  entityId: string;
  action: AuditAction;
  payload: Record<string, unknown>;
  performedBy: string | null;
  createdAt: string;
};
