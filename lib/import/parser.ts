import "server-only";

import * as XLSX from "xlsx";

import { stringifyImportCell } from "@/lib/import/validation";
import type {
  RawImportRowPayload,
  SupportedImportFormat,
} from "@/lib/import/types";

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type ParsedImportRow = {
  rowIndex: number;
  rawPayload: RawImportRowPayload;
};

export type ParsedStudentImportFile = {
  filename: string;
  sourceFormat: SupportedImportFormat;
  worksheetName: string | null;
  fileSizeBytes: number;
  headers: string[];
  rows: ParsedImportRow[];
};

function resolveImportFormat(filename: string): SupportedImportFormat {
  const normalized = filename.trim().toLowerCase();

  if (normalized.endsWith(".csv")) {
    return "csv";
  }

  if (normalized.endsWith(".xlsx")) {
    return "xlsx";
  }

  throw new Error("Only CSV and XLSX files are supported.");
}

function makeUniqueHeaders(values: readonly unknown[]) {
  const counts = new Map<string, number>();

  return values.map((value, index) => {
    const baseHeader = stringifyImportCell(value) || `Column ${index + 1}`;
    const seenCount = counts.get(baseHeader) ?? 0;

    counts.set(baseHeader, seenCount + 1);

    return seenCount === 0 ? baseHeader : `${baseHeader} (${seenCount + 1})`;
  });
}

function toJsonCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return stringifyImportCell(value) || null;
}

function isNonEmptyRow(values: readonly unknown[]) {
  return values.some((value) => {
    const normalizedValue = toJsonCellValue(value);

    return normalizedValue !== null && normalizedValue !== "";
  });
}

export async function parseStudentImportFile(file: File): Promise<ParsedStudentImportFile> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Please select a CSV or XLSX file to import.");
  }

  if (!file.name) {
    throw new Error("The uploaded file is missing a filename.");
  }

  if (file.size <= 0) {
    throw new Error("The uploaded file is empty.");
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error("The uploaded file is too large. Use a file smaller than 10 MB.");
  }

  const sourceFormat = resolveImportFormat(file.name);
  const fileBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(fileBuffer, {
    type: "array",
    raw: true,
    cellDates: true,
    dense: true,
  });

  const worksheetName = workbook.SheetNames[0] ?? null;

  if (!worksheetName) {
    throw new Error("No worksheet could be read from the uploaded file.");
  }

  const sheet = workbook.Sheets[worksheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  if (matrix.length === 0) {
    throw new Error("The uploaded file does not contain any rows.");
  }

  const headerRow = matrix[0] ?? [];

  if (!isNonEmptyRow(headerRow)) {
    throw new Error("The first row must contain column headers.");
  }

  const headers = makeUniqueHeaders(headerRow);
  const rows: ParsedImportRow[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index] ?? [];

    if (!isNonEmptyRow(values)) {
      continue;
    }

    const rawPayload: RawImportRowPayload = {};

    headers.forEach((header, headerIndex) => {
      rawPayload[header] = toJsonCellValue(values[headerIndex]);
    });

    rows.push({
      rowIndex: index + 1,
      rawPayload,
    });
  }

  if (rows.length === 0) {
    throw new Error("The uploaded file does not contain any student rows below the header.");
  }

  return {
    filename: file.name,
    sourceFormat,
    worksheetName: sourceFormat === "csv" ? null : worksheetName,
    fileSizeBytes: file.size,
    headers,
    rows,
  };
}
