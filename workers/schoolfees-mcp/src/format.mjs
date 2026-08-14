/**
 * Presentation helpers. Money is stored in whole rupees everywhere in this
 * system, so nothing here ever introduces paise.
 */

// @allow-raw-money-format the Worker ships to Cloudflare on its own and cannot
// import lib/helpers/currency.ts; this is the single formatting point for it.
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function money(value) {
  return INR.format(Math.round(Number(value || 0)));
}

export function number(value) {
  return Math.round(Number(value || 0));
}

export function wholeRupees(value) {
  const parsed = Number(value);
  return Math.max(0, Math.round(Number.isFinite(parsed) ? parsed : 0));
}

export function nullableNumber(value) {
  return value === null || value === undefined ? null : number(value);
}

export function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function daysOverdue(dueDate, today) {
  if (!dueDate || !today || dueDate >= today) return 0;
  const due = new Date(`${dueDate}T00:00:00+05:30`).getTime();
  const current = new Date(`${today}T00:00:00+05:30`).getTime();
  return Math.max(0, Math.floor((current - due) / 86_400_000));
}

/**
 * Applies a caller's `fields` projection. A frontier client asking for three
 * columns should not be charged context for forty.
 */
export function project(row, fields) {
  if (!fields || fields.length === 0) return row;
  const out = {};
  for (const field of fields) {
    if (field in row) out[field] = row[field];
  }
  return out;
}

export function projectAll(rows, fields) {
  if (!fields || fields.length === 0) return rows;
  return rows.map((row) => project(row, fields));
}

/**
 * Offset pagination expressed as an opaque cursor, so callers page by echoing
 * `nextCursor` back instead of doing arithmetic.
 */
export function decodeCursor(cursor) {
  if (!cursor) return 0;
  const parsed = Number.parseInt(String(cursor), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function pageInfo({ offset, limit, returned, totalCount }) {
  const nextOffset = offset + returned;
  const hasMore =
    totalCount === null || totalCount === undefined ? returned === limit : nextOffset < totalCount;
  return {
    offset,
    limit,
    returned,
    totalCount: totalCount ?? null,
    hasMore,
    nextCursor: hasMore ? String(nextOffset) : null,
  };
}
