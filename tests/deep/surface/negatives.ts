import { registerDimension } from "../lib/coverage";

/**
 * Inputs the app should refuse gracefully.
 *
 * Every entry here is a real shape someone has typed, pasted or bookmarked. The
 * distinction that matters throughout is **404 versus 500**: a junk id is a
 * missing record, not a broken server, and `lib/helpers/uuid.ts` exists because
 * a non-UUID path segment used to reach Postgres and come back as
 * `invalid input syntax for type uuid` — a 500 for what is plainly a typo.
 */

export type NegativeCase = {
  id: string;
  /** `:id` is replaced with a discovered id where one is needed. */
  url: string;
  expect: "404" | "renders" | "redirect";
  note: string;
};

export const NEGATIVE_ROUTE_CASES: readonly NegativeCase[] = [
  {
    id: "student-numeric-id",
    url: "/protected/students/9999999",
    expect: "404",
    note: "Numeric where a UUID belongs. Guarded by isUuid, not by Postgres.",
  },
  {
    id: "student-junk-id",
    url: "/protected/students/not-a-uuid-at-all",
    expect: "404",
    note: "Free text in a dynamic segment.",
  },
  {
    id: "students-families-stale-link",
    url: "/protected/students/families",
    expect: "404",
    note:
      "A stale link the old smoke suite probed as if it were a page. It falls " +
      "into [studentId] and must 404 rather than 500.",
  },
  {
    id: "family-pay-stale-link",
    url: "/protected/students/family/00000000-0000-0000-0000-000000000000/pay",
    expect: "404",
    note: "No page.tsx at this path; the old suite counted it as covered.",
  },
  {
    id: "receipt-junk-id",
    url: "/protected/receipts/not-a-receipt",
    expect: "404",
    note: "Non-UUID receiptId short-circuits to notFound().",
  },
  {
    id: "promotion-missing-run",
    url: "/protected/admin-tools/promotion/deep-missing-run",
    expect: "404",
    note: "A run id that does not exist.",
  },
  {
    id: "dashboard-unknown-view",
    url: "/protected/dashboard?view=bogus",
    expect: "renders",
    note: "resolveDashboardView falls back to overview rather than erroring.",
  },
  {
    id: "dashboard-repeated-view",
    url: "/protected/dashboard?view=overview&view=collection",
    expect: "renders",
    note: "Takes value[0]. A repeated param is a real bookmark shape.",
  },
  {
    id: "dashboard-unknown-days",
    url: "/protected/dashboard?view=collection&days=999",
    expect: "renders",
    note: "resolveCollectionWindow falls back to 14.",
  },
  {
    id: "transactions-unknown-view",
    url: "/protected/transactions?view=not_a_view",
    expect: "renders",
    note:
      "Deliberately different from the dashboard: it renders a warning Notice " +
      "echoing the raw value, so wasRecognized:false is a distinct visible state.",
  },
  {
    id: "students-unknown-segment",
    url: "/protected/students?seg=notasegment,overdue",
    expect: "renders",
    note: "Unknown ids drop silently; the known one still filters.",
  },
  {
    id: "students-junk-classid",
    url: "/protected/students?classId=not-a-uuid",
    expect: "renders",
    note: "A classId not in the session's list is discarded, not queried.",
  },
  {
    id: "students-hostile-query",
    url: "/protected/students?query=%27%29%3B--%20O%27Brien%20%F0%9F%98%80",
    expect: "renders",
    note: "Quote, paren, SQL comment and an emoji in one search string.",
  },
  {
    id: "students-returnto-escape",
    url: "/protected/students/9999999?returnTo=https://example.com",
    expect: "404",
    note:
      "returnTo is restricted to /protected/students*. An off-site value must " +
      "never become a link the staff member can click.",
  },
  {
    id: "receipts-returnto-escape",
    url: "/protected/receipts/not-a-receipt?returnTo=//evil.example",
    expect: "404",
    note: "Protocol-relative returnTo on the receipt detail route.",
  },
  {
    id: "session-unknown-label",
    url: "/protected/dashboard?session=garbage",
    expect: "renders",
    note: "An invalid label is skipped, falling through to the cookie.",
  },
  {
    id: "session-repeated-param",
    url: "/protected/dashboard?session=TEST-2026-27&session=TEST-2026-27",
    expect: "renders",
    note:
      "A repeated `session` makes searchParams a string[]. Both values here are " +
      "valid and identical, so nothing about the label is wrong — only its " +
      "shape. Every other switcher in the app takes value[0]; this one throws.",
  },
  {
    id: "view-and-session-repeated",
    url: "/protected/transactions?view=receipts&view=defaulters&session=TEST-2026-27&session=TEST-2026-27",
    expect: "renders",
    note: "Two repeated params at once — the shape a shared, re-shared link ends up with.",
  },
  {
    id: "session-malformed-year",
    url: "/protected/dashboard?session=2026-2027",
    expect: "renders",
    note: "parseAcademicSessionLabel rejects a four-digit second half.",
  },
  {
    id: "defaulters-negative-amount",
    url: "/protected/defaulters?minPendingAmount=-500",
    expect: "renders",
    note: "The filter accepts digits only.",
  },
  {
    id: "defaulters-overlong-query",
    url: `/protected/defaulters?query=${"x".repeat(200)}`,
    expect: "renders",
    note: "The query is capped at 80 characters.",
  },
  {
    id: "finance-controls-bad-date",
    url: "/protected/finance-controls?date=not-a-date",
    expect: "renders",
    note: "The day picker must not hand an unparseable date to the day book.",
  },
  {
    id: "fee-setup-bad-asof",
    url: "/protected/fee-setup/time-travel?asOf=9999-99-99",
    expect: "renders",
    note: "Time travel takes an ISO date and prices the year at it.",
  },
  {
    id: "transactions-inverted-range",
    url: "/protected/transactions?fromDate=2027-01-01&toDate=2026-01-01",
    expect: "renders",
    note: "A range that ends before it begins should be empty, not an error.",
  },
];

/** Public receipt verification: three states, no login, minimal disclosure. */
export const PUBLIC_VERIFY_CASES: readonly NegativeCase[] = [
  {
    id: "verify-overlong-code",
    url: `/r/${"a".repeat(80)}`,
    expect: "renders",
    note: "Codes over 64 characters are rejected before the DB is touched.",
  },
  {
    id: "verify-illegal-characters",
    url: "/r/%3Cscript%3E",
    expect: "renders",
    note: "Anything matching /[^\\w\\-/]/ is refused without a query.",
  },
  {
    id: "verify-unknown-code",
    url: "/r/SVP-NO-SUCH-RECEIPT",
    expect: "renders",
    note: "An unknown code renders the invalid state, not a 500.",
  },
];

export const NEGATIVE_DIMENSION = registerDimension({
  id: "negative.input",
  label: "Malformed and hostile inputs",
  domain: [...NEGATIVE_ROUTE_CASES, ...PUBLIC_VERIFY_CASES].map((entry) => entry.id),
  strategy: "exhaustive-single-factor",
});
