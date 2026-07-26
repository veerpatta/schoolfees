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

/* ------------------------------------------------------------ calendar grid */

/**
 * Calendar helpers for the phone date picker.
 *
 * These deliberately work on {year, month, day} integers rather than `Date`
 * objects. A month grid built from `Date` and rendered in IST drifts by a day
 * whenever the runtime's zone is behind UTC — the office is in IST but Vercel
 * is not, and the bug only shows up near midnight, which is exactly when the
 * day's collection total is being checked.
 */

export type CalendarDay = { year: number; month: number; day: number };

/** Today, as IST calendar parts. */
export function todayPartsIst(now: Date = new Date()): CalendarDay {
  const iso = ISO_DATE_FORMATTER.format(now);
  return isoToParts(iso);
}

export function isoToParts(iso: string): CalendarDay {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function partsToIso({ year, month, day }: CalendarDay) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths({ year, month, day }: CalendarDay, delta: number): CalendarDay {
  const zeroBased = month - 1 + delta;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  const lastDay = daysInMonth(nextYear, nextMonth + 1);
  return { year: nextYear, month: nextMonth + 1, day: Math.min(day, lastDay) };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `May 2026` for a calendar month, without round-tripping through a zone. */
export function formatCalendarMonth(year: number, month: number) {
  // Mid-month so no timezone offset can push the label into a neighbour.
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15)));
}

/**
 * The month laid out as 6 rows of 7, Sunday-first. Leading and trailing cells
 * are `null` rather than the neighbouring month's days — the design shows an
 * empty gutter, and a tappable "31 Mar" inside April's grid is a misfire
 * waiting to happen.
 */
export function monthGrid(year: number, month: number): (CalendarDay | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = daysInMonth(year, month);
  const cells: (CalendarDay | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= total; day += 1) cells.push({ year, month, day });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
});

/** `["Sun", "Mon", …]`. Derived, not hardcoded, so it follows the locale data. */
export function weekdayHeadings() {
  // 2026-03-01 was a Sunday; any known Sunday works as the anchor.
  return Array.from({ length: 7 }, (_, index) =>
    WEEKDAY_FORMATTER.format(new Date(Date.UTC(2026, 2, 1 + index))),
  );
}
