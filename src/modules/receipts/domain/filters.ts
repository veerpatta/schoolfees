import type { SearchParamReader } from "@/platform/navigation/search-params";
import { PAYMENT_MODE_FILTER_VALUES } from "@/modules/transactions/domain/payment-modes";
import type { PaymentMode } from "@/platform/db/types";

/**
 * The one normalizer for Receipts lookup filters.
 *
 * Same shape and the same reasoning as `lib/students/filter-params.ts`: the
 * page (plain object) and the search route (URLSearchParams) must agree, or the
 * server renders one set of receipts and the client's first refetch quietly
 * shows another.
 *
 * Deliberately not `server-only` — the client builds the same query string.
 */

export const RECEIPT_DATE_PRESETS = [
  "today",
  "yesterday",
  "week",
  "month",
  "session",
  "custom",
] as const;

export type ReceiptDatePreset = (typeof RECEIPT_DATE_PRESETS)[number];

export const RECEIPT_SORTS = ["newest", "amount"] as const;

export type ReceiptSort = (typeof RECEIPT_SORTS)[number];

export type ReceiptFilters = {
  query: string;
  sessionLabel: string;
  datePreset: ReceiptDatePreset;
  /** `YYYY-MM-DD`, read only when datePreset is "custom". */
  fromDate: string;
  toDate: string;
  /** Empty means every mode. */
  paymentModes: PaymentMode[];
  /** Empty means every class. Single-select, like the Students filter. */
  classId: string;
  /** Raw `received_by` strings — never the display name. Empty means everyone. */
  receivedBy: string[];
  reversedOnly: boolean;
  discountCloseOutsOnly: boolean;
  sort: ReceiptSort;
};

export const EMPTY_RECEIPT_FILTERS: ReceiptFilters = {
  query: "",
  sessionLabel: "",
  datePreset: "session",
  fromDate: "",
  toDate: "",
  paymentModes: [],
  classId: "",
  receivedBy: [],
  reversedOnly: false,
  discountCloseOutsOnly: false,
  sort: "newest",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

function isoToUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  return utcMsToIso(isoToUtcMs(iso) + days * MS_PER_DAY);
}

/** `YYYY-MM-DD` in the school's timezone. */
export function schoolTodayIso(referenceDate = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

/**
 * The preset as a pair of inclusive `payment_date` bounds.
 *
 * `session` returns no bounds at all: the query's `payments!inner(… →
 * session_label)` embed already scopes every read to the viewed session, and
 * adding a date range on top would exclude receipts posted for this session on
 * a date outside it.
 *
 * All arithmetic is `Date.UTC` on parsed ISO parts. `todayIso` arrives already
 * resolved in school time, so a server in UTC and a phone in IST agree on which
 * day "today" is — a plain `new Date()` here would not.
 */
export function resolveDateRange(
  filters: Pick<ReceiptFilters, "datePreset" | "fromDate" | "toDate">,
  todayIso: string,
): { from: string | null; to: string | null } {
  switch (filters.datePreset) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "yesterday": {
      const yesterday = addDaysIso(todayIso, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week": {
      // Monday-start, which is how the office reads a week.
      const weekday = new Date(isoToUtcMs(todayIso)).getUTCDay();
      const daysSinceMonday = (weekday + 6) % 7;
      return { from: addDaysIso(todayIso, -daysSinceMonday), to: todayIso };
    }
    case "month": {
      const [year, month] = todayIso.split("-");
      return { from: `${year}-${month}-01`, to: todayIso };
    }
    case "custom": {
      const from = ISO_DATE_PATTERN.test(filters.fromDate) ? filters.fromDate : null;
      const to = ISO_DATE_PATTERN.test(filters.toDate) ? filters.toDate : null;
      // A backwards range returns nothing rather than silently swapping the
      // bounds — the reader typed it, and should see that it is empty.
      return { from, to };
    }
    case "session":
    default:
      return { from: null, to: null };
  }
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const ALLOWED_MODES = new Set<string>(PAYMENT_MODE_FILTER_VALUES);

export function normalizeReceiptFilters(read: SearchParamReader): ReceiptFilters {
  const rawPreset = read("date")?.trim() ?? "";
  const rawSort = read("sort")?.trim() ?? "";
  const rawClassId = read("classId")?.trim() ?? "";
  const rawSession = (read("session") ?? read("sessionLabel"))?.trim() ?? "";
  const fromDate = read("from")?.trim() ?? "";
  const toDate = read("to")?.trim() ?? "";

  return {
    query: read("query")?.trim() ?? "",
    sessionLabel: rawSession,
    datePreset: (RECEIPT_DATE_PRESETS as readonly string[]).includes(rawPreset)
      ? (rawPreset as ReceiptDatePreset)
      : EMPTY_RECEIPT_FILTERS.datePreset,
    fromDate: ISO_DATE_PATTERN.test(fromDate) ? fromDate : "",
    toDate: ISO_DATE_PATTERN.test(toDate) ? toDate : "",
    paymentModes: parseList(read("modes")).filter((mode): mode is PaymentMode =>
      ALLOWED_MODES.has(mode),
    ),
    classId: UUID_PATTERN.test(rawClassId) ? rawClassId : "",
    receivedBy: parseList(read("by")),
    reversedOnly: read("reversed") === "1",
    discountCloseOutsOnly: read("closeouts") === "1",
    sort: (RECEIPT_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as ReceiptSort)
      : EMPTY_RECEIPT_FILTERS.sort,
  };
}

/** The query-string form, omitting anything at its default. */
export function receiptFiltersToParams(
  filters: ReceiptFilters,
  extra?: { page?: number; facets?: boolean },
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query) params.set("query", filters.query);
  if (filters.sessionLabel) params.set("session", filters.sessionLabel);
  if (filters.datePreset !== EMPTY_RECEIPT_FILTERS.datePreset) {
    params.set("date", filters.datePreset);
  }
  if (filters.datePreset === "custom") {
    if (filters.fromDate) params.set("from", filters.fromDate);
    if (filters.toDate) params.set("to", filters.toDate);
  }
  if (filters.paymentModes.length > 0) params.set("modes", filters.paymentModes.join(","));
  if (filters.classId) params.set("classId", filters.classId);
  // Emails contain no comma, so a comma-joined list round-trips. `by` is
  // deliberately short: these values are long and the URL is shared.
  if (filters.receivedBy.length > 0) params.set("by", filters.receivedBy.join(","));
  if (filters.reversedOnly) params.set("reversed", "1");
  if (filters.discountCloseOutsOnly) params.set("closeouts", "1");
  if (filters.sort !== EMPTY_RECEIPT_FILTERS.sort) params.set("sort", filters.sort);
  if (extra?.page && extra.page > 1) params.set("page", String(extra.page));
  if (extra?.facets) params.set("facets", "1");

  return params;
}

/** How many badges the filter button shows. Search is not one of them. */
export function countActiveReceiptFilters(filters: ReceiptFilters): number {
  return (
    (filters.datePreset !== EMPTY_RECEIPT_FILTERS.datePreset ? 1 : 0) +
    filters.paymentModes.length +
    (filters.classId ? 1 : 0) +
    filters.receivedBy.length +
    (filters.reversedOnly ? 1 : 0) +
    (filters.discountCloseOutsOnly ? 1 : 0) +
    (filters.sort !== EMPTY_RECEIPT_FILTERS.sort ? 1 : 0)
  );
}
