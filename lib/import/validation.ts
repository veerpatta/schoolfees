import type { StudentStatus } from "@/lib/db/types";

function formatDateParts(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function normalizeLookupToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const PLACEHOLDER_TOKENS = new Set([
  "na",
  "n/a",
  "none",
  "null",
  "nil",
  "xyz",
  "xxx",
  "tbd",
  "test",
  "unknown",
]);

function normalizePlaceholderToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isPlaceholderValue(value: unknown) {
  const normalized = normalizePlaceholderToken(stringifyImportCell(value));

  if (!normalized) {
    return false;
  }

  return PLACEHOLDER_TOKENS.has(normalized);
}

export function stringifyImportCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

export function parseSpreadsheetDate(value: unknown) {
  if (value === null || value === undefined || stringifyImportCell(value) === "") {
    return { value: null, error: null } as const;
  }

  if (value instanceof Date) {
    return {
      value: value.toISOString().slice(0, 10),
      error: null,
    } as const;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const converted = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);

    return {
      value: converted.toISOString().slice(0, 10),
      error: null,
    } as const;
  }

  const normalized = stringifyImportCell(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    const formatted = formatDateParts(year, month, day);

    return formatted
      ? { value: formatted, error: null }
      : { value: null, error: "DOB is invalid." };
  }

  const dayFirstMatch = normalized.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);

  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3].length === 2 ? `20${dayFirstMatch[3]}` : dayFirstMatch[3]);
    const formatted = formatDateParts(year, month, day);

    return formatted
      ? { value: formatted, error: null }
      : { value: null, error: "DOB is invalid." };
  }

  return {
    value: null,
    error: "DOB must be a valid date.",
  } as const;
}

export function parseNonNegativeWholeNumber(value: unknown, label: string) {
  const normalized = stringifyImportCell(value);

  if (!normalized) {
    return { value: null, error: null } as const;
  }

  const numeric = Number(normalized);

  if (!Number.isInteger(numeric) || numeric < 0) {
    return {
      value: null,
      error: `${label} must be a whole number greater than or equal to 0.`,
    } as const;
  }

  return { value: numeric, error: null } as const;
}

export function parseStudentStatusValue(value: unknown): StudentStatus | "__invalid__" {
  const normalized = stringifyImportCell(value).toLowerCase();

  if (!normalized || normalized === "active" || normalized === "yes" || normalized === "true" || normalized === "1") {
    return "active";
  }

  if (normalized === "inactive" || normalized === "no" || normalized === "false" || normalized === "0") {
    return "inactive";
  }

  if (normalized === "left") {
    return "left";
  }

  if (normalized === "graduated" || normalized === "passed") {
    return "graduated";
  }

  return "__invalid__";
}

export function parseStudentTypeOverride(value: unknown) {
  const normalized = stringifyImportCell(value).toLowerCase();

  if (!normalized) {
    return { value: null, error: null } as const;
  }

  if (normalized === "new" || normalized === "existing") {
    return { value: normalized, error: null } as const;
  }

  return {
    value: null,
    error: "Student type override must be either new or existing.",
  } as const;
}

export function parseBooleanOverride(value: unknown, label: string) {
  const normalized = stringifyImportCell(value).toLowerCase();

  if (!normalized) {
    return { value: null, error: null } as const;
  }

  if (["yes", "true", "1"].includes(normalized)) {
    return { value: true, error: null } as const;
  }

  if (["no", "false", "0"].includes(normalized)) {
    return { value: false, error: null } as const;
  }

  return {
    value: null,
    error: `${label} must be yes/no, true/false, or 1/0.`,
  } as const;
}
