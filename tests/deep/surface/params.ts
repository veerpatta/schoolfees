import { officeWorkbookViews } from "../../../lib/transactions/workbook";
import { STUDENT_SEGMENTS } from "../../../lib/segments/student-segments";

import { registerDimension } from "../lib/coverage";

/**
 * Every switcher value the app understands, imported from where the app
 * defines it.
 *
 * `officeWorkbookViews` and `STUDENT_SEGMENTS` are the real exports the pages
 * read. Re-typing them here would let the harness claim exhaustive coverage of
 * a list the app no longer has — which is exactly how `CLAUDE.md` came to say
 * there are 24 student segments when there are 27.
 *
 * The dashboard boards are the one exception, and not by choice:
 * `lib/dashboard/analytics.ts` opens with `import "server-only"`, which throws
 * the moment a Node process outside the React Server build touches it. So the
 * five values are written out here and pinned against that file's source by
 * `tests/unit/deep-surface-mirror.test.ts` — the same source-string technique
 * the repo already uses to stop a copy drifting.
 */

export const DASHBOARD_VIEW_VALUES: readonly string[] = [
  "overview",
  "collection",
  "recovery",
  "classes",
  "latefee",
];

export const DASHBOARD_DAYS_VALUES: readonly string[] = ["14", "30"];

export const TRANSACTION_VIEW_VALUES: readonly string[] = [...officeWorkbookViews];

/** Retired names kept resolvable so a bookmark does not silently lose a filter. */
export const TRANSACTION_VIEW_ALIASES: Readonly<Record<string, string>> = {
  receipts_today: "receipts",
  statements: "student_dues",
  dues: "student_dues",
  all_transactions: "transactions",
  receipt_register: "receipts",
};

export const SEGMENT_IDS: readonly string[] = STUDENT_SEGMENTS.map((segment) => segment.id);

/** `fullyPaid` became `yearClear` when the money buckets were redefined. */
export const SEGMENT_ALIASES: Readonly<Record<string, string>> = {
  fullyPaid: "yearClear",
};

/** Chips hidden from a role that lacks the permission, rather than shown as zero. */
export const PERMISSION_GATED_SEGMENTS: readonly { id: string; permission: string }[] =
  STUDENT_SEGMENTS.filter((segment) => segment.requiresPermission).map((segment) => ({
    id: segment.id,
    permission: segment.requiresPermission!,
  }));

export const EXPORT_TYPES: readonly string[] = [
  "all-students",
  "student-master",
  "conventional-discount-students",
  "class-wise-dues",
  "defaulters",
  "previous-year-dues",
  "left-student-dues",
  "emi-plans",
  "emi-schedule",
  "receipt-register",
  "ai-context-bundle",
];

/** `ai-context-bundle` is XLSX only; every other type offers both. */
export const EXPORT_FORMATS: readonly string[] = ["xlsx", "pdf"];
export const XLSX_ONLY_EXPORTS = new Set(["ai-context-bundle"]);

export const RECEIPT_DATE_FILTERS: readonly string[] = [
  "today",
  "yesterday",
  "week",
  "month",
  "session",
  "custom",
];

export const RECEIPT_SORTS: readonly string[] = ["newest", "amount"];

export const RECEIPT_FLAGS: readonly string[] = ["reversed=1", "closeouts=1", "facets=1"];

export const STUDENT_SORTS: readonly string[] = ["name", "class"];

export const STUDENT_STATUS_VALUES: readonly string[] = [
  "active",
  "left",
  "graduated",
  "inactive",
];

export const PAYMENT_MODES: readonly string[] = ["cash", "upi", "bank_transfer", "cheque"];

/**
 * How a session label reaches a page: the query string, the cookie, or the
 * app's own default. They are resolved in that order and an invalid label is
 * skipped rather than errored — so `?session=garbage` silently falls through
 * to the cookie, which is a behaviour worth pinning rather than discovering.
 */
export const SESSION_RESOLUTION_CASES: readonly {
  id: string;
  query: string | null;
  expectFallback: boolean;
}[] = [
  { id: "valid-test", query: "TEST-2026-27", expectFallback: false },
  { id: "unknown-label", query: "garbage", expectFallback: true },
  { id: "malformed-year", query: "2026-2027", expectFallback: true },
  { id: "empty", query: "", expectFallback: true },
  { id: "absent", query: null, expectFallback: true },
];

export const DASHBOARD_VIEW_DIMENSION = registerDimension({
  id: "param.dashboard-view",
  label: "Dashboard boards (?view=)",
  domain: DASHBOARD_VIEW_VALUES,
  strategy: "exhaustive-single-factor",
});

export const DASHBOARD_DAYS_DIMENSION = registerDimension({
  id: "param.dashboard-days",
  label: "Collection window (?days=)",
  domain: DASHBOARD_DAYS_VALUES,
  strategy: "exhaustive-single-factor",
});

export const TRANSACTION_VIEW_DIMENSION = registerDimension({
  id: "param.transaction-view",
  label: "Transactions views (?view=)",
  domain: [...TRANSACTION_VIEW_VALUES, ...Object.keys(TRANSACTION_VIEW_ALIASES)],
  strategy: "exhaustive-single-factor",
});

export const SEGMENT_DIMENSION = registerDimension({
  id: "param.student-segment",
  label: "Student segment chips (?seg=)",
  domain: [...SEGMENT_IDS, ...Object.keys(SEGMENT_ALIASES)],
  strategy: "exhaustive-single-factor",
  pairedWith: [],
  note: "Segment × role is not covered; only the permission-gated chip is checked per role.",
});

export const EXPORT_DIMENSION = registerDimension({
  id: "param.export-type",
  label: "Export types",
  domain: EXPORT_TYPES,
  strategy: "exhaustive-single-factor",
  pairedWith: ["param.export-format"],
});

export const EXPORT_FORMAT_DIMENSION = registerDimension({
  id: "param.export-format",
  label: "Export formats",
  domain: EXPORT_FORMATS,
  strategy: "exhaustive-single-factor",
});

export const RECEIPT_FILTER_DIMENSION = registerDimension({
  id: "param.receipt-filter",
  label: "Receipt lookup filters",
  domain: [...RECEIPT_DATE_FILTERS, ...RECEIPT_SORTS, ...RECEIPT_FLAGS],
  strategy: "exhaustive-single-factor",
});

export const SESSION_RESOLUTION_DIMENSION = registerDimension({
  id: "param.session-resolution",
  label: "Session label resolution",
  domain: SESSION_RESOLUTION_CASES.map((entry) => entry.id),
  strategy: "exhaustive-single-factor",
});
