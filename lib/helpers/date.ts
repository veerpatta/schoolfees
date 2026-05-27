/**
 * Canonical date formatting. Every date rendered on staff or parent surfaces
 * must flow through these helpers — no page may call
 * `new Intl.DateTimeFormat("en-IN", …)` directly. Grep-ability is the point.
 */

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const MEDIUM_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

const DATE_TIME_IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const TIME_IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const TODAY_BADGE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "long",
  year: "numeric",
});

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FALLBACK_DASH = "—";

function parseToDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Compact `28 May 2026` style. Used for due dates, payment dates, list cells. */
export function formatShortDate(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return SHORT_DATE_FORMATTER.format(date);
}

/** Same as `formatShortDate` but uses the `dateStyle: "medium"` locale variant in IST. */
export function formatMediumDate(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return MEDIUM_DATE_FORMATTER.format(date);
}

/** `28 May 2026, 4:35 pm IST`. Used for `created_at`, `applied_at`, audit timestamps. */
export function formatDateTimeIst(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return DATE_TIME_IST_FORMATTER.format(date);
}

/** `4:35 pm` (IST, 12-hour). Used for "updated at" badges on KPI cards. */
export function formatTimeIst(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return TIME_IST_FORMATTER.format(date);
}

/** `Mon, 28 May` (IST, weekday + day + month). Used for "today" chips/strips. */
export function formatTodayBadge(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return TODAY_BADGE_FORMATTER.format(date);
}

/** `May 2026` (IST). Used for heatmap headers and month-grouped reports. */
export function formatMonthYear(value: string | Date | null | undefined, fallback = FALLBACK_DASH) {
  const date = parseToDate(value);
  if (!date) return fallback;
  return MONTH_YEAR_FORMATTER.format(date);
}

/** `2026-05-28` in IST. Used for stable form/URL params, never for display. */
export function formatIsoDateIst(value: string | Date | null | undefined) {
  const date = parseToDate(value);
  if (!date) return null;
  return ISO_DATE_FORMATTER.format(date);
}
