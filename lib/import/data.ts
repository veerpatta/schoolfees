import "server-only";

import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import { getFeePolicySummary } from "@/lib/fees/data";
import {
  hasPreparedDues,
  summarizeDuesPreparationIssues,
  syncAfterBulkStudentImport,
} from "@/lib/system-sync/finance-sync";
import { createStudent, getStudentDetail, updateStudent } from "@/lib/students/data";
import { shouldSyncStudentDuesForChange } from "@/lib/students/dues-sync";
import { buildAutoColumnMapping, validateColumnMapping } from "@/lib/import/mapping";
import { parseStudentImportFile } from "@/lib/import/parser";
import { executeStudentImportDryRun } from "@/lib/import/dryRun";
import { deriveAnomalyCategoriesForRow } from "@/lib/import/review";
import { normalizeLookupToken, stringifyImportCell } from "@/lib/import/validation";
import {
  studentImportFieldDefinitions,
} from "@/lib/import/mapping";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportBatchDialogSummary,
  ImportBatchListItem,
  ImportBatchSummary,
  ImportFieldKey,
  ImportIssue,
  ImportWarningSummaryItem,
  ImportPageData,
  ImportRowDetail,
  ImportRowOperation,
  ImportRowReviewStatus,
  NormalizedStudentImportOverride,
  NormalizedStudentImportRow,
  RawImportRowPayload,
  ImportReviewSummary,
  StudentImportColumnMapping,
} from "@/lib/import/types";
import type { StudentValidatedInput } from "@/lib/students/types";

type ImportBatchRow = {
  id: string;
  import_mode?: ImportBatchListItem["importMode"];
  target_session_label?: string | null;
  filename: string;
  source_format: ImportBatchListItem["sourceFormat"];
  worksheet_name: string | null;
  status: ImportBatchListItem["status"];
  detected_headers: unknown;
  column_mapping: unknown;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  imported_rows: number;
  skipped_rows: number;
  failed_rows: number;
  validation_completed_at: string | null;
  import_completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ImportRowRecord = {
  id: string;
  batch_id: string;
  row_index: number;
  raw_payload: unknown;
  normalized_payload: unknown;
  status: ImportRowDetail["status"];
  review_status: ImportRowReviewStatus;
  review_note: string | null;
  reviewed_at: string | null;
  anomaly_categories: unknown;
  errors: unknown;
  warnings: unknown;
  duplicate_student_id: string | null;
  target_student_id: string | null;
  import_operation: ImportRowOperation | null;
  changed_fields: unknown;
  imported_student_id: string | null;
  imported_override_id: string | null;
};

type ExistingStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  date_of_birth: string | null;
  class_ref: { session_label: string } | Array<{ session_label: string }> | null;
};

type FeeSettingRow = {
  class_id: string;
};

const BATCH_PAGE_SIZE = 8;
const IMPORT_ROW_WRITE_CHUNK_SIZE = 200;
const PROBLEM_ROW_PAGE_SIZE = 120;
const READY_ROW_PREVIEW_SIZE = 10;

function chunkArray<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

type ImportRowInsertInput = {
  rowIndex: number;
  rawPayload: RawImportRowPayload;
};

type ImportRowValidationUpdate = {
  id: string;
  normalizedPayload: NormalizedStudentImportRow | null;
  status: ImportRowDetail["status"];
  reviewStatus?: ImportRowReviewStatus;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  anomalyCategories?: ImportAnomalyCategory[];
  errors: ImportIssue[];
  warnings: string[];
  duplicateStudentId: string | null;
  targetStudentId?: string | null;
  importOperation?: ImportRowOperation;
  changedFields?: string[];
  importedStudentId?: string | null;
  importedOverrideId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImportCellValue(value: unknown): value is RawImportRowPayload[string] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toRawPayload(value: unknown): RawImportRowPayload {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      isImportCellValue(entryValue) ? entryValue : null,
    ]),
  );
}

function toImportIssues(value: unknown): ImportIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const code = typeof entry.code === "string" ? entry.code : "ERR_IMPORT";
    const field = typeof entry.field === "string" ? entry.field : "row";
    const message =
      typeof entry.message === "string" ? entry.message : "Import validation issue.";

    return [
      {
        code,
        field: field as ImportIssue["field"],
        message,
      },
    ];
  });
}

function toWarnings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function toReviewStatus(value: unknown): ImportRowReviewStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "hold" ||
    value === "skipped"
  ) {
    return value;
  }

  return "pending";
}

function toAnomalyCategories(value: unknown): ImportAnomalyCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is ImportAnomalyCategory =>
      entry === "missing-admission-no" ||
      entry === "invalid-dob" ||
      entry === "duplicate-admission-no" ||
      entry === "duplicate-name-class-dob" ||
      entry === "unmapped-class" ||
      entry === "unmapped-route" ||
      entry === "missing-parent-fields" ||
      entry === "placeholder-values",
  );
}

function toImportOperation(value: unknown): ImportRowOperation {
  return value === "update" ? "update" : "create";
}

function toChangedFields(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function toColumnMapping(value: unknown): StudentImportColumnMapping {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, mappingValue]) => {
      if (typeof mappingValue !== "string" || !mappingValue.trim()) {
        return [];
      }

      return [[key, mappingValue]];
    }),
  ) as StudentImportColumnMapping;
}

function toHeaders(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function toNormalizedOverrides(value: unknown): NormalizedStudentImportOverride {
  const record = isRecord(value) ? value : {};
  const customOtherFeeHeads = isRecord(record.customOtherFeeHeads)
    ? Object.fromEntries(
        Object.entries(record.customOtherFeeHeads).flatMap(([key, amount]) => {
          if (typeof amount !== "number" || !Number.isFinite(amount)) {
            return [];
          }

          return [[key, amount]];
        }),
      )
    : {};

  return {
    customTuitionFeeAmount:
      typeof record.customTuitionFeeAmount === "number"
        ? record.customTuitionFeeAmount
        : null,
    customTransportFeeAmount:
      typeof record.customTransportFeeAmount === "number"
        ? record.customTransportFeeAmount
        : null,
    customBooksFeeAmount:
      typeof record.customBooksFeeAmount === "number"
        ? record.customBooksFeeAmount
        : null,
    customAdmissionActivityMiscFeeAmount:
      typeof record.customAdmissionActivityMiscFeeAmount === "number"
        ? record.customAdmissionActivityMiscFeeAmount
        : null,
    customOtherFeeHeads,
    customLateFeeFlatAmount:
      typeof record.customLateFeeFlatAmount === "number"
        ? record.customLateFeeFlatAmount
        : null,
    discountAmount: typeof record.discountAmount === "number" ? record.discountAmount : 0,
    studentTypeOverride:
      record.studentTypeOverride === "new" || record.studentTypeOverride === "existing"
        ? record.studentTypeOverride
        : null,
    transportAppliesOverride:
      typeof record.transportAppliesOverride === "boolean"
        ? record.transportAppliesOverride
        : null,
    otherAdjustmentHead:
      typeof record.otherAdjustmentHead === "string" && record.otherAdjustmentHead.trim()
        ? record.otherAdjustmentHead.trim()
        : null,
    otherAdjustmentAmount:
      typeof record.otherAdjustmentAmount === "number"
        ? record.otherAdjustmentAmount
        : null,
    lateFeeWaiverAmount:
      typeof record.lateFeeWaiverAmount === "number"
        ? record.lateFeeWaiverAmount
        : 0,
    hasAnyOverride: Boolean(record.hasAnyOverride),
  };
}

function toNormalizedPayload(value: unknown): NormalizedStudentImportRow | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    "studentId" in value &&
    typeof value.studentId !== "string" &&
    value.studentId !== null
  ) {
    return null;
  }

  if (
    typeof value.fullName !== "string" ||
    typeof value.classId !== "string" ||
    typeof value.classLabel !== "string" ||
    typeof value.admissionNo !== "string"
  ) {
    return null;
  }

  return {
    studentId: typeof value.studentId === "string" ? value.studentId : null,
    fullName: value.fullName,
    classId: value.classId,
    classLabel: value.classLabel,
    admissionNo: value.admissionNo,
    dateOfBirth: typeof value.dateOfBirth === "string" ? value.dateOfBirth : null,
    fatherName: typeof value.fatherName === "string" ? value.fatherName : null,
    motherName: typeof value.motherName === "string" ? value.motherName : null,
    fatherPhone: typeof value.fatherPhone === "string" ? value.fatherPhone : null,
    motherPhone: typeof value.motherPhone === "string" ? value.motherPhone : null,
    address: typeof value.address === "string" ? value.address : null,
    transportRouteId:
      typeof value.transportRouteId === "string" ? value.transportRouteId : null,
    transportRouteLabel:
      typeof value.transportRouteLabel === "string" ? value.transportRouteLabel : null,
    status:
      value.status === "active" ||
      value.status === "inactive" ||
      value.status === "left" ||
      value.status === "graduated"
        ? value.status
        : "active",
    notes: typeof value.notes === "string" ? value.notes : null,
    feeProfileReason:
      typeof value.feeProfileReason === "string" ? value.feeProfileReason : null,
    overrides: toNormalizedOverrides(value.overrides),
  };
}

function summarizeImportRows(
  rows: readonly Pick<ImportRowDetail, "status" | "operation">[],
  failedRows = 0,
): ImportBatchSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
    importedRows: rows.filter((row) => row.status === "imported").length,
    skippedRows: rows.filter((row) => row.status === "skipped").length,
    failedRows,
    createRows: rows.filter((row) => row.operation === "create").length,
    updateRows: rows.filter((row) => row.operation === "update").length,
  };
}

function toImportBatchListItem(row: ImportBatchRow): ImportBatchListItem {
  return {
    id: row.id,
    importMode: row.import_mode === "update" ? "update" : "add",
    targetSessionLabel:
      typeof row.target_session_label === "string" && row.target_session_label.trim()
        ? row.target_session_label
        : null,
    filename: row.filename,
    sourceFormat: row.source_format,
    worksheetName: row.worksheet_name,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    invalidRows: row.invalid_rows,
    duplicateRows: row.duplicate_rows,
    importedRows: row.imported_rows,
    skippedRows: row.skipped_rows,
    failedRows: row.failed_rows,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    validationCompletedAt: row.validation_completed_at,
    importCompletedAt: row.import_completed_at,
  };
}

function toImportRowDetail(row: ImportRowRecord): ImportRowDetail {
  return {
    id: row.id,
    rowIndex: row.row_index,
    rawPayload: toRawPayload(row.raw_payload),
    normalizedPayload: toNormalizedPayload(row.normalized_payload),
    status: row.status,
    reviewStatus: toReviewStatus(row.review_status),
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    anomalyCategories: toAnomalyCategories(row.anomaly_categories),
    errors: toImportIssues(row.errors),
    warnings: toWarnings(row.warnings),
    duplicateStudentId: row.duplicate_student_id,
    targetStudentId: row.target_student_id,
    operation: toImportOperation(row.import_operation),
    changedFields: toChangedFields(row.changed_fields),
    importedStudentId: row.imported_student_id,
    importedOverrideId: row.imported_override_id,
  };
}

function toImportBatchDetail(
  batchRow: ImportBatchRow,
  rowRecords: ImportRowRecord[],
  reviewSummary: ImportReviewSummary,
): ImportBatchDetail {
  const rows = rowRecords.map(toImportRowDetail);

  return {
    ...toImportBatchListItem(batchRow),
    detectedHeaders: toHeaders(batchRow.detected_headers),
    columnMapping: toColumnMapping(batchRow.column_mapping),
    errorMessage: batchRow.error_message,
    reviewSummary,
    rows,
  };
}

type CountQuery = {
  eq: (column: string, value: unknown) => CountQuery;
  neq: (column: string, value: unknown) => CountQuery;
  in: (column: string, values: readonly string[]) => CountQuery;
};

type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};

async function countImportRows(
  batchId: string,
  apply: (query: CountQuery) => unknown,
) {
  const supabase = await createClient();
  const baseQuery = supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  const { count, error } = await (apply(baseQuery as unknown as CountQuery) as Promise<CountQueryResult>);

  if (error) {
    throw new Error(`Unable to summarize import rows: ${error.message}`);
  }

  return count ?? 0;
}

async function getImportReviewSummary(batchId: string) {
  const [
    approvedRows,
    pendingRows,
    heldRows,
    skippedRows,
    readyToImportRows,
    readyCreateRows,
    readyUpdateRows,
    invalidRows,
    duplicateRows,
    validPendingRows,
    validPendingWithBlockingCategoryRows,
    warningRows,
  ] = await Promise.all([
    countImportRows(batchId, (query) => query.eq("review_status", "approved")),
    countImportRows(batchId, (query) => query.eq("review_status", "pending")),
    countImportRows(batchId, (query) => query.eq("review_status", "hold")),
    countImportRows(batchId, (query) => query.eq("review_status", "skipped")),
    countImportRows(batchId, (query) =>
      query.eq("status", "valid").eq("review_status", "approved"),
    ),
    countImportRows(batchId, (query) =>
      query
        .eq("status", "valid")
        .eq("review_status", "approved")
        .eq("import_operation", "create"),
    ),
    countImportRows(batchId, (query) =>
      query
        .eq("status", "valid")
        .eq("review_status", "approved")
        .eq("import_operation", "update"),
    ),
    countImportRows(batchId, (query) => query.eq("status", "invalid")),
    countImportRows(batchId, (query) => query.eq("status", "duplicate")),
    countImportRows(batchId, (query) =>
      query.eq("status", "valid").eq("review_status", "pending"),
    ),
    countImportRows(batchId, (query) =>
      query
        .eq("status", "valid")
        .eq("review_status", "pending")
        .neq("anomaly_categories", "[]"),
    ),
    countImportRows(batchId, (query) => query.eq("status", "valid").neq("warnings", "[]")),
  ]);

  const correctionRows =
    invalidRows +
    duplicateRows +
    heldRows +
    validPendingWithBlockingCategoryRows;
  const pendingSafeRows = Math.max(0, validPendingRows - validPendingWithBlockingCategoryRows);

  return {
    approvedRows,
    pendingRows,
    heldRows,
    skippedRows,
    unresolvedAnomalyRows: correctionRows,
    readyToImportRows,
    readyCreateRows,
    readyUpdateRows,
    correctionRows,
    warningRows,
    pendingSafeRows,
  };
}

async function getImportBatchById(batchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, import_mode, target_session_label, filename, source_format, worksheet_name, status, detected_headers, column_mapping, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, skipped_rows, failed_rows, validation_completed_at, import_completed_at, error_message, created_at, updated_at",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load import batch: ${error.message}`);
  }

  return (data as ImportBatchRow | null) ?? null;
}

async function getImportRowsByBatchId(
  batchId: string,
  options?: {
    problemOnly?: boolean;
    limit?: number;
  },
) {
  const supabase = await createClient();
  const rows: ImportRowRecord[] = [];

  if (options?.problemOnly) {
    const [problemRowsResult, heldRowsResult, pendingBlockingResult] = await Promise.all([
      supabase
        .from("import_rows")
        .select(
          "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, target_student_id, import_operation, changed_fields, imported_student_id, imported_override_id",
        )
        .eq("batch_id", batchId)
        .in("status", ["invalid", "duplicate"])
        .order("row_index", { ascending: true })
        .limit(options.limit ?? PROBLEM_ROW_PAGE_SIZE),
      supabase
        .from("import_rows")
        .select(
          "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, target_student_id, import_operation, changed_fields, imported_student_id, imported_override_id",
        )
        .eq("batch_id", batchId)
        .eq("status", "valid")
        .eq("review_status", "hold")
        .order("row_index", { ascending: true })
        .limit(options.limit ?? PROBLEM_ROW_PAGE_SIZE),
      supabase
        .from("import_rows")
        .select(
          "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, target_student_id, import_operation, changed_fields, imported_student_id, imported_override_id",
        )
        .eq("batch_id", batchId)
        .eq("status", "valid")
        .eq("review_status", "pending")
        .neq("anomaly_categories", "[]")
        .order("row_index", { ascending: true })
        .limit(options.limit ?? PROBLEM_ROW_PAGE_SIZE),
    ]);

    if (problemRowsResult.error) {
      throw new Error(`Unable to load import rows: ${problemRowsResult.error.message}`);
    }

    if (heldRowsResult.error) {
      throw new Error(`Unable to load import rows: ${heldRowsResult.error.message}`);
    }

    if (pendingBlockingResult.error) {
      throw new Error(`Unable to load import rows: ${pendingBlockingResult.error.message}`);
    }

    const merged = [
      ...((problemRowsResult.data ?? []) as ImportRowRecord[]),
      ...((heldRowsResult.data ?? []) as ImportRowRecord[]),
      ...((pendingBlockingResult.data ?? []) as ImportRowRecord[]),
    ];
    const byId = new Map(merged.map((row) => [row.id, row]));
    rows.push(...[...byId.values()].sort((a, b) => a.row_index - b.row_index).slice(0, options.limit ?? PROBLEM_ROW_PAGE_SIZE));
    return rows;
  }

  let query = supabase
    .from("import_rows")
    .select(
      "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, target_student_id, import_operation, changed_fields, imported_student_id, imported_override_id",
    )
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load import rows: ${error.message}`);
  }

  return (data ?? []) as ImportRowRecord[];
}

async function updateImportBatch(
  batchId: string,
  values: Partial<{
    column_mapping: StudentImportColumnMapping;
    status: ImportBatchListItem["status"];
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    imported_rows: number;
    skipped_rows: number;
    failed_rows: number;
    summary: ImportBatchSummary;
    validation_completed_at: string | null;
    import_completed_at: string | null;
    error_message: string | null;
  }>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("import_batches").update(values).eq("id", batchId);

  if (error) {
    throw new Error(`Unable to update import batch: ${error.message}`);
  }
}

export async function insertRawImportRows(
  batchId: string,
  mode: ImportBatchListItem["importMode"],
  rows: ReadonlyArray<ImportRowInsertInput>,
) {
  const normalizedBatchId = batchId.trim();
  if (!normalizedBatchId) {
    throw new Error("Import batch ID is missing while saving rows.");
  }

  const supabase = await createClient();
  const importOperation: ImportRowOperation = mode === "update" ? "update" : "create";

  for (const chunk of chunkArray(rows, IMPORT_ROW_WRITE_CHUNK_SIZE)) {
    for (const row of chunk) {
      if (!Number.isInteger(row.rowIndex) || row.rowIndex <= 0) {
        throw new Error("Import row index is missing.");
      }

      if (!isRecord(row.rawPayload)) {
        throw new Error("Import raw row payload is missing.");
      }
    }

    const payload = chunk.map((row) => ({
      batch_id: normalizedBatchId,
      row_index: row.rowIndex,
      raw_payload: row.rawPayload,
      normalized_payload: null,
      status: "pending",
      review_status: "pending",
      review_note: null,
      reviewed_at: null,
      anomaly_categories: [],
      errors: [],
      warnings: [],
      duplicate_student_id: null,
      target_student_id: null,
      import_operation: importOperation,
      changed_fields: [],
      imported_student_id: null,
      imported_override_id: null,
    }));

    const { error } = await supabase.from("import_rows").insert(payload);

    if (error) {
      throw new Error(`Unable to create import rows: ${error.message}`);
    }
  }
}

export async function updateImportRowsForBatch(
  batchId: string,
  rows: ReadonlyArray<ImportRowValidationUpdate>,
) {
  const normalizedBatchId = batchId.trim();
  if (!normalizedBatchId) {
    throw new Error("Import batch ID is missing while saving rows.");
  }

  for (const row of rows) {
    if (!row.id) {
      throw new Error("Import row ID is missing.");
    }
  }

  const supabase = await createClient();

  for (const chunk of chunkArray(rows, IMPORT_ROW_WRITE_CHUNK_SIZE)) {
    await Promise.all(
      chunk.map(async (row) => {
        const { error } = await supabase
          .from("import_rows")
          .update({
            normalized_payload: row.normalizedPayload,
            status: row.status,
            review_status: row.reviewStatus ?? (row.status === "valid" ? "approved" : "pending"),
            review_note: row.reviewNote ?? null,
            reviewed_at: row.reviewedAt ?? null,
            anomaly_categories: row.anomalyCategories ?? [],
            errors: row.errors,
            warnings: row.warnings,
            duplicate_student_id: row.duplicateStudentId,
            target_student_id: row.targetStudentId ?? null,
            import_operation: row.importOperation ?? "create",
            changed_fields: row.changedFields ?? [],
            imported_student_id: row.importedStudentId ?? null,
            imported_override_id: row.importedOverrideId ?? null,
          })
          .eq("id", row.id)
          .eq("batch_id", normalizedBatchId);

        if (error) {
          throw new Error(`Unable to update import rows: ${error.message}`);
        }
      }),
    );
  }
}

export async function getStudentImportPageData(
  selectedBatchId?: string | null,
  mode: ImportBatchListItem["importMode"] = "add",
): Promise<ImportPageData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, import_mode, target_session_label, filename, source_format, worksheet_name, status, detected_headers, column_mapping, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, skipped_rows, failed_rows, validation_completed_at, import_completed_at, error_message, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(BATCH_PAGE_SIZE);

  if (error) {
    throw new Error(`Unable to load import batches: ${error.message}`);
  }

  const recentBatches = ((data ?? []) as ImportBatchRow[]).map(toImportBatchListItem);
  const resolvedBatchId = selectedBatchId?.trim() || recentBatches[0]?.id || null;

  if (!resolvedBatchId) {
    return {
      mode,
      recentBatches,
      selectedBatch: null,
      fieldDefinitions: studentImportFieldDefinitions,
      supportedFormats: ["csv", "xlsx"],
    };
  }

  const [batchRow, rowRecords, reviewSummary] = await Promise.all([
    getImportBatchById(resolvedBatchId),
    getImportRowsByBatchId(resolvedBatchId, { problemOnly: true, limit: PROBLEM_ROW_PAGE_SIZE }),
    getImportReviewSummary(resolvedBatchId),
  ]);

  return {
    mode: batchRow?.import_mode === "update" ? "update" : mode,
    recentBatches,
    selectedBatch: batchRow ? toImportBatchDetail(batchRow, rowRecords, reviewSummary) : null,
    fieldDefinitions: studentImportFieldDefinitions,
    supportedFormats: ["csv", "xlsx"],
  };
}

export function createEmptyImportPageData(
  mode: ImportBatchListItem["importMode"] = "add",
): ImportPageData {
  return {
    mode,
    selectedBatch: null,
    recentBatches: [],
    fieldDefinitions: studentImportFieldDefinitions,
    supportedFormats: ["csv", "xlsx"],
  };
}

function warningSummaryLabel(message: string) {
  const dividerIndex = message.indexOf(":");
  const cleaned = dividerIndex === -1 ? message : message.slice(dividerIndex + 1);
  return cleaned.trim() || "General warning";
}

export async function getStudentImportBatchSummary(batchId: string) {
  const [batchRow, reviewSummary, problemRowsRaw, readyRowsRaw, warningRowsRaw] = await Promise.all([
    getImportBatchById(batchId),
    getImportReviewSummary(batchId),
    getImportRowsByBatchId(batchId, { problemOnly: true, limit: PROBLEM_ROW_PAGE_SIZE }),
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("import_rows")
        .select(
          "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, target_student_id, import_operation, changed_fields, imported_student_id, imported_override_id",
        )
        .eq("batch_id", batchId)
        .eq("status", "valid")
        .eq("review_status", "approved")
        .order("row_index", { ascending: true })
        .limit(READY_ROW_PREVIEW_SIZE);

      if (error) {
        throw new Error(`Unable to load ready rows preview: ${error.message}`);
      }

      return (data ?? []) as ImportRowRecord[];
    })(),
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("import_rows")
        .select("id, warnings")
        .eq("batch_id", batchId)
        .eq("status", "valid")
        .neq("warnings", "[]")
        .limit(500);

      if (error) {
        throw new Error(`Unable to load warning summary: ${error.message}`);
      }

      return (data ?? []) as Array<{ id: string; warnings: unknown }>;
    })(),
  ]);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  const readyPreviewRows = readyRowsRaw.map(toImportRowDetail);
  const warningCounts = new Map<string, number>();
  for (const row of warningRowsRaw) {
    for (const warning of toWarnings(row.warnings)) {
      const label = warningSummaryLabel(warning);
      warningCounts.set(label, (warningCounts.get(label) ?? 0) + 1);
    }
  }
  const warningSummary: ImportWarningSummaryItem[] = [...warningCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return {
    batchId: batchRow.id,
    mode: batchRow.import_mode === "update" ? "update" : "add",
    targetSessionLabel: batchRow.target_session_label ?? null,
    status: batchRow.status,
    reviewSummary,
    problemRows: problemRowsRaw.map(toImportRowDetail),
    readyPreviewRows,
    warningSummary,
  } satisfies ImportBatchDialogSummary;
}

export async function createStudentImportBatch(
  file: File,
  mode: ImportBatchListItem["importMode"] = "add",
  targetSessionLabel?: string | null,
) {
  const parsedFile = await parseStudentImportFile(file);
  const masterOptions = await getMasterDataOptions();
  const activePolicy = await getFeePolicySummary();
  const supabase = await createClient();
  const normalizedTargetSessionLabel = targetSessionLabel?.trim() ?? "";
  const resolvedTargetSessionLabel =
    mode === "add"
      ? normalizedTargetSessionLabel || activePolicy.academicSessionLabel || masterOptions.currentSessionLabel || ""
      : normalizedTargetSessionLabel;

  if (mode === "add" && !resolvedTargetSessionLabel) {
    throw new Error("Select an academic year before bulk add upload.");
  }

  if (
    mode === "add" &&
    resolvedTargetSessionLabel &&
    activePolicy.academicSessionLabel &&
    resolvedTargetSessionLabel.toLowerCase() !== activePolicy.academicSessionLabel.toLowerCase()
  ) {
    throw new Error(
      `Bulk Add is limited to the active Fee Setup session ${activePolicy.academicSessionLabel}. Switch Fee Setup or choose that session before upload.`,
    );
  }

  if (resolvedTargetSessionLabel) {
    const hasClassesForSession = masterOptions.classOptions.some(
      (row) => row.sessionLabel === resolvedTargetSessionLabel,
    );

    if (!hasClassesForSession) {
      throw new Error(
        `No classes are saved for ${resolvedTargetSessionLabel}. Add the session classes first, then return to student import.`,
      );
    }
  }

  const initialSummary: ImportBatchSummary = {
    totalRows: parsedFile.rows.length,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    importedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    createRows: 0,
    updateRows: 0,
  };

  const autoMapping = buildAutoColumnMapping(parsedFile.headers);
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      filename: parsedFile.filename,
      import_mode: mode,
      target_session_label: resolvedTargetSessionLabel || null,
      source_format: parsedFile.sourceFormat,
      worksheet_name: parsedFile.worksheetName,
      file_size_bytes: parsedFile.fileSizeBytes,
      status: "uploaded",
      detected_headers: parsedFile.headers,
      column_mapping: autoMapping,
      total_rows: parsedFile.rows.length,
      valid_rows: 0,
      invalid_rows: 0,
      duplicate_rows: 0,
      imported_rows: 0,
      skipped_rows: 0,
      failed_rows: 0,
      summary: initialSummary,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to create import batch: ${error.message}`);
  }

  const batchId = data.id as string;
  await insertRawImportRows(batchId, mode, parsedFile.rows);

  const mappingErrors = validateColumnMapping(autoMapping, parsedFile.headers);
  if (mappingErrors.length === 0) {
    await runStudentImportDryRun(batchId, autoMapping);
  }

  return {
    batchId,
    targetSessionLabel: resolvedTargetSessionLabel || null,
    autoValidated: mappingErrors.length === 0,
  };
}

export async function runStudentImportDryRun(batchId: string, mapping: StudentImportColumnMapping) {
  const [batchRow, rowRecords] = await Promise.all([
    getImportBatchById(batchId),
    getImportRowsByBatchId(batchId),
  ]);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  if (batchRow.imported_rows > 0 || batchRow.status === "completed") {
    throw new Error("Imported batches are locked. Create a new batch if you need another import run.");
  }

  const headers = toHeaders(batchRow.detected_headers);
  const mappingErrors = validateColumnMapping(mapping, headers);

  if (mappingErrors.length > 0) {
    throw new Error(mappingErrors[0]);
  }

  const supabase = await createClient();
  const targetSessionLabel =
    typeof batchRow.target_session_label === "string" && batchRow.target_session_label.trim()
      ? batchRow.target_session_label.trim()
      : null;
  if (batchRow.import_mode === "add" && !targetSessionLabel) {
    throw new Error("Select an academic year before running bulk add validation.");
  }
  const [masterOptions, { data: existingStudents, error: studentError }, { data: feeSettings, error: feeSettingError }] =
    await Promise.all([
      getMasterDataOptions(),
      supabase.from("students").select(
        "id, admission_no, full_name, class_id, date_of_birth, class_ref:classes(session_label)",
      ),
      supabase.from("fee_settings").select("class_id").eq("is_active", true),
    ]);

  if (studentError) {
    throw new Error(`Unable to load students for duplicate detection: ${studentError.message}`);
  }

  if (feeSettingError) {
    throw new Error(`Unable to load fee settings for import validation: ${feeSettingError.message}`);
  }

  const classesForValidation = targetSessionLabel
    ? masterOptions.classOptions.filter((row) => row.sessionLabel === targetSessionLabel)
    : masterOptions.classOptions;

  if (targetSessionLabel && classesForValidation.length === 0) {
    throw new Error(
      `No classes are saved for ${targetSessionLabel}. Add the session classes first, then return to student import.`,
    );
  }

  const validationResult = executeStudentImportDryRun({
    mode: batchRow.import_mode === "update" ? "update" : "add",
    targetSessionLabel,
    rows: rowRecords.map((row) => ({
      id: row.id,
      rowIndex: row.row_index,
      rawPayload: toRawPayload(row.raw_payload),
    })),
    mapping,
    classes: classesForValidation.map((row) => ({
      id: row.id,
      label: row.label,
      aliases: [normalizeLookupToken(row.label)],
      sessionLabel: row.sessionLabel,
    })),
    routes: masterOptions.routeOptions
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        label: row.routeCode ? `${row.label} (${row.routeCode})` : row.label,
        aliases: [
          normalizeLookupToken(row.label),
          normalizeLookupToken(row.routeCode ?? ""),
          normalizeLookupToken(
            row.routeCode ? `${row.label} ${row.routeCode}` : row.label,
          ),
        ].filter(Boolean),
    })),
    existingStudents: ((existingStudents ?? []) as ExistingStudentRow[]).map((row) => ({
      id: row.id,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      classId: row.class_id,
      classSessionLabel: toSingleRecord(row.class_ref)?.session_label ?? "",
      dateOfBirth: row.date_of_birth,
    })),
    activeFeeSettingClassIds: new Set(
      ((feeSettings ?? []) as FeeSettingRow[]).map((row) => row.class_id),
    ),
  });

  await updateImportRowsForBatch(
    batchId,
    validationResult.rows.map((row) => {
      const anomalyCategories = deriveAnomalyCategoriesForRow({
        mode: batchRow.import_mode === "update" ? "update" : "add",
        status: row.status,
        errors: row.errors,
      });

      return {
        id: row.rowId,
        normalizedPayload: row.normalizedPayload,
        status: row.status,
        reviewStatus: row.status === "valid" ? "approved" : "pending",
        reviewNote: null,
        reviewedAt: null,
        anomalyCategories,
        errors: row.errors,
        warnings: row.warnings,
        duplicateStudentId: row.duplicateStudentId,
        targetStudentId: row.targetStudentId,
        importOperation: row.operation,
        changedFields: row.changedFields,
        importedStudentId: null,
        importedOverrideId: null,
      };
    }),
  );

  await updateImportBatch(batchId, {
    column_mapping: mapping,
    status: "validated",
    valid_rows: validationResult.summary.validRows,
    invalid_rows: validationResult.summary.invalidRows,
    duplicate_rows: validationResult.summary.duplicateRows,
    imported_rows: 0,
    skipped_rows: 0,
    failed_rows: 0,
    summary: validationResult.summary,
    validation_completed_at: new Date().toISOString(),
    import_completed_at: null,
    error_message: null,
  });
}

function hasMappedValue(
  row: ImportRowDetail,
  mapping: StudentImportColumnMapping,
  field: ImportFieldKey,
) {
  const header = mapping[field];

  if (!header) {
    return false;
  }

  const rawValue = row.rawPayload[header];

  return stringifyImportCell(rawValue).length > 0;
}

function buildImportStudentInput(
  row: ImportRowDetail,
  mapping: StudentImportColumnMapping,
  batchId: string,
  existingStudent?: Awaited<ReturnType<typeof getStudentDetail>>,
): StudentValidatedInput {
  if (!row.normalizedPayload) {
    throw new Error("Import row has no normalized student payload.");
  }

  const payload = row.normalizedPayload;
  const existing = existingStudent ?? null;
  const useExisting = row.operation === "update" && existing !== null;
  const override = payload.overrides;

  return {
    fullName: payload.fullName,
    classId: payload.classId,
    admissionNo: payload.admissionNo,
    dateOfBirth:
      useExisting && !hasMappedValue(row, mapping, "dateOfBirth")
        ? existing?.dateOfBirth ?? null
        : payload.dateOfBirth,
    fatherName:
      useExisting && !hasMappedValue(row, mapping, "fatherName")
        ? existing?.fatherName ?? null
        : payload.fatherName,
    motherName:
      useExisting && !hasMappedValue(row, mapping, "motherName")
        ? existing?.motherName ?? null
        : payload.motherName,
    fatherPhone:
      useExisting && !hasMappedValue(row, mapping, "fatherPhone")
        ? existing?.fatherPhone ?? null
        : payload.fatherPhone,
    motherPhone:
      useExisting && !hasMappedValue(row, mapping, "motherPhone")
        ? existing?.motherPhone ?? null
        : payload.motherPhone,
    address:
      useExisting && !hasMappedValue(row, mapping, "address")
        ? existing?.address ?? null
        : payload.address,
    transportRouteId:
      useExisting && !hasMappedValue(row, mapping, "transportRouteLabel")
        ? existing?.transportRouteId ?? null
        : payload.transportRouteId,
    status:
      useExisting && !hasMappedValue(row, mapping, "status")
        ? existing?.status ?? payload.status
        : payload.status,
    studentTypeOverride:
      useExisting && !hasMappedValue(row, mapping, "studentTypeOverride")
        ? existing?.studentTypeOverride ?? "existing"
        : override.studentTypeOverride ?? "existing",
    tuitionOverride:
      useExisting && !hasMappedValue(row, mapping, "customTuitionFeeAmount")
        ? existing?.tuitionOverride ?? null
        : override.customTuitionFeeAmount,
    transportOverride:
      useExisting && !hasMappedValue(row, mapping, "customTransportFeeAmount")
        ? existing?.transportOverride ?? null
        : override.customTransportFeeAmount,
    discountAmount:
      useExisting && !hasMappedValue(row, mapping, "discountAmount")
        ? existing?.discountAmount ?? 0
        : override.discountAmount,
    lateFeeWaiverAmount:
      useExisting && !hasMappedValue(row, mapping, "lateFeeWaiverAmount")
        ? existing?.lateFeeWaiverAmount ?? 0
        : override.lateFeeWaiverAmount,
    otherAdjustmentHead:
      useExisting && !hasMappedValue(row, mapping, "otherAdjustmentHead")
        ? existing?.otherAdjustmentHead ?? null
        : override.otherAdjustmentHead,
    otherAdjustmentAmount:
      useExisting && !hasMappedValue(row, mapping, "otherAdjustmentAmount")
        ? existing?.otherAdjustmentAmount ?? null
        : override.otherAdjustmentAmount,
    feeProfileReason:
      useExisting && !hasMappedValue(row, mapping, "feeProfileReason")
        ? existing?.overrideReason ?? `Imported from batch ${batchId} row ${row.rowIndex}`
        : payload.feeProfileReason ?? `Imported from batch ${batchId} row ${row.rowIndex}`,
    feeProfileNotes: row.reviewNote,
    notes:
      useExisting && !hasMappedValue(row, mapping, "notes")
        ? existing?.notes ?? null
        : payload.notes,
  };
}

async function getActiveImportedOverrideId(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_fee_overrides")
    .select("id")
    .eq("student_id", studentId)
    .eq("is_active", true)
    .maybeSingle();

  return data && typeof data.id === "string" ? data.id : null;
}

export async function updateStudentImportRowReview(
  batchId: string,
  rowId: string,
  reviewStatus: ImportRowReviewStatus,
  reviewNote: string | null,
) {
  const [batchRow, rowRecords] = await Promise.all([
    getImportBatchById(batchId),
    getImportRowsByBatchId(batchId),
  ]);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  if (batchRow.status === "completed") {
    throw new Error("Completed batches are locked for review changes.");
  }

  const row = rowRecords.find((item) => item.id === rowId);

  if (!row) {
    throw new Error("Import row not found for this batch.");
  }

  const rowDetail = toImportRowDetail(row);

  if (reviewStatus === "approved" && rowDetail.status !== "valid") {
    throw new Error("Only valid rows can be approved for import.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("import_rows")
    .update({
      review_status: reviewStatus,
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .eq("batch_id", batchId);

  if (error) {
    throw new Error(`Unable to update row review status: ${error.message}`);
  }
}

export async function bulkUpdateImportRowReview(
  batchId: string,
  categories: ImportAnomalyCategory[],
  reviewStatus: ImportRowReviewStatus,
  reviewNote: string | null,
) {
  const [batchRow, rowRecords] = await Promise.all([
    getImportBatchById(batchId),
    getImportRowsByBatchId(batchId),
  ]);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  if (batchRow.status === "completed") {
    throw new Error("Completed batches are locked for review changes.");
  }

  const rows = rowRecords.map(toImportRowDetail);
  const matchingRowIds = rows
    .filter((row) => {
      if (row.status === "imported" || row.reviewStatus === "skipped") {
        return false;
      }

      if (reviewStatus === "approved" && row.status !== "valid") {
        return false;
      }

      return categories.some((category) => row.anomalyCategories.includes(category));
    })
    .map((row) => row.id);

  if (matchingRowIds.length === 0) {
    return;
  }

  const supabase = await createClient();

  for (const chunk of chunkArray(matchingRowIds, IMPORT_ROW_WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("import_rows")
      .update({
        review_status: reviewStatus,
        review_note: reviewNote,
        reviewed_at: new Date().toISOString(),
      })
      .eq("batch_id", batchId)
      .in("id", chunk);

    if (error) {
      throw new Error(`Unable to bulk-update row review status: ${error.message}`);
    }
  }
}

export async function approveAllSafeImportRows(batchId: string) {
  const batchRow = await getImportBatchById(batchId);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  if (batchRow.status === "completed") {
    throw new Error("Completed batches are locked for review changes.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("import_rows")
    .update({
      review_status: "approved",
      review_note: "Bulk approved safe rows",
      reviewed_at: new Date().toISOString(),
    })
    .eq("batch_id", batchId)
    .eq("status", "valid")
    .eq("review_status", "pending");

  if (error) {
    throw new Error(`Unable to approve safe rows: ${error.message}`);
  }
}

async function updateImportRowAfterCommit(
  batchId: string,
  row: ImportRowDetail,
  status: ImportRowDetail["status"],
  errors: ImportIssue[],
  duplicateStudentId: string | null,
  importedStudentId: string | null,
  importedOverrideId: string | null,
  reviewStatus?: ImportRowReviewStatus,
) {
  if (!batchId.trim()) {
    throw new Error("Import batch ID is missing while saving rows.");
  }

  const supabase = await createClient();
  const scopedUpdate = await supabase
    .from("import_rows")
    .update({
      status,
      review_status: reviewStatus,
      errors,
      anomaly_categories: deriveAnomalyCategoriesForRow({
        mode: row.operation === "update" ? "update" : "add",
        status,
        errors,
      }),
      duplicate_student_id: duplicateStudentId,
      target_student_id: row.targetStudentId,
      import_operation: row.operation,
      changed_fields: row.changedFields,
      imported_student_id: importedStudentId,
      imported_override_id: importedOverrideId,
    })
    .eq("id", row.id)
    .eq("batch_id", batchId);

  if (scopedUpdate.error) {
    throw new Error(`Unable to update import row ${row.rowIndex}: ${scopedUpdate.error.message}`);
  }
}

export async function commitStudentImportBatch(batchId: string) {
  const [batchRow, rowRecords] = await Promise.all([
    getImportBatchById(batchId),
    getImportRowsByBatchId(batchId),
  ]);

  if (!batchRow) {
    throw new Error("Import batch not found.");
  }

  if (batchRow.status === "uploaded" || !batchRow.validation_completed_at) {
    throw new Error("Run dry-run validation before importing students.");
  }

  if (batchRow.status === "completed") {
    throw new Error("This batch is already completed.");
  }

  const rows = rowRecords.map(toImportRowDetail);
  const approvedRows = rows.filter(
    (row) =>
      row.status === "valid" &&
      row.normalizedPayload !== null &&
      row.reviewStatus === "approved",
  );

  if (approvedRows.length === 0) {
    throw new Error(
      "There are no approved valid rows available to import. Approve clean rows from the QA queues first.",
    );
  }

  await updateImportBatch(batchId, {
    status: "importing",
    error_message: null,
  });

  const updatedRows: ImportRowDetail[] = [];
  const studentsToRegenerate = new Set<string>();
  const affectedStudentIds = new Set<string>();
  let failedRows = 0;
  const mapping = toColumnMapping(batchRow.column_mapping);
  let createdCount = 0;
  let updatedCount = 0;
  let temporarySrGeneratedCount = 0;
  let ledgerSyncError: string | null = null;
  let duesReadyCount = 0;
  let duesAttentionCount = 0;
  let duesReasonSummary: string | null = null;
  const activePolicy = await getFeePolicySummary();

  for (const row of rows) {
    if (row.status !== "valid" || !row.normalizedPayload || row.reviewStatus !== "approved") {
      updatedRows.push(row);
      continue;
    }

    try {
      const previousStudent =
        row.operation === "update" && row.targetStudentId
          ? await getStudentDetail(row.targetStudentId)
          : null;
      const input = buildImportStudentInput(row, mapping, batchId, previousStudent);
      const importedStudentId =
        row.operation === "update" && row.targetStudentId
          ? await updateStudent(row.targetStudentId, input)
          : await createStudent(input);
      if (row.operation === "update") {
        updatedCount += 1;
      } else {
        createdCount += 1;
        if (!row.normalizedPayload.admissionNo) {
          temporarySrGeneratedCount += 1;
        }
      }
      const importedOverrideId = await getActiveImportedOverrideId(importedStudentId);
      affectedStudentIds.add(importedStudentId);

      if (shouldSyncStudentDuesForChange(previousStudent, input)) {
        studentsToRegenerate.add(importedStudentId);
      }

      await updateImportRowAfterCommit(
        batchId,
        row,
        "imported",
        row.errors,
        null,
        importedStudentId,
        importedOverrideId,
        "approved",
      );

      updatedRows.push({
        ...row,
        status: "imported",
        duplicateStudentId: null,
        targetStudentId: row.operation === "update" ? importedStudentId : row.targetStudentId,
        importedStudentId,
        importedOverrideId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error while importing this row.";

      failedRows += 1;

      const failureErrors = [
        ...row.errors,
        {
          code: "ERR_IMPORT_SAVE_FAILED",
          field: "row" as const,
          message: `Import save failed: ${message}`,
        },
      ];

      await updateImportRowAfterCommit(
        batchId,
        row,
        "invalid",
        failureErrors,
        null,
        null,
        null,
        "pending",
      );

      updatedRows.push({
        ...row,
        status: "invalid",
        errors: failureErrors,
        duplicateStudentId: null,
        importedStudentId: null,
        importedOverrideId: null,
      });
    }
  }

  const summary = summarizeImportRows(updatedRows, failedRows);

  const targetSessionLabel = batchRow.target_session_label?.trim() || null;
  const activePolicySessionLabel = activePolicy.academicSessionLabel.trim();

  if (targetSessionLabel && activePolicySessionLabel) {
    const normalizedTargetSessionLabel = targetSessionLabel.toLowerCase();
    const normalizedActiveSessionLabel = activePolicySessionLabel.toLowerCase();

    if (normalizedTargetSessionLabel !== normalizedActiveSessionLabel) {
      ledgerSyncError = `Selected academic session ${targetSessionLabel} is not the active fee policy session ${activePolicySessionLabel}. Open Fee Setup and make the same session active before dues and payments will reflect.`;
    }
  }

  if (!ledgerSyncError && studentsToRegenerate.size > 0) {
    try {
      const ledgerResult = await syncAfterBulkStudentImport([...studentsToRegenerate]);
      const preparedStudentIds = new Set<string>();

      if (hasPreparedDues(ledgerResult)) {
        studentsToRegenerate.forEach((studentId) => preparedStudentIds.add(studentId));
      }

      const skippedStudents = ledgerResult.skippedStudents ?? [];

      skippedStudents.forEach((student) => {
        preparedStudentIds.delete(student.studentId);
      });

      duesReadyCount = preparedStudentIds.size;
      duesAttentionCount = Math.max(studentsToRegenerate.size - duesReadyCount, 0);
      duesReasonSummary = summarizeDuesPreparationIssues(skippedStudents) || null;

      if (
        (createdCount > 0 || updatedCount > 0) &&
        duesReadyCount === 0
      ) {
        ledgerSyncError =
          duesReasonSummary ??
          (targetSessionLabel && targetSessionLabel !== activePolicySessionLabel
            ? `Selected academic session ${targetSessionLabel} is not the active fee policy session ${activePolicySessionLabel}. Open Fee Setup and make the same session active before dues and payments will reflect.`
            : "Dues were not prepared for the imported students. Check that the selected academic year is active and class fees are saved in Fee Setup.");
      }
    } catch (error) {
      ledgerSyncError =
        error instanceof Error ? error.message : "Dues could not be prepared after import.";
    }
  }

  await updateImportBatch(batchId, {
    status: failedRows > 0 || ledgerSyncError ? "failed" : "completed",
    valid_rows: summary.validRows,
    invalid_rows: summary.invalidRows,
    duplicate_rows: summary.duplicateRows,
    imported_rows: summary.importedRows,
    skipped_rows: summary.skippedRows,
    failed_rows: summary.failedRows,
    summary,
    import_completed_at: new Date().toISOString(),
    error_message: ledgerSyncError
      ? `Students were imported, but dues could not be prepared: ${ledgerSyncError}`
      : failedRows > 0
        ? `${failedRows} row${failedRows === 1 ? "" : "s"} could not be saved during import.`
        : null,
  });

  return {
    batchId,
    createdCount,
    updatedCount,
    importedCount: summary.importedRows,
    failedCount: failedRows,
    skippedCount: summary.skippedRows,
    temporarySrGeneratedCount,
    ledgerSyncError,
    duesReadyCount,
    duesAttentionCount,
    duesReasonSummary,
    affectedStudentIds: [...affectedStudentIds],
    status: failedRows > 0 || ledgerSyncError ? "failed" : "completed",
  };
}
