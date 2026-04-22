import "server-only";

import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import { buildAutoColumnMapping, validateColumnMapping } from "@/lib/import/mapping";
import { parseStudentImportFile } from "@/lib/import/parser";
import { executeStudentImportDryRun } from "@/lib/import/dryRun";
import { normalizeLookupToken } from "@/lib/import/validation";
import {
  studentImportFieldDefinitions,
} from "@/lib/import/mapping";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportBatchListItem,
  ImportBatchSummary,
  ImportIssue,
  ImportPageData,
  ImportRowDetail,
  ImportRowReviewStatus,
  NormalizedStudentImportOverride,
  NormalizedStudentImportRow,
  RawImportRowPayload,
  StudentImportColumnMapping,
} from "@/lib/import/types";

type ImportBatchRow = {
  id: string;
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
  imported_student_id: string | null;
  imported_override_id: string | null;
};

type ExistingStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  date_of_birth: string | null;
};

type FeeSettingRow = {
  class_id: string;
};

const BATCH_PAGE_SIZE = 8;
const IMPORT_ROW_WRITE_CHUNK_SIZE = 200;

function chunkArray<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

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

function deriveAnomalyCategories(row: {
  status: ImportRowDetail["status"];
  errors: ImportIssue[];
  warnings: string[];
}): ImportAnomalyCategory[] {
  const categories = new Set<ImportAnomalyCategory>();

  for (const issue of row.errors) {
    if (issue.code.includes("MISSING_ADMISSION_NO") || issue.code === "ERR_ADMISSIONNO") {
      categories.add("missing-admission-no");
    }

    if (issue.code.includes("INVALID_DOB")) {
      categories.add("invalid-dob");
    }

    if (issue.code.includes("DUPLICATE") && issue.code.includes("ADMISSION_NO")) {
      categories.add("duplicate-admission-no");
    }

    if (issue.code.includes("NAME_CLASS_DOB")) {
      categories.add("duplicate-name-class-dob");
    }

    if (issue.code === "ERR_CLASS_NOT_FOUND") {
      categories.add("unmapped-class");
    }

    if (issue.code === "ERR_ROUTE_NOT_FOUND") {
      categories.add("unmapped-route");
    }

    if (issue.code.includes("PLACEHOLDER")) {
      categories.add("placeholder-values");
    }
  }

  for (const warning of row.warnings) {
    if (warning.startsWith("WARN_MISSING_FATHER_NAME") || warning.startsWith("WARN_MISSING_MOTHER_NAME")) {
      categories.add("missing-parent-fields");
    }

    if (warning.startsWith("WARN_PLACEHOLDER")) {
      categories.add("placeholder-values");
    }
  }

  if (row.status === "duplicate") {
    if (![...categories].some((item) => item.startsWith("duplicate"))) {
      categories.add("duplicate-admission-no");
    }
  }

  return [...categories];
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
    hasAnyOverride: Boolean(record.hasAnyOverride),
  };
}

function toNormalizedPayload(value: unknown): NormalizedStudentImportRow | null {
  if (!isRecord(value)) {
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
    overrides: toNormalizedOverrides(value.overrides),
  };
}

function summarizeImportRows(rows: readonly Pick<ImportRowDetail, "status">[], failedRows = 0): ImportBatchSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
    importedRows: rows.filter((row) => row.status === "imported").length,
    skippedRows: rows.filter((row) => row.status === "skipped").length,
    failedRows,
  };
}

function toImportBatchListItem(row: ImportBatchRow): ImportBatchListItem {
  return {
    id: row.id,
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
    importedStudentId: row.imported_student_id,
    importedOverrideId: row.imported_override_id,
  };
}

function summarizeReview(rows: readonly ImportRowDetail[]) {
  return {
    approvedRows: rows.filter((row) => row.reviewStatus === "approved").length,
    pendingRows: rows.filter((row) => row.reviewStatus === "pending").length,
    heldRows: rows.filter((row) => row.reviewStatus === "hold").length,
    skippedRows: rows.filter((row) => row.reviewStatus === "skipped").length,
    unresolvedAnomalyRows: rows.filter(
      (row) => row.anomalyCategories.length > 0 && row.reviewStatus !== "skipped" && row.status !== "imported",
    ).length,
  };
}

function toImportBatchDetail(batchRow: ImportBatchRow, rowRecords: ImportRowRecord[]): ImportBatchDetail {
  const rows = rowRecords.map(toImportRowDetail);

  return {
    ...toImportBatchListItem(batchRow),
    detectedHeaders: toHeaders(batchRow.detected_headers),
    columnMapping: toColumnMapping(batchRow.column_mapping),
    errorMessage: batchRow.error_message,
    reviewSummary: summarizeReview(rows),
    rows,
  };
}

async function getImportBatchById(batchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, filename, source_format, worksheet_name, status, detected_headers, column_mapping, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, skipped_rows, failed_rows, validation_completed_at, import_completed_at, error_message, created_at, updated_at",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load import batch: ${error.message}`);
  }

  return (data as ImportBatchRow | null) ?? null;
}

async function getImportRowsByBatchId(batchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_rows")
    .select(
      "id, batch_id, row_index, raw_payload, normalized_payload, status, review_status, review_note, reviewed_at, anomaly_categories, errors, warnings, duplicate_student_id, imported_student_id, imported_override_id",
    )
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

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

async function upsertImportRows(
  rows: ReadonlyArray<{
    id: string;
    normalized_payload: NormalizedStudentImportRow | null;
    status: ImportRowDetail["status"];
    review_status?: ImportRowReviewStatus;
    review_note?: string | null;
    reviewed_at?: string | null;
    anomaly_categories?: ImportAnomalyCategory[];
    errors: ImportIssue[];
    warnings: string[];
    duplicate_student_id: string | null;
    imported_student_id?: string | null;
    imported_override_id?: string | null;
  }>,
) {
  const supabase = await createClient();

  for (const chunk of chunkArray(rows, IMPORT_ROW_WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("import_rows").upsert(chunk, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`Unable to update import rows: ${error.message}`);
    }
  }
}

export async function getStudentImportPageData(selectedBatchId?: string | null): Promise<ImportPageData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, filename, source_format, worksheet_name, status, detected_headers, column_mapping, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, skipped_rows, failed_rows, validation_completed_at, import_completed_at, error_message, created_at, updated_at",
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
      recentBatches,
      selectedBatch: null,
      fieldDefinitions: studentImportFieldDefinitions,
      supportedFormats: ["csv", "xlsx"],
    };
  }

  const [batchRow, rowRecords] = await Promise.all([
    getImportBatchById(resolvedBatchId),
    getImportRowsByBatchId(resolvedBatchId),
  ]);

  return {
    recentBatches,
    selectedBatch: batchRow ? toImportBatchDetail(batchRow, rowRecords) : null,
    fieldDefinitions: studentImportFieldDefinitions,
    supportedFormats: ["csv", "xlsx"],
  };
}

export async function createStudentImportBatch(file: File) {
  const parsedFile = await parseStudentImportFile(file);
  const supabase = await createClient();
  const initialSummary: ImportBatchSummary = {
    totalRows: parsedFile.rows.length,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    importedRows: 0,
    skippedRows: 0,
    failedRows: 0,
  };

  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      filename: parsedFile.filename,
      source_format: parsedFile.sourceFormat,
      worksheet_name: parsedFile.worksheetName,
      file_size_bytes: parsedFile.fileSizeBytes,
      status: "uploaded",
      detected_headers: parsedFile.headers,
      column_mapping: buildAutoColumnMapping(parsedFile.headers),
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

  for (const chunk of chunkArray(parsedFile.rows, IMPORT_ROW_WRITE_CHUNK_SIZE)) {
    const { error: insertRowsError } = await supabase.from("import_rows").insert(
      chunk.map((row) => ({
        batch_id: batchId,
        row_index: row.rowIndex,
        raw_payload: row.rawPayload,
        status: "pending",
      })),
    );

    if (insertRowsError) {
      throw new Error(`Unable to create import rows: ${insertRowsError.message}`);
    }
  }

  return batchId;
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
  const [masterOptions, { data: existingStudents, error: studentError }, { data: feeSettings, error: feeSettingError }] =
    await Promise.all([
      getMasterDataOptions(),
      supabase.from("students").select("id, admission_no, full_name, class_id, date_of_birth"),
      supabase.from("fee_settings").select("class_id").eq("is_active", true),
    ]);

  if (studentError) {
    throw new Error(`Unable to load students for duplicate detection: ${studentError.message}`);
  }

  if (feeSettingError) {
    throw new Error(`Unable to load fee settings for import validation: ${feeSettingError.message}`);
  }

  const validationResult = executeStudentImportDryRun({
    rows: rowRecords.map((row) => ({
      id: row.id,
      rowIndex: row.row_index,
      rawPayload: toRawPayload(row.raw_payload),
    })),
    mapping,
    classes: masterOptions.classOptions.map((row) => ({
      id: row.id,
      label: row.label,
      aliases: [normalizeLookupToken(row.label)],
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
      dateOfBirth: row.date_of_birth,
    })),
    activeFeeSettingClassIds: new Set(
      ((feeSettings ?? []) as FeeSettingRow[]).map((row) => row.class_id),
    ),
  });

  await upsertImportRows(
    validationResult.rows.map((row) => {
      const anomalyCategories = deriveAnomalyCategories({
        status: row.status,
        errors: row.errors,
        warnings: row.warnings,
      });

      return {
        id: row.rowId,
        normalized_payload: row.normalizedPayload,
        status: row.status,
        review_status:
          row.status === "valid" && anomalyCategories.length === 0 ? "approved" : "pending",
        review_note: null,
        reviewed_at: null,
        anomaly_categories: anomalyCategories,
        errors: row.errors,
        warnings: row.warnings,
        duplicate_student_id: row.duplicateStudentId,
        imported_student_id: null,
        imported_override_id: null,
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

function isDuplicateAdmissionNoError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("students_admission_no_key") ||
    normalized.includes("duplicate key value") ||
    normalized.includes("admission_no")
  );
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

async function updateImportRowAfterCommit(
  row: ImportRowDetail,
  status: ImportRowDetail["status"],
  errors: ImportIssue[],
  duplicateStudentId: string | null,
  importedStudentId: string | null,
  importedOverrideId: string | null,
  reviewStatus?: ImportRowReviewStatus,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("import_rows")
    .update({
      status,
      review_status: reviewStatus,
      errors,
      anomaly_categories: deriveAnomalyCategories({
        status,
        errors,
        warnings: row.warnings,
      }),
      duplicate_student_id: duplicateStudentId,
      imported_student_id: importedStudentId,
      imported_override_id: importedOverrideId,
    })
    .eq("id", row.id);

  if (error) {
    throw new Error(`Unable to update import row ${row.rowIndex}: ${error.message}`);
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

  const supabase = await createClient();
  const updatedRows: ImportRowDetail[] = [];
  let failedRows = 0;

  for (const row of rows) {
    if (row.status !== "valid" || !row.normalizedPayload || row.reviewStatus !== "approved") {
      updatedRows.push(row);
      continue;
    }

    try {
      const payload = row.normalizedPayload;
      const { data, error } = await supabase
        .rpc("import_student_batch_row", {
          p_batch_id: batchId,
          p_row_index: row.rowIndex,
          p_full_name: payload.fullName,
          p_class_id: payload.classId,
          p_admission_no: payload.admissionNo,
          p_date_of_birth: payload.dateOfBirth,
          p_father_name: payload.fatherName,
          p_mother_name: payload.motherName,
          p_primary_phone: payload.fatherPhone,
          p_secondary_phone: payload.motherPhone,
          p_address: payload.address,
          p_transport_route_id: payload.transportRouteId,
          p_status: payload.status,
          p_notes: payload.notes,
          p_custom_tuition_fee_amount: payload.overrides.customTuitionFeeAmount,
          p_custom_transport_fee_amount: payload.overrides.customTransportFeeAmount,
          p_custom_books_fee_amount: payload.overrides.customBooksFeeAmount,
          p_custom_admission_activity_misc_fee_amount:
            payload.overrides.customAdmissionActivityMiscFeeAmount,
          p_custom_other_fee_heads: payload.overrides.customOtherFeeHeads,
          p_custom_late_fee_flat_amount: payload.overrides.customLateFeeFlatAmount,
          p_discount_amount: payload.overrides.discountAmount,
          p_student_type_override: payload.overrides.studentTypeOverride,
          p_transport_applies_override: payload.overrides.transportAppliesOverride,
        })
        .single();

      if (error) {
        throw new Error(error.message);
      }

      const importedStudentId =
        isRecord(data) && typeof data.student_id === "string" ? data.student_id : null;
      const importedOverrideId =
        isRecord(data) && typeof data.student_fee_override_id === "string"
          ? data.student_fee_override_id
          : null;

      await updateImportRowAfterCommit(
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
        importedStudentId,
        importedOverrideId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error while importing this row.";

      if (isDuplicateAdmissionNoError(message)) {
        const { data: duplicateStudent } = await supabase
          .from("students")
          .select("id")
          .eq("admission_no", row.normalizedPayload.admissionNo)
          .maybeSingle();

        const duplicateIssue: ImportIssue = {
          code: "ERR_DUPLICATE_DB_ADMISSION_NO",
          field: "admissionNo",
          message: `SR no ${row.normalizedPayload.admissionNo} already exists in the student master.`,
        };
        const duplicateErrors = [...row.errors, duplicateIssue];
        const duplicateStudentId =
          duplicateStudent && typeof duplicateStudent.id === "string"
            ? duplicateStudent.id
            : null;

        await updateImportRowAfterCommit(
          row,
          "duplicate",
          duplicateErrors,
          duplicateStudentId,
          null,
          null,
          "pending",
        );

        updatedRows.push({
          ...row,
          status: "duplicate",
          errors: duplicateErrors,
          duplicateStudentId,
          importedStudentId: null,
          importedOverrideId: null,
        });
        continue;
      }

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

  await updateImportBatch(batchId, {
    status: failedRows > 0 ? "failed" : "completed",
    valid_rows: summary.validRows,
    invalid_rows: summary.invalidRows,
    duplicate_rows: summary.duplicateRows,
    imported_rows: summary.importedRows,
    skipped_rows: summary.skippedRows,
    failed_rows: summary.failedRows,
    summary,
    import_completed_at: new Date().toISOString(),
    error_message:
      failedRows > 0
        ? `${failedRows} row${failedRows === 1 ? "" : "s"} could not be saved during import.`
        : null,
  });
}
