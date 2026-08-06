// Turns a parsed sheet into a reviewable change set.
//
// Nothing here touches the database: it takes the sheet rows plus a snapshot of
// the current students and returns exactly what would change. The UI shows this
// before anything is written, so "apply" is never a leap of faith.

import { parseCell, lookupKey, type LookupResolver } from "@/lib/students/bulk-update/cells";
import type { BulkUpdateField } from "@/lib/students/bulk-update/fields";

export const STUDENT_ID_HEADER = "Student ID";
export const ADMISSION_NO_HEADER = "SR no";
export const STUDENT_NAME_HEADER = "Student name";

export type BulkUpdateSnapshotStudent = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  /** Current values keyed by field key; `null` means empty. */
  values: Record<string, string | null>;
};

export type BulkUpdateChange = {
  fieldKey: string;
  header: string;
  /** Human-readable current value, for the preview table. */
  fromLabel: string;
  /** Human-readable incoming value. */
  toLabel: string;
  /** Raw value to write to the column. */
  toValue: string | null;
  column: string;
  affectsFees: boolean;
};

export type BulkUpdateRowResult = {
  /** 1-based row number in the uploaded sheet, including the header row. */
  sheetRow: number;
  studentId: string | null;
  admissionNo: string;
  fullName: string;
  changes: BulkUpdateChange[];
  errors: string[];
};

export type BulkUpdatePreview = {
  rows: BulkUpdateRowResult[];
  /** Rows with at least one change and no errors — the ones apply will write. */
  applicableRows: BulkUpdateRowResult[];
  changedStudentCount: number;
  changeCount: number;
  unchangedRowCount: number;
  errorRowCount: number;
  /** Students whose dues must be regenerated after applying. */
  feeImpactStudentIds: string[];
};

export type SheetTable = {
  headers: string[];
  /** Data rows only — the header row is already removed. */
  rows: unknown[][];
};

function displayValue(value: string | null): string {
  return value === null || value.trim() === "" ? "—" : value;
}

/**
 * Builds the label maps once per preview. Class labels are scoped to the target
 * session so a sheet can never move a student into another year's class.
 */
export function buildLookupResolver(payload: {
  classes: ReadonlyArray<{ id: string; label: string }>;
  routes: ReadonlyArray<{ id: string; label: string; code?: string | null }>;
}): LookupResolver & {
  classLabelById: Map<string, string>;
  routeLabelById: Map<string, string>;
} {
  const classByLabel = new Map<string, string>();
  const classLabelById = new Map<string, string>();
  const routeByLabel = new Map<string, string>();
  const routeLabelById = new Map<string, string>();

  for (const item of payload.classes) {
    classByLabel.set(lookupKey(item.label), item.id);
    classLabelById.set(item.id, item.label);
  }

  for (const item of payload.routes) {
    routeByLabel.set(lookupKey(item.label), item.id);

    if (item.code) {
      // Route codes are unique too; accepting them saves staff typing.
      routeByLabel.set(lookupKey(item.code), item.id);
    }

    routeLabelById.set(item.id, item.label);
  }

  return {
    resolveClass: (label) => classByLabel.get(lookupKey(label)) ?? null,
    resolveRoute: (label) => routeByLabel.get(lookupKey(label)) ?? null,
    classLabelById,
    routeLabelById,
  };
}

export function buildBulkUpdatePreview(payload: {
  table: SheetTable;
  fields: readonly BulkUpdateField[];
  snapshot: readonly BulkUpdateSnapshotStudent[];
  lookups: ReturnType<typeof buildLookupResolver>;
}): BulkUpdatePreview {
  const { table, fields, snapshot, lookups } = payload;

  const byStudentId = new Map(snapshot.map((student) => [student.studentId, student]));
  const byAdmissionNo = new Map(
    snapshot.map((student) => [lookupKey(student.admissionNo), student]),
  );

  const headerIndex = new Map<string, number>();
  table.headers.forEach((header, index) => {
    // First occurrence wins: a duplicated column would otherwise silently
    // shadow the one the template wrote.
    if (!headerIndex.has(lookupKey(header))) {
      headerIndex.set(lookupKey(header), index);
    }
  });

  const idColumn = headerIndex.get(lookupKey(STUDENT_ID_HEADER)) ?? -1;
  const admissionColumn = headerIndex.get(lookupKey(ADMISSION_NO_HEADER)) ?? -1;

  const rows: BulkUpdateRowResult[] = [];
  const feeImpact = new Set<string>();
  const seenStudentIds = new Set<string>();

  table.rows.forEach((cells, index) => {
    const sheetRow = index + 2; // +1 for 0-based, +1 for the header row
    const rawId = idColumn >= 0 ? String(cells[idColumn] ?? "").trim() : "";
    const rawAdmission = admissionColumn >= 0 ? String(cells[admissionColumn] ?? "").trim() : "";

    // A row where every cell is blank is just spreadsheet padding.
    if (!rawId && !rawAdmission && cells.every((cell) => String(cell ?? "").trim() === "")) {
      return;
    }

    const student =
      (rawId ? byStudentId.get(rawId) : undefined) ??
      (rawAdmission ? byAdmissionNo.get(lookupKey(rawAdmission)) : undefined) ??
      null;

    if (!student) {
      rows.push({
        sheetRow,
        studentId: null,
        admissionNo: rawAdmission,
        fullName: "",
        changes: [],
        errors: [
          rawId || rawAdmission
            ? `No student in this class list matches ${rawId ? `ID ${rawId}` : `SR ${rawAdmission}`}. The row was not applied.`
            : "This row has no Student ID or SR no.",
        ],
      });
      return;
    }

    if (seenStudentIds.has(student.studentId)) {
      rows.push({
        sheetRow,
        studentId: student.studentId,
        admissionNo: student.admissionNo,
        fullName: student.fullName,
        changes: [],
        errors: [
          `SR ${student.admissionNo} appears more than once in this sheet. Only the first row is applied.`,
        ],
      });
      return;
    }

    seenStudentIds.add(student.studentId);

    const changes: BulkUpdateChange[] = [];
    const errors: string[] = [];

    for (const field of fields) {
      const column = headerIndex.get(lookupKey(field.header));

      // The column was not in the uploaded sheet at all — not an error, the
      // user may have deleted it. Fields are only applied when present.
      if (column === undefined) {
        continue;
      }

      const outcome = parseCell(field, cells[column], lookups);

      if (outcome.kind === "skip") {
        continue;
      }

      if (outcome.kind === "error") {
        errors.push(`${field.header}: ${outcome.message}`);
        continue;
      }

      const currentValue = student.values[field.key] ?? null;

      if ((currentValue ?? null) === (outcome.value ?? null)) {
        continue;
      }

      const toLabel =
        field.kind === "class"
          ? (outcome.value ? lookups.classLabelById.get(outcome.value) ?? outcome.value : "—")
          : field.kind === "route"
            ? (outcome.value ? lookups.routeLabelById.get(outcome.value) ?? outcome.value : "—")
            : displayValue(outcome.value);
      const fromLabel =
        field.kind === "class"
          ? (currentValue ? lookups.classLabelById.get(currentValue) ?? currentValue : "—")
          : field.kind === "route"
            ? (currentValue ? lookups.routeLabelById.get(currentValue) ?? currentValue : "—")
            : displayValue(currentValue);

      changes.push({
        fieldKey: field.key,
        header: field.header,
        fromLabel,
        toLabel,
        toValue: outcome.value,
        column: field.column,
        affectsFees: field.affectsFees,
      });
    }

    if (errors.length === 0 && changes.some((change) => change.affectsFees)) {
      feeImpact.add(student.studentId);
    }

    rows.push({
      sheetRow,
      studentId: student.studentId,
      admissionNo: student.admissionNo,
      fullName: student.fullName,
      changes,
      errors,
    });
  });

  // A row with any error is applied in full or not at all — a partially applied
  // row is the hardest kind of mistake to find later.
  const applicableRows = rows.filter((row) => row.errors.length === 0 && row.changes.length > 0);

  return {
    rows,
    applicableRows,
    changedStudentCount: applicableRows.length,
    changeCount: applicableRows.reduce((total, row) => total + row.changes.length, 0),
    unchangedRowCount: rows.filter((row) => row.errors.length === 0 && row.changes.length === 0)
      .length,
    errorRowCount: rows.filter((row) => row.errors.length > 0).length,
    feeImpactStudentIds: [...feeImpact],
  };
}
