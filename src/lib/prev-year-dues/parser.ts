import type { OwnerDecision, ParsedDuesRow } from "@/lib/prev-year-dues/types";

/** Normalize a name for exact comparison: lowercase, alphanumerics only. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Normalize a phone to its last 10 digits. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits.length === 0 ? "" : digits.slice(-10);
}

/** Normalize an admission number: trim + uppercase (admission numbers are case-insensitive). */
export function normalizeAdmissionNo(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** Parse a rupee amount that may contain commas, ₹, spaces, or be numeric. */
export function parseRupees(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const cleaned = value.replace(/[₹,\s]/g, "").trim();
  if (cleaned === "") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/** Map the free-text `CONFIRM? (Y/N)` cell to a normalized decision. */
export function interpretConfirm(value: string | number | null | undefined): OwnerDecision {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "") {
    return "pending";
  }
  if (text === "Y" || text === "YES" || text === "CONFIRM" || text === "CONFIRMED") {
    return "confirm";
  }
  const collapsed = text.replace(/[^A-Z]/g, "");
  if (collapsed === "WRITEOFF" || collapsed === "WAIVE" || collapsed === "WAIVED") {
    return "write_off";
  }
  if (text === "N" || text === "NO") {
    return "reject";
  }
  return "pending";
}

function toText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** Canonical column resolvers, matched tolerantly against actual headers. */
const COLUMN_MATCHERS: Record<keyof ColumnHits, (header: string) => boolean> = {
  reviewGroup: (h) => h.includes("review") && h.includes("group"),
  oldAdmissionNo: (h) => h.includes("old") && h.includes("adm"),
  oldName: (h) => h.includes("name") && (h.includes("last year") || h.includes("export")),
  prevYearDue: (h) => h.includes("prev") && h.includes("due"),
  suggestedAppAdmissionNo: (h) => h.includes("suggested") && h.includes("adm"),
  appStudentName: (h) => h.includes("app") && h.includes("student") && h.includes("name"),
  appFatherName: (h) => h.includes("app") && h.includes("father"),
  appPhone: (h) => h.includes("app") && h.includes("phone"),
  appClass: (h) => h.includes("app") && h.includes("class"),
  matchType: (h) => h.includes("match") && h.includes("type"),
  confirm: (h) => h.includes("confirm"),
  correctedAppAdmissionNo: (h) => h.includes("correct") && h.includes("adm"),
  notes: (h) => h.includes("notes"),
};

type ColumnHits = {
  reviewGroup: string | null;
  oldAdmissionNo: string | null;
  oldName: string | null;
  prevYearDue: string | null;
  suggestedAppAdmissionNo: string | null;
  appStudentName: string | null;
  appFatherName: string | null;
  appPhone: string | null;
  appClass: string | null;
  matchType: string | null;
  confirm: string | null;
  correctedAppAdmissionNo: string | null;
  notes: string | null;
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve canonical column keys to the actual header strings present in the
 * sheet. More-specific matchers (corrected/suggested/old admission) are
 * disjoint by design, so order does not matter.
 */
export function resolveColumns(headers: string[]): ColumnHits {
  const hits = {
    reviewGroup: null,
    oldAdmissionNo: null,
    oldName: null,
    prevYearDue: null,
    suggestedAppAdmissionNo: null,
    appStudentName: null,
    appFatherName: null,
    appPhone: null,
    appClass: null,
    matchType: null,
    confirm: null,
    correctedAppAdmissionNo: null,
    notes: null,
  } as ColumnHits;

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    (Object.keys(COLUMN_MATCHERS) as (keyof ColumnHits)[]).forEach((key) => {
      if (hits[key] === null && COLUMN_MATCHERS[key](normalized)) {
        hits[key] = header;
      }
    });
  }

  return hits;
}

/**
 * Pure interpretation of already-extracted sheet records (one object per row,
 * keyed by the actual header strings). Separated from file IO so it is fully
 * unit-testable. `records` should exclude the header row.
 */
export function parseDuesRows(
  records: Record<string, string | number | null>[],
): ParsedDuesRow[] {
  if (records.length === 0) {
    return [];
  }

  const headers = Object.keys(
    records.reduce<Record<string, true>>((acc, record) => {
      Object.keys(record).forEach((key) => {
        acc[key] = true;
      });
      return acc;
    }, {}),
  );
  const columns = resolveColumns(headers);

  const get = (record: Record<string, string | number | null>, column: string | null) =>
    column ? (record[column] ?? null) : null;

  return records.map((record, index) => {
    const confirmRaw = toText(get(record, columns.confirm));
    const ownerDecision = interpretConfirm(confirmRaw);
    const prevYearDue = parseRupees(get(record, columns.prevYearDue));
    const correctedAppAdmissionNo = toText(get(record, columns.correctedAppAdmissionNo));
    const suggestedAppAdmissionNo = toText(get(record, columns.suggestedAppAdmissionNo));
    const targetAdmissionNo = correctedAppAdmissionNo ?? suggestedAppAdmissionNo;

    let parseError: string | null = null;
    if (ownerDecision === "confirm") {
      if (prevYearDue === null) {
        parseError = "Confirmed row has no readable Prev-Year Due amount.";
      } else if (prevYearDue <= 0) {
        parseError = "Confirmed row has a non-positive Prev-Year Due amount.";
      }
    }

    return {
      rowIndex: index,
      raw: record,
      reviewGroup: toText(get(record, columns.reviewGroup)),
      oldAdmissionNo: toText(get(record, columns.oldAdmissionNo)),
      oldName: toText(get(record, columns.oldName)),
      prevYearDue,
      suggestedAppAdmissionNo,
      appStudentName: toText(get(record, columns.appStudentName)),
      appFatherName: toText(get(record, columns.appFatherName)),
      appPhone: toText(get(record, columns.appPhone)),
      appClass: toText(get(record, columns.appClass)),
      matchType: toText(get(record, columns.matchType)),
      confirmRaw,
      correctedAppAdmissionNo,
      notes: toText(get(record, columns.notes)),
      ownerDecision,
      targetAdmissionNo,
      parseError,
    } satisfies ParsedDuesRow;
  });
}
