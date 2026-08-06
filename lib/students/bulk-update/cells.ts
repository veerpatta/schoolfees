// Cell-level parsing for the bulk update sheet.
//
// The one rule that keeps this safe: a BLANK cell means "leave this value
// alone". Only the literal word CLEAR blanks a stored value. A half-filled
// sheet can therefore never wipe data, which is the failure mode that makes
// spreadsheet-driven updates dangerous.

import { CLEAR_KEYWORD, type BulkUpdateField } from "@/lib/students/bulk-update/fields";
import { STUDENT_STATUSES } from "@/lib/students/constants";

export type CellOutcome =
  /** Blank cell — the stored value is not touched. */
  | { kind: "skip" }
  /** A concrete value to write. `null` means the user typed CLEAR. */
  | { kind: "set"; value: string | null }
  | { kind: "error"; message: string };

const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Excel hands back strings, numbers, booleans or Dates depending on the cell. */
export function normalizeCellText(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return "";
  }

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return "";
    }

    // Excel dates arrive as UTC midnight; read the UTC parts so a negative
    // local offset cannot roll the date back a day.
    const year = raw.getUTCFullYear();
    const month = `${raw.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${raw.getUTCDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : "";
  }

  if (typeof raw === "boolean") {
    return raw ? "true" : "false";
  }

  return String(raw).trim();
}

function isClear(value: string) {
  return value.trim().toUpperCase() === CLEAR_KEYWORD;
}

function parseDateCell(value: string): CellOutcome {
  const trimmed = value.trim();

  // Already ISO (what the template writes, and what cellDates normalises to).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  // Staff commonly type Indian day-first order.
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);

  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  } else {
    return { kind: "error", message: `"${trimmed}" is not a date. Use DD-MM-YYYY.` };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { kind: "error", message: `"${trimmed}" is not a real date.` };
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Rejects 31-02-2020 and friends, which Date would silently roll forward.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { kind: "error", message: `"${trimmed}" is not a real date.` };
  }

  const stamp = `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;

  return { kind: "set", value: stamp };
}

export type LookupResolver = {
  /** Class label (or SR-style label) -> class id, for the target session only. */
  resolveClass: (label: string) => string | null;
  /** Route name or code -> route id. */
  resolveRoute: (label: string) => string | null;
};

export function parseCell(
  field: BulkUpdateField,
  raw: unknown,
  lookups: LookupResolver,
): CellOutcome {
  const text = normalizeCellText(raw);

  if (!text.trim()) {
    return { kind: "skip" };
  }

  if (isClear(text)) {
    if (!field.clearable) {
      return {
        kind: "error",
        message: `${field.header} cannot be cleared — every student must have one.`,
      };
    }

    return { kind: "set", value: null };
  }

  const trimmed = text.trim();

  switch (field.kind) {
    case "phone": {
      if (!PHONE_PATTERN.test(trimmed)) {
        return { kind: "error", message: `"${trimmed}" is not a valid phone number.` };
      }

      return { kind: "set", value: trimmed.slice(0, field.maxLength ?? 40) };
    }

    case "email": {
      if (!EMAIL_PATTERN.test(trimmed)) {
        return { kind: "error", message: `"${trimmed}" is not a valid email address.` };
      }

      return { kind: "set", value: trimmed.slice(0, field.maxLength ?? 160) };
    }

    case "date":
      return parseDateCell(trimmed);

    case "class": {
      const classId = lookups.resolveClass(trimmed);

      if (!classId) {
        return {
          kind: "error",
          message: `Class "${trimmed}" was not found in this session.`,
        };
      }

      return { kind: "set", value: classId };
    }

    case "route": {
      const routeId = lookups.resolveRoute(trimmed);

      if (!routeId) {
        return { kind: "error", message: `Route "${trimmed}" was not found.` };
      }

      return { kind: "set", value: routeId };
    }

    case "status": {
      const match = STUDENT_STATUSES.find(
        (item) =>
          item.value === trimmed.toLowerCase() ||
          item.label.toLowerCase() === trimmed.toLowerCase(),
      );

      if (!match) {
        const allowed = STUDENT_STATUSES.map((item) => item.label).join(", ");

        return { kind: "error", message: `Status "${trimmed}" is not one of: ${allowed}.` };
      }

      return { kind: "set", value: match.value };
    }

    case "text":
    default:
      return { kind: "set", value: trimmed.slice(0, field.maxLength ?? 400) };
  }
}

/** Case/spacing-insensitive key so "Class 1 - A" matches "class 1 -  a". */
export function lookupKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
