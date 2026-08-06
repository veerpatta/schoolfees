// Template generation and sheet reading for the bulk update workspace.
//
// The template carries only the columns the user ticked, pre-filled with the
// stored value, so "change nothing" is the default state of a downloaded file.

import {
  ADMISSION_NO_HEADER,
  STUDENT_ID_HEADER,
  STUDENT_NAME_HEADER,
  type BulkUpdateSnapshotStudent,
  type SheetTable,
} from "@/lib/students/bulk-update/diff";
import { applyListValidations, type ListValidation } from "@/lib/excel/data-validation";
import { CLEAR_KEYWORD, type BulkUpdateField } from "@/lib/students/bulk-update/fields";
import { normalizeCellText } from "@/lib/students/bulk-update/cells";
import { STUDENT_STATUSES } from "@/lib/students/constants";

type XlsxWorkBook = import("xlsx").WorkBook;

/** Identity columns are always present so a row can be matched back. */
export const LOCKED_HEADERS = [STUDENT_ID_HEADER, ADMISSION_NO_HEADER, STUDENT_NAME_HEADER];

export const BULK_UPDATE_SHEET_NAME = "Bulk update";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function buildTemplateHeaders(fields: readonly BulkUpdateField[]) {
  return [...LOCKED_HEADERS, ...fields.map((field) => field.header)];
}

function currentCellValue(
  student: BulkUpdateSnapshotStudent,
  field: BulkUpdateField,
  labels: { classLabelById: Map<string, string>; routeLabelById: Map<string, string> },
) {
  const value = student.values[field.key] ?? null;

  if (value === null) {
    return "";
  }

  if (field.kind === "class") {
    return labels.classLabelById.get(value) ?? "";
  }

  if (field.kind === "route") {
    return labels.routeLabelById.get(value) ?? "";
  }

  if (field.kind === "status") {
    return value;
  }

  return value;
}

export const BULK_UPDATE_LISTS_SHEET_NAME = "Current Lists";

/** Dropdown rows extend past the pre-filled block so pasted rows are covered. */
const BULK_UPDATE_DROPDOWN_LAST_ROW = 2000;

/**
 * Which fields get a dropdown, and where their values come from on the lists
 * sheet. Free-text fields (phone, names, notes) deliberately have none.
 */
const LIST_BACKED_FIELDS = {
  class: { column: 1, header: "Classes", definedName: "VPPS_BU_Classes", strict: true },
  route: { column: 2, header: "Routes", definedName: "VPPS_BU_Routes", strict: false },
  status: { column: 3, header: "Record status", definedName: "VPPS_BU_Status", strict: true },
} as const;

export async function buildBulkUpdateTemplateWorkbook(payload: {
  students: readonly BulkUpdateSnapshotStudent[];
  fields: readonly BulkUpdateField[];
  labels: { classLabelById: Map<string, string>; routeLabelById: Map<string, string> };
  classLabels: readonly string[];
  /** Every class/route in the session — the dropdown sources. */
  allClassLabels?: readonly string[];
  allRouteLabels?: readonly string[];
}): Promise<XlsxWorkBook> {
  const XLSX = await import("xlsx");
  const headers = buildTemplateHeaders(payload.fields);

  const rows = payload.students.map((student) => [
    student.studentId,
    student.admissionNo,
    student.fullName,
    ...payload.fields.map((field) => currentCellValue(student, field, payload.labels)),
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  sheet["!cols"] = headers.map((header) => ({
    // The uuid column is only there for matching; keep it narrow.
    wch: header === STUDENT_ID_HEADER ? 14 : Math.max(14, header.length + 4),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, BULK_UPDATE_SHEET_NAME);

  const instructions = [
    ["How to use this sheet"],
    [""],
    ["1.", "Only edit the columns you asked for. Do not rename or reorder the headers."],
    ["2.", "Leave a cell BLANK to keep the value that is already saved."],
    ["3.", `Type ${CLEAR_KEYWORD} to deliberately empty a value.`],
    ["4.", "Do not edit Student ID, SR no or Student name — they are used to match rows."],
    ["5.", "Upload the file back on the same screen. You will see every change before it saves."],
    [""],
    ["Classes in this download", payload.classLabels.join(", ")],
    ["Fields in this download", payload.fields.map((field) => field.header).join(", ")],
    [""],
    ["Column", "What to type"],
    ...payload.fields.map((field) => [field.header, field.hint ?? "Free text"]),
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(instructions),
    "Instructions",
  );

  // Dropdown sources. Each list keeps its own column so a validation can point
  // at an exact range — a padded block would show blank rows in the dropdown.
  const classLabels = payload.allClassLabels ?? payload.classLabels;
  const routeLabels = payload.allRouteLabels ?? [];
  const statusLabels = STUDENT_STATUSES.map((item) => item.label);
  const listRowCount = Math.max(classLabels.length, routeLabels.length, statusLabels.length);
  const listRows: string[][] = [
    [LIST_BACKED_FIELDS.class.header, LIST_BACKED_FIELDS.route.header, LIST_BACKED_FIELDS.status.header],
  ];

  for (let index = 0; index < listRowCount; index += 1) {
    listRows.push([
      classLabels[index] ?? "",
      routeLabels[index] ?? "",
      statusLabels[index] ?? "",
    ]);
  }

  const listsSheet = XLSX.utils.aoa_to_sheet(listRows);
  listsSheet["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, listsSheet, BULK_UPDATE_LISTS_SHEET_NAME);

  return workbook;
}

/**
 * Dropdowns for whichever list-backed fields the user ticked. A field whose
 * source list is empty is skipped — an empty range is not a valid source and
 * makes Excel report the file as corrupt.
 */
export function buildBulkUpdateValidations(payload: {
  fields: readonly BulkUpdateField[];
  classCount: number;
  routeCount: number;
  rowCount: number;
}): ListValidation[] {
  const sourceCounts: Record<string, number> = {
    class: payload.classCount,
    route: payload.routeCount,
    status: STUDENT_STATUSES.length,
  };

  const validations: ListValidation[] = [];

  payload.fields.forEach((field, index) => {
    const spec = LIST_BACKED_FIELDS[field.key as keyof typeof LIST_BACKED_FIELDS];

    if (!spec) {
      return;
    }

    const sourceCount = sourceCounts[field.key] ?? 0;

    if (sourceCount === 0) {
      return;
    }

    validations.push({
      sheetName: BULK_UPDATE_SHEET_NAME,
      sourceSheetName: BULK_UPDATE_LISTS_SHEET_NAME,
      sourceColumn: spec.column,
      sourceFirstRow: 2,
      sourceLastRow: sourceCount + 1,
      // Locked identity columns come first, then the ticked fields in order.
      targetColumn: LOCKED_HEADERS.length + index + 1,
      targetFirstRow: 2,
      targetLastRow: Math.max(payload.rowCount + 1, BULK_UPDATE_DROPDOWN_LAST_ROW),
      definedName: spec.definedName,
      prompt: `Pick from the ${spec.header} list, or leave blank to keep the saved value.`,
      error: `That value is not in the ${spec.header} list.`,
      strict: spec.strict,
    });
  });

  return validations;
}

export async function workbookToBuffer(
  workbook: XlsxWorkBook,
  validations: readonly ListValidation[] = [],
) {
  const XLSX = await import("xlsx");
  const raw = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;

  if (validations.length === 0) {
    return raw;
  }

  return Buffer.from(applyListValidations(new Uint8Array(raw), validations));
}

/** Reads the uploaded workbook into a header row plus raw data rows. */
export async function readBulkUpdateSheet(file: File): Promise<SheetTable> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Choose the filled-in Excel file to upload.");
  }

  if (file.size <= 0) {
    throw new Error("That file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 10 MB. Split it into smaller class groups.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });

  // Prefer our own sheet; fall back to the first one if it was renamed.
  const sheetName = workbook.SheetNames.includes(BULK_UPDATE_SHEET_NAME)
    ? BULK_UPDATE_SHEET_NAME
    : workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No worksheet could be read from that file.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });

  const [headerRow, ...dataRows] = matrix;

  if (!headerRow || headerRow.length === 0) {
    throw new Error("That sheet has no header row. Download a fresh template.");
  }

  return {
    headers: headerRow.map((cell) => normalizeCellText(cell)),
    rows: dataRows,
  };
}
