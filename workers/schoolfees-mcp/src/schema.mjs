/**
 * Output schemas — what a caller is promised, rather than what it discovers.
 *
 * Every tool returned `structuredContent` and none declared an `outputSchema`,
 * so a client could not know the shape without calling, and the row-array key
 * changes per tool (`students`, `receipts`, `payments`, `installments`, `rows`,
 * `balances`, `drafts`). The conformance suite had to keep a hand-written table
 * of those key names to test anything at all. That is the definition of a
 * contract that forces guessing.
 *
 * Two rules hold this together:
 *
 * 1. **Strict where it is a promise, loose where it is detail.** The blocks that
 *    carry meaning across tools — scope, provenance, pageInfo, the count and
 *    money fields — are typed exactly. Detail rows are `looseObject`, so adding
 *    a column to a view is not a breaking change. The MCP SDK *validates*
 *    `structuredContent` against whatever is declared here and turns a mismatch
 *    into a tool error, so a schema that over-promises breaks the server.
 *
 * 2. **The output-side enums live here.** `paymentStatus`, `feeTier`,
 *    `moneySegment` and `enrollment.status` existed only as prose in a resource
 *    document, which meant a model had to infer the legal values from examples.
 */

import * as z from "zod/v4";

import { SCOPE_NAMES } from "./scope.mjs";

/* ---------------------------------------------------------------- primitives */

/** Whole rupees. This system has no paise anywhere, by design. */
export const rupees = z.number().int();
export const count = z.number().int().min(0);
export const isoDate = z.string();

/** A detail row: known keys are documented by the tool, unknown ones pass through. */
export const detailRow = z.looseObject({});
export const detailObject = z.looseObject({});

/* --------------------------------------------------------------- output enums */

/**
 * The student-level payment state. Driven by fees only: a student who owes
 * nothing but a late fee still reads PAID.
 */
export const paymentStatus = z.enum(["PAID", "OVERDUE", "PARTLY PAID", "NOT STARTED", ""]);

/** Which academic fee applies. NOT an enrollment status — see enrollmentStatus. */
export const feeTier = z.enum(["New", "Old"]);

/** Whether the child is still enrolled. NOT a fee tier. */
export const enrollmentStatus = z.enum(["active", "inactive", "left", "graduated"]);

/** Derived from money, never from the timing-oriented status label. */
export const moneySegment = z.enum(["never_paid", "partly_paid", "year_clear", "unclassified"]);

/** Base-charge state of one installment. 'overdue' outranks 'partial'. */
export const balanceStatus = z.enum(["pending", "partial", "overdue", "paid", "waived"]);

/** Late-fee state, carried separately from balanceStatus on purpose. */
export const lateFeeStatus = z.enum(["none", "pending", "waived", "paid"]);

export const paymentMode = z.enum(["cash", "upi", "bank_transfer", "cheque", "discount"]);

/* -------------------------------------------------------------- shared blocks */

/**
 * Which students a figure covers. The single most important block in this
 * server: two tools that disagree explain themselves here instead of looking
 * like a bug.
 */
export const scopeBlock = z.looseObject({
  name: z.enum(SCOPE_NAMES),
  rule: z.string(),
  why: z.string(),
  counted: count.optional(),
  onRoll: count.optional(),
  includedNotOnRoll: count.optional(),
  /** Present only under `everyone`, where `counted` is not a headcount. */
  warning: z.string().optional(),
});

export const dataFreshnessBlock = z.looseObject({
  known: z.boolean(),
  lastRefreshedAt: z.string().nullable().optional(),
  refreshPending: z.boolean().optional(),
  refreshRequestedAt: z.string().nullable().optional(),
  staleSeconds: z.number().nullable().optional(),
  note: z.string().optional(),
});

export const provenanceBlock = z.looseObject({
  asOf: z.string(),
  asOfDateIst: isoDate,
  dataFreshness: dataFreshnessBlock,
  readOnly: z.literal(true),
});

export const pageInfoBlock = z.looseObject({
  offset: count,
  limit: z.number().int(),
  returned: count,
  /** Exact when the source could count; null when it could not. */
  totalCount: count.nullable(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

/** One tolerated read that failed, so a payload can admit what is missing. */
export const degradedBlock = z.array(
  z.looseObject({ source: z.string(), reason: z.string() }),
);

export const fieldNotesBlock = z.looseObject({});

export const reconciliationBlock = z.looseObject({
  note: z.string(),
  blocks: z.array(detailObject),
});

/** Present on every read-only tool that drafts a message, so nobody claims it sent one. */
export const safetyBlock = z.looseObject({});

/* ------------------------------------------------------------------ composers */

/** `truncated` plus its explanatory note, as `truncationNote` emits them. */
export const truncationFields = {
  truncated: z.boolean(),
  note: z.string().optional(),
};

/**
 * Adds the blocks `defineTool` injects after a handler returns, so a per-tool
 * schema does not have to remember them. Kept here rather than in each schema
 * because forgetting one would turn a working tool into a validation error.
 */
export function withEnvelope(shape, { money = false, studentRows = false } = {}) {
  return {
    ...shape,
    ...(money ? { provenance: provenanceBlock } : {}),
    ...(studentRows ? { fieldNotes: fieldNotesBlock } : {}),
  };
}
