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

/** A bare IST calendar date. Anything else is rejected rather than coerced. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * `2026-10-20` → `20-10-2026`.
 *
 * The form the school writes on every notice and challan, and the form the
 * approved WhatsApp templates expect in their date slot. Deliberately a string
 * transform rather than an `Intl` format: the input is already an IST calendar
 * date, and running it back through a formatter is how a date slides a day when
 * the server sits west of the school.
 *
 * Returns "" for anything that is not a `YYYY-MM-DD` date, so a missing due date
 * renders as an empty slot rather than the word "Invalid Date" reaching a parent.
 */
export function formatDdMmYyyy(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? "").trim());
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

/**
 * `20-10-2026` → `2026-10-20`, the inverse of {@link formatDdMmYyyy}.
 *
 * Returns null for anything else, which is what lets a caller tell "no date" from
 * "a date in the past" — the reminders screen refuses to send on the second and
 * asks for a date on the first.
 */
export function isoFromDdMmYyyy(value: string | null | undefined): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  // Reject 31-02: round-tripping through Date catches a well-formed impossible date.
  const parsed = new Date(`${iso}T00:00:00Z`);
  return ISO_DATE_FORMATTER.format(parsed) === iso ? iso : null;
}

/**
 * Read either spelling of a calendar date and answer in DD-MM-YYYY.
 *
 * `20-10-2026` and `2026-10-20` are the same day written by two controls: a
 * typed text box and a native `<input type="date">`, which always posts ISO.
 * A form may carry either, so the parser that reads it should not care which —
 * one screen learning a new control must not make the other screen's value
 * unreadable.
 *
 * Returns "" for anything that is not a real date, which is the "no date given"
 * that {@link isoFromDdMmYyyy}'s null means one layer down. Impossible dates are
 * rejected the same way, by round trip: `31-02-2026` is well-formed and not a day.
 */
export function normalizeDdMmYyyy(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (ISO_DATE_PATTERN.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    return ISO_DATE_FORMATTER.format(parsed) === raw ? formatDdMmYyyy(raw) : "";
  }
  const iso = isoFromDdMmYyyy(raw);
  return iso ? formatDdMmYyyy(iso) : "";
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

/**
 * Step calendar days. Goes through UTC purely as day arithmetic — the parts
 * in and out are IST calendar dates, and UTC has no DST to skew the count.
 */
export function addDays({ year, month, day }: CalendarDay, delta: number): CalendarDay {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
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

/* ------------------------------------------------------- IST day arithmetic */

/**
 * Today as `YYYY-MM-DD` in IST.
 *
 * The school's day, not the server's. Vercel runs west of IST, so a `new Date()`
 * date near midnight is yesterday's for the office — which on this screen would
 * mean an installment that passed its due date this morning reading as still
 * upcoming, and a "pay before the last date" notice going out the day after the
 * late fee already landed.
 */
export function istTodayIso(now: Date = new Date()): string {
  return ISO_DATE_FORMATTER.format(now);
}

/**
 * Whole days from one IST calendar date to another; negative when `endIso` is
 * the earlier of the two.
 *
 * Both ends are anchored at `T00:00:00+05:30` rather than parsed as local time,
 * so the result is a count of calendar days and never 0.96 of one rounded the
 * wrong way across a DST-free but offset-bearing boundary.
 *
 * Returns null when either side is not a `YYYY-MM-DD` date, so a caller can tell
 * "no due date on this installment" from "due today".
 */
export function daysBetweenIsoDates(startIso: string, endIso: string): number | null {
  if (!ISO_DATE_PATTERN.test(startIso) || !ISO_DATE_PATTERN.test(endIso)) return null;
  const start = new Date(`${startIso}T00:00:00+05:30`).getTime();
  const end = new Date(`${endIso}T00:00:00+05:30`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Which day of the week a `YYYY-MM-DD` calendar date falls on. 0 = Sunday.
 *
 * Anchored at UTC midnight and read with `getUTCDay`, deliberately — NOT with
 * the `+05:30` offset its neighbours use. Those two measure a span between
 * dates, where the offset has to match on both ends; this reads a property of
 * one date LABEL, and "20-09-2026 is a Sunday" is true of the label itself
 * whatever zone is asking. Offsetting it into IST instants would move it to
 * 18:30 the previous UTC day and report Saturday. `getDay()` would have the
 * same flaw with the runtime's own zone, which is why it is never used here.
 *
 * Returns null for anything that is not a `YYYY-MM-DD` date, so a caller can
 * tell "this notice names a Sunday" from "this notice names no date at all".
 */
export function weekdayOfIsoDate(iso: string | null | undefined): number | null {
  const value = String(iso ?? "").trim();
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.getUTCDay();
}

/** Shift an IST calendar date by whole days, staying in `YYYY-MM-DD`. */
export function addIsoDays(iso: string, delta: number): string | null {
  if (!ISO_DATE_PATTERN.test(iso)) return null;
  const shifted = new Date(`${iso}T00:00:00+05:30`).getTime() + delta * 86_400_000;
  if (!Number.isFinite(shifted)) return null;
  return ISO_DATE_FORMATTER.format(new Date(shifted));
}
