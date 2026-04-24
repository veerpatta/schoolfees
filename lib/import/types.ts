import type { StudentStatus } from "@/lib/db/types";

export const supportedImportFormats = ["csv", "xlsx"] as const;
export type SupportedImportFormat = (typeof supportedImportFormats)[number];

export const importModes = ["add", "update"] as const;
export type ImportMode = (typeof importModes)[number];

export const importBatchStatuses = [
  "uploaded",
  "validated",
  "importing",
  "completed",
  "failed",
] as const;
export type ImportBatchStatus = (typeof importBatchStatuses)[number];

export const importRowStatuses = [
  "pending",
  "valid",
  "invalid",
  "duplicate",
  "imported",
  "skipped",
] as const;
export type ImportRowStatus = (typeof importRowStatuses)[number];

export const importRowReviewStatuses = [
  "pending",
  "approved",
  "hold",
  "skipped",
] as const;
export type ImportRowReviewStatus = (typeof importRowReviewStatuses)[number];

export const importRowOperations = ["create", "update"] as const;
export type ImportRowOperation = (typeof importRowOperations)[number];

export const importAnomalyCategories = [
  "missing-admission-no",
  "invalid-dob",
  "duplicate-admission-no",
  "duplicate-name-class-dob",
  "unmapped-class",
  "unmapped-route",
  "missing-parent-fields",
  "placeholder-values",
] as const;
export type ImportAnomalyCategory = (typeof importAnomalyCategories)[number];

export const importFieldKeys = [
  "studentId",
  "fullName",
  "classLabel",
  "admissionNo",
  "dateOfBirth",
  "fatherName",
  "motherName",
  "fatherPhone",
  "motherPhone",
  "address",
  "transportRouteLabel",
  "status",
  "notes",
  "feeProfileReason",
  "customTuitionFeeAmount",
  "customTransportFeeAmount",
  "customBooksFeeAmount",
  "customAdmissionActivityMiscFeeAmount",
  "customLateFeeFlatAmount",
  "discountAmount",
  "studentTypeOverride",
  "transportAppliesOverride",
  "otherAdjustmentHead",
  "otherAdjustmentAmount",
  "lateFeeWaiverAmount",
  "customOtherFeeHead",
  "customOtherFeeAmount",
] as const;

export type ImportFieldKey = (typeof importFieldKeys)[number];

export type ImportCellValue = string | number | boolean | null;
export type RawImportRowPayload = Record<string, ImportCellValue>;
export type StudentImportColumnMapping = Partial<Record<ImportFieldKey, string>>;

export type ImportIssue = {
  code: string;
  field: ImportFieldKey | "batch" | "row";
  message: string;
};

export type NormalizedStudentImportOverride = {
  customTuitionFeeAmount: number | null;
  customTransportFeeAmount: number | null;
  customBooksFeeAmount: number | null;
  customAdmissionActivityMiscFeeAmount: number | null;
  customOtherFeeHeads: Record<string, number>;
  customLateFeeFlatAmount: number | null;
  discountAmount: number;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  lateFeeWaiverAmount: number;
  hasAnyOverride: boolean;
};

export type NormalizedStudentImportRow = {
  studentId: string | null;
  fullName: string;
  classId: string;
  classLabel: string;
  admissionNo: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  transportRouteId: string | null;
  transportRouteLabel: string | null;
  status: StudentStatus;
  notes: string | null;
  feeProfileReason: string | null;
  overrides: NormalizedStudentImportOverride;
};

export type ImportStoredRowInput = {
  id: string;
  rowIndex: number;
  rawPayload: RawImportRowPayload;
};

export type DryRunProcessedRow = {
  rowId: string;
  rowIndex: number;
  rawPayload: RawImportRowPayload;
  normalizedPayload: NormalizedStudentImportRow | null;
  operation: ImportRowOperation;
  status: Extract<ImportRowStatus, "valid" | "invalid" | "duplicate">;
  errors: ImportIssue[];
  warnings: string[];
  duplicateStudentId: string | null;
  targetStudentId: string | null;
  changedFields: string[];
};

export type ImportBatchSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  createRows?: number;
  updateRows?: number;
};

export type ImportBatchListItem = ImportBatchSummary & {
  id: string;
  importMode: ImportMode;
  filename: string;
  sourceFormat: SupportedImportFormat;
  worksheetName: string | null;
  status: ImportBatchStatus;
  createdAt: string;
  updatedAt: string;
  validationCompletedAt: string | null;
  importCompletedAt: string | null;
};

export type ImportRowDetail = {
  id: string;
  rowIndex: number;
  rawPayload: RawImportRowPayload;
  normalizedPayload: NormalizedStudentImportRow | null;
  status: ImportRowStatus;
  reviewStatus: ImportRowReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  anomalyCategories: ImportAnomalyCategory[];
  errors: ImportIssue[];
  warnings: string[];
  duplicateStudentId: string | null;
  targetStudentId: string | null;
  operation: ImportRowOperation;
  changedFields: string[];
  importedStudentId: string | null;
  importedOverrideId: string | null;
};

export type ImportReviewSummary = {
  approvedRows: number;
  pendingRows: number;
  heldRows: number;
  skippedRows: number;
  unresolvedAnomalyRows: number;
};

export type ImportBatchDetail = ImportBatchListItem & {
  detectedHeaders: string[];
  columnMapping: StudentImportColumnMapping;
  errorMessage: string | null;
  reviewSummary: ImportReviewSummary;
  rows: ImportRowDetail[];
};

export type ImportFieldDefinition = {
  key: ImportFieldKey;
  label: string;
  description: string;
  required: boolean;
  aliases: readonly string[];
};

export type ImportPageData = {
  mode: ImportMode;
  selectedBatch: ImportBatchDetail | null;
  recentBatches: ImportBatchListItem[];
  fieldDefinitions: readonly ImportFieldDefinition[];
  supportedFormats: readonly SupportedImportFormat[];
};

export type StudentImportActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  batchId: string | null;
};

export const INITIAL_STUDENT_IMPORT_ACTION_STATE: StudentImportActionState = {
  status: "idle",
  message: null,
  batchId: null,
};
