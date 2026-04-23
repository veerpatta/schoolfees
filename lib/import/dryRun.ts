import { validateStudentInput } from "@/lib/students/validation";
import {
  detectDuplicateRows,
  type ExistingStudentDuplicateRecord,
} from "@/lib/import/duplicates";
import {
  getMappedCellValue,
} from "@/lib/import/mapping";
import {
  parseBooleanOverride,
  isPlaceholderValue,
  parseNonNegativeWholeNumber,
  parseSignedWholeNumber,
  parseSpreadsheetDate,
  parseStudentStatusValue,
  parseStudentTypeOverride,
  stringifyImportCell,
} from "@/lib/import/validation";
import { normalizeWorkbookClassLabel } from "@/lib/fees/workbook";
import type {
  DryRunProcessedRow,
  ImportBatchSummary,
  ImportIssue,
  ImportStoredRowInput,
  NormalizedStudentImportRow,
  StudentImportColumnMapping,
} from "@/lib/import/types";

type ImportClassReference = {
  id: string;
  label: string;
  aliases: readonly string[];
};

type ImportRouteReference = {
  id: string;
  label: string;
  aliases: readonly string[];
};

export type StudentImportDryRunContext = {
  rows: ImportStoredRowInput[];
  mapping: StudentImportColumnMapping;
  classes: ImportClassReference[];
  routes: ImportRouteReference[];
  existingStudents: ExistingStudentDuplicateRecord[];
  activeFeeSettingClassIds: ReadonlySet<string>;
};

function findReferenceMatch<T extends { id: string; aliases: readonly string[] }>(
  references: readonly T[],
  rawValue: string,
) {
  const normalizedRawValue = rawValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const workbookClassLabel = normalizeWorkbookClassLabel(rawValue);
  const normalizedWorkbookClassLabel = workbookClassLabel
    ? workbookClassLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
    : "";

  if (!normalizedRawValue) {
    return null;
  }

  return (
    references.find((reference) =>
      reference.aliases.some(
        (alias) => {
          const normalizedAlias = alias.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
          return (
            normalizedAlias === normalizedRawValue ||
            (normalizedWorkbookClassLabel && normalizedAlias === normalizedWorkbookClassLabel)
          );
        },
      ),
    ) ?? null
  );
}

function buildSummary(rows: readonly DryRunProcessedRow[]): ImportBatchSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
    importedRows: 0,
    skippedRows: 0,
    failedRows: 0,
  };
}

function hasAnyOverride(normalized: NormalizedStudentImportRow["overrides"]) {
  return (
    normalized.customTuitionFeeAmount !== null ||
    normalized.customTransportFeeAmount !== null ||
    normalized.customBooksFeeAmount !== null ||
    normalized.customAdmissionActivityMiscFeeAmount !== null ||
    normalized.customLateFeeFlatAmount !== null ||
    normalized.discountAmount > 0 ||
    Object.keys(normalized.customOtherFeeHeads).length > 0 ||
    normalized.studentTypeOverride !== null ||
    normalized.transportAppliesOverride !== null ||
    normalized.otherAdjustmentAmount !== null ||
    normalized.otherAdjustmentHead !== null ||
    normalized.lateFeeWaiverAmount > 0
  );
}

export function executeStudentImportDryRun({
  rows,
  mapping,
  classes,
  routes,
  existingStudents,
  activeFeeSettingClassIds,
}: StudentImportDryRunContext) {
  const classIds = new Set(classes.map((item) => item.id));
  const routeIds = new Set(routes.map((item) => item.id));

  const preliminaryRows: DryRunProcessedRow[] = rows.map((row) => {
    const errors: ImportIssue[] = [];
    const warnings: string[] = [];

    const fullName = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "fullName"));
    const classLabel = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "classLabel"));
    const admissionNo = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "admissionNo"));
    const fatherName = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "fatherName"));
    const motherName = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "motherName"));
    const fatherPhone = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "fatherPhone"));
    const motherPhone = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "motherPhone"));
    const address = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "address"));
    const routeLabel = stringifyImportCell(
      getMappedCellValue(row.rawPayload, mapping, "transportRouteLabel"),
    );
    const notes = stringifyImportCell(getMappedCellValue(row.rawPayload, mapping, "notes"));

    const matchedClass = findReferenceMatch(classes, classLabel);
    const matchedRoute = routeLabel ? findReferenceMatch(routes, routeLabel) : null;

    const dateResult = parseSpreadsheetDate(
      getMappedCellValue(row.rawPayload, mapping, "dateOfBirth"),
    );
    const statusValue = parseStudentStatusValue(
      getMappedCellValue(row.rawPayload, mapping, "status"),
    );

    const tuitionOverride = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customTuitionFeeAmount"),
      "Custom tuition fee",
    );
    const transportOverride = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customTransportFeeAmount"),
      "Custom transport fee",
    );
    const booksOverride = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customBooksFeeAmount"),
      "Custom books fee",
    );
    const admissionMiscOverride = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customAdmissionActivityMiscFeeAmount"),
      "Custom admission/activity/misc fee",
    );
    const lateFeeOverride = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customLateFeeFlatAmount"),
      "Custom late fee",
    );
    const discountAmount = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "discountAmount"),
      "Discount amount",
    );
    const studentTypeOverride = parseStudentTypeOverride(
      getMappedCellValue(row.rawPayload, mapping, "studentTypeOverride"),
    );
    const transportAppliesOverride = parseBooleanOverride(
      getMappedCellValue(row.rawPayload, mapping, "transportAppliesOverride"),
      "Transport applies override",
    );
    const customOtherFeeHead = stringifyImportCell(
      getMappedCellValue(row.rawPayload, mapping, "customOtherFeeHead"),
    );
    const customOtherFeeAmount = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "customOtherFeeAmount"),
      "Custom other fee amount",
    );
    const otherAdjustmentHead = stringifyImportCell(
      getMappedCellValue(row.rawPayload, mapping, "otherAdjustmentHead"),
    );
    const otherAdjustmentAmount = parseSignedWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "otherAdjustmentAmount"),
      "Other fee / adjustment amount",
    );
    const lateFeeWaiverAmount = parseNonNegativeWholeNumber(
      getMappedCellValue(row.rawPayload, mapping, "lateFeeWaiverAmount"),
      "Late fee waiver",
    );

    if (!admissionNo) {
      errors.push({
        code: "ERR_MISSING_ADMISSION_NO",
        field: "admissionNo",
        message: "SR no / admission no is missing.",
      });
    }

    if (isPlaceholderValue(fullName)) {
      errors.push({
        code: "ERR_PLACEHOLDER_FULL_NAME",
        field: "fullName",
        message: "Student name contains a placeholder value. Please review this row.",
      });
    }

    if (isPlaceholderValue(admissionNo)) {
      errors.push({
        code: "ERR_PLACEHOLDER_ADMISSION_NO",
        field: "admissionNo",
        message: "SR no / admission no contains a placeholder value. Please review this row.",
      });
    }

    if (isPlaceholderValue(classLabel)) {
      errors.push({
        code: "ERR_PLACEHOLDER_CLASS",
        field: "classLabel",
        message: "Class contains a placeholder value. Please review this row.",
      });
    }

    if (isPlaceholderValue(getMappedCellValue(row.rawPayload, mapping, "dateOfBirth"))) {
      errors.push({
        code: "ERR_PLACEHOLDER_DOB",
        field: "dateOfBirth",
        message: "DOB contains a placeholder value. Please review this row.",
      });
    }

    if (dateResult.error) {
      errors.push({
        code: "ERR_INVALID_DOB",
        field: "dateOfBirth",
        message: dateResult.error,
      });
    }

    if (!matchedClass && classLabel) {
      errors.push({
        code: "ERR_CLASS_NOT_FOUND",
        field: "classLabel",
        message: `Class "${classLabel}" could not be matched to an existing class.`,
      });
    }

    if (!matchedRoute && routeLabel) {
      errors.push({
        code: "ERR_ROUTE_NOT_FOUND",
        field: "transportRouteLabel",
        message: `Transport route "${routeLabel}" could not be matched to an existing route.`,
      });
    }

    if (statusValue === "__invalid__") {
      errors.push({
        code: "ERR_INVALID_STATUS",
        field: "status",
        message: "Status must be Active, Inactive, Left, or Graduated.",
      });
    }

    if (!fatherName) {
      warnings.push("WARN_MISSING_FATHER_NAME: Father name is missing.");
    }

    if (!motherName) {
      warnings.push("WARN_MISSING_MOTHER_NAME: Mother name is missing.");
    }

    if (isPlaceholderValue(fatherName)) {
      warnings.push("WARN_PLACEHOLDER_FATHER_NAME: Father name appears to be a placeholder value.");
    }

    if (isPlaceholderValue(motherName)) {
      warnings.push("WARN_PLACEHOLDER_MOTHER_NAME: Mother name appears to be a placeholder value.");
    }

    if (routeLabel && isPlaceholderValue(routeLabel)) {
      warnings.push("WARN_PLACEHOLDER_ROUTE: Transport route appears to be a placeholder value.");
    }

    for (const result of [
      tuitionOverride,
      transportOverride,
      booksOverride,
      admissionMiscOverride,
      lateFeeOverride,
      discountAmount,
      lateFeeWaiverAmount,
    ]) {
      if (result.error) {
        errors.push({
          code: "ERR_INVALID_NUMERIC_OVERRIDE",
          field: "row",
          message: result.error,
        });
      }
    }

    if (studentTypeOverride.error) {
      errors.push({
        code: "ERR_INVALID_STUDENT_TYPE_OVERRIDE",
        field: "studentTypeOverride",
        message: studentTypeOverride.error,
      });
    }

    if (transportAppliesOverride.error) {
      errors.push({
        code: "ERR_INVALID_TRANSPORT_APPLIES_OVERRIDE",
        field: "transportAppliesOverride",
        message: transportAppliesOverride.error,
      });
    }

    if (customOtherFeeHead && customOtherFeeAmount.error) {
      errors.push({
        code: "ERR_INVALID_OTHER_FEE_AMOUNT",
        field: "customOtherFeeAmount",
        message: customOtherFeeAmount.error,
      });
    }

    if (customOtherFeeAmount.value !== null && !customOtherFeeHead) {
      errors.push({
        code: "ERR_MISSING_OTHER_FEE_HEAD",
        field: "customOtherFeeHead",
        message: "Custom other fee head is required when a custom other fee amount is provided.",
      });
    }

    if (otherAdjustmentAmount.value !== null && !otherAdjustmentHead) {
      errors.push({
        code: "ERR_MISSING_OTHER_ADJUSTMENT_HEAD",
        field: "otherAdjustmentHead",
        message: "Other fee / adjustment head is required when an amount is provided.",
      });
    }

    const studentValidation = validateStudentInput(
      {
        fullName,
        classId: matchedClass?.id ?? (classLabel ? "__invalid__" : ""),
        admissionNo,
        dateOfBirth: dateResult.value ?? "",
        fatherName,
        motherName,
        fatherPhone,
        motherPhone,
        address,
        transportRouteId: matchedRoute?.id ?? (routeLabel ? "__invalid__" : ""),
        status: statusValue === "__invalid__" ? "__invalid__" : statusValue,
        studentTypeOverride:
          studentTypeOverride.value ?? (studentTypeOverride.error ? "__invalid__" : "existing"),
        tuitionOverride:
          tuitionOverride.value !== null ? tuitionOverride.value.toString() : "",
        transportOverride:
          transportOverride.value !== null ? transportOverride.value.toString() : "",
        discountAmount: discountAmount.value !== null ? discountAmount.value.toString() : "0",
        lateFeeWaiverAmount:
          lateFeeWaiverAmount.value !== null ? lateFeeWaiverAmount.value.toString() : "0",
        otherAdjustmentHead,
        otherAdjustmentAmount:
          otherAdjustmentAmount.value !== null ? otherAdjustmentAmount.value.toString() : "",
        notes,
      },
      {
        classIds,
        routeIds,
      },
    );

    if (!studentValidation.ok) {
      for (const [field, message] of Object.entries(studentValidation.fieldErrors)) {
        errors.push({
          code: `ERR_${field.toUpperCase()}`,
          field: field as ImportIssue["field"],
          message,
        });
      }
    }

    if (errors.length > 0 || !studentValidation.ok || !matchedClass) {
      return {
        rowId: row.id,
        rowIndex: row.rowIndex,
        rawPayload: row.rawPayload,
        normalizedPayload: null,
        status: "invalid" as const,
        errors,
        warnings,
        duplicateStudentId: null,
      };
    }

    const normalizedPayload: NormalizedStudentImportRow = {
      fullName: studentValidation.data.fullName,
      classId: studentValidation.data.classId,
      classLabel: matchedClass.label,
      admissionNo: studentValidation.data.admissionNo,
      dateOfBirth: studentValidation.data.dateOfBirth,
      fatherName: studentValidation.data.fatherName,
      motherName: studentValidation.data.motherName,
      fatherPhone: studentValidation.data.fatherPhone,
      motherPhone: studentValidation.data.motherPhone,
      address: studentValidation.data.address,
      transportRouteId: studentValidation.data.transportRouteId,
      transportRouteLabel: matchedRoute?.label ?? null,
      status: studentValidation.data.status,
      notes: studentValidation.data.notes,
      overrides: {
        customTuitionFeeAmount: tuitionOverride.value,
        customTransportFeeAmount: transportOverride.value,
        customBooksFeeAmount: booksOverride.value,
        customAdmissionActivityMiscFeeAmount: admissionMiscOverride.value,
        customOtherFeeHeads:
          customOtherFeeHead && customOtherFeeAmount.value !== null
            ? { [customOtherFeeHead]: customOtherFeeAmount.value }
            : {},
        customLateFeeFlatAmount: lateFeeOverride.value,
        discountAmount: discountAmount.value ?? 0,
        studentTypeOverride: studentTypeOverride.value,
        transportAppliesOverride: transportAppliesOverride.value,
        otherAdjustmentHead: otherAdjustmentHead || null,
        otherAdjustmentAmount: otherAdjustmentAmount.value,
        lateFeeWaiverAmount: lateFeeWaiverAmount.value ?? 0,
        hasAnyOverride: false,
      },
    };

    normalizedPayload.overrides.hasAnyOverride = hasAnyOverride(normalizedPayload.overrides);

    if (
      normalizedPayload.overrides.hasAnyOverride &&
      !activeFeeSettingClassIds.has(normalizedPayload.classId)
    ) {
      errors.push({
        code: "ERR_MISSING_CLASS_FEE_DEFAULTS",
        field: "classLabel",
        message: `Class fee defaults are missing for ${normalizedPayload.classLabel}, so override rows cannot be imported yet.`,
      });
    }

    return {
      rowId: row.id,
      rowIndex: row.rowIndex,
      rawPayload: row.rawPayload,
      normalizedPayload: errors.length === 0 ? normalizedPayload : null,
      status: errors.length === 0 ? ("valid" as const) : ("invalid" as const),
      errors,
      warnings,
      duplicateStudentId: null,
    };
  });

  const rowsWithDuplicates = detectDuplicateRows(preliminaryRows, existingStudents);

  return {
    rows: rowsWithDuplicates,
    summary: buildSummary(rowsWithDuplicates),
  };
}
