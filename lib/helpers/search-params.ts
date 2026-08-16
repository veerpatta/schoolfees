/**
 * Reading a search param without assuming it is a string.
 *
 * Next hands a page `string | string[] | undefined` for every entry in
 * `searchParams`: `?session=A&session=B` — or the same value twice, which is
 * what a re-shared link produces — arrives as an array. Several pages typed
 * theirs as plain `string`, so TypeScript agreed with them and the array only
 * showed up at runtime as `trim is not a function`, thrown out of a Server
 * Component. In production that renders as a blank page with the message
 * redacted; the Dashboard and Transactions both went down that way
 * (SCHOOLFEES-D, SCHOOLFEES-F).
 *
 * The convention here is **first value wins**, matching `resolveDashboardView`
 * and `resolveOfficeWorkbookView`, which already take `value[0]`. A repeated
 * parameter is a malformed URL, not a request for two things at once, and the
 * first one is what the user most likely meant.
 */

export type SearchParamValue = string | string[] | undefined;

export type RawSearchParams = Record<string, SearchParamValue>;

/** The first value, or null. Never throws, whatever shape arrives. */
export function firstSearchParam(value: SearchParamValue): string | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return first ?? null;
  }
  return typeof value === "string" ? value : null;
}

/** The first value, trimmed, or "" — the shape most call sites want. */
export function searchParamString(value: SearchParamValue): string {
  return (firstSearchParam(value) ?? "").trim();
}

/** The first value, trimmed, or undefined — for optional filter arguments. */
export function optionalSearchParam(value: SearchParamValue): string | undefined {
  return searchParamString(value) || undefined;
}

/**
 * Digits only, as a bounded integer, or undefined.
 *
 * Used by the amount and page filters, where a negative or absurd value should
 * quietly become "no filter" rather than reaching a query.
 */
export function searchParamInteger(
  value: SearchParamValue,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | undefined {
  const raw = searchParamString(value);
  if (!/^\d+$/.test(raw)) return undefined;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;

  return parsed;
}

/**
 * An ISO date that exists, not merely one shaped like a date.
 *
 * `/^\d{4}-\d{2}-\d{2}$/` accepts `9999-99-99`, which reached Postgres and came
 * back as `date/time field value out of range` — another Server Component throw
 * (SCHOOLFEES-E). `new Date("2026-02-31")` rolls forward to March rather than
 * failing, so the only reliable check is whether the date prints back as what
 * was asked for.
 */
export function searchParamIsoDate(value: SearchParamValue): string | null {
  const raw = searchParamString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== raw) return null;

  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;

  return raw;
}
