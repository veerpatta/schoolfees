/**
 * Shared plumbing for tool definitions: input schemas every tool reuses, the
 * permission gate, and the result envelope.
 *
 * Registration goes through `defineTool` so three things are impossible to
 * forget: the permission a tool needs, the read-only annotation, and the
 * provenance block that says how fresh the money is.
 */

import * as z from "zod/v4";

import { describeScope, SCOPE_NAMES } from "./scope.mjs";
import { identityCan } from "./permissions.mjs";
import { moneyProvenance } from "./freshness.mjs";
import { getKnownSessionLabels, UnknownSessionError } from "./reads.mjs";
import { withEnvelope } from "./schema.mjs";
import { ROW_FIELD_NOTES } from "./shape/student.mjs";

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function sessionSchema(env) {
  return z
    .string()
    .regex(/^(?:(?:TEST|UAT|DEMO)-)?20\d{2}-\d{2}$/)
    .default(env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27")
    .describe(
      "Academic session label, for example 2026-27 (live) or TEST-2026-27 (testing). Sessions are separate ledgers; omitting this reads the school's current one.",
    );
}

export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(200)
  .default(20)
  .describe("Maximum rows to return.");

export const cursorSchema = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous response's pageInfo.nextCursor. Omit for the first page.");

export const fieldsSchema = z
  .array(z.string())
  .optional()
  .describe(
    "Optional projection: return only these top-level fields on each row. Use it to keep large lists small.",
  );

export function scopeSchema(defaultScope, extra = "") {
  return z
    .enum(SCOPE_NAMES)
    .default(defaultScope)
    .describe(
      `Which students to count. on_roll = currently enrolled (headcount). collectable = enrolled OR has paid something (every money figure — a student who left owing still owes). left_owing = has left and still owes. everyone = no filter, audit only.${extra ? ` ${extra}` : ""}`,
    );
}

/** Standard tool result: a one-line summary a model can quote, plus the data. */
export function toolResult(summary, structuredContent) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent,
  };
}

/**
 * A refusal, not an answer.
 *
 * `toolResult` above is the envelope for "here is what I found", including when
 * what I found is nothing. This one is for "I could not do what you asked" —
 * a missing argument, an unusable identifier. The two used to be identical
 * except for an `error` key buried in the payload, so an empty result and a bad
 * call were indistinguishable to a client that did not know to look for it.
 *
 * `permissionDenied` used to live here and was never called: `defineTool`
 * refuses to register a tool the caller cannot use, so a forbidden tool is
 * absent from `tools/list` rather than callable and refusing. Removed rather
 * than left to imply a code path that does not exist.
 */
export function toolError(summary, structuredContent) {
  return {
    isError: true,
    content: [{ type: "text", text: summary }],
    structuredContent,
  };
}

/**
 * Registers a tool, gated by the caller's staff role.
 *
 * A tool the caller cannot use is not registered at all, so `tools/list` shows
 * each person only what they can actually run — an assistant never proposes a
 * call that is going to be refused.
 */
/**
 * The freshness read is identical for every tool in one request, so it is
 * fetched once and shared. `ctx` is built per request in createMcpServer, which
 * makes it the right place to hang the memo — an isolate-level cache would leak
 * one caller's timestamp into another's request.
 */
function requestProvenance(ctx) {
  if (!ctx.provenancePromise) {
    ctx.provenancePromise = moneyProvenance(ctx.env);
  }
  return ctx.provenancePromise;
}

/**
 * Memoised the same way and for the same reason: one request may call several
 * tools, and the session list does not change between them.
 */
function requestSessionLabels(ctx) {
  if (!ctx.sessionLabelsPromise) {
    ctx.sessionLabelsPromise = getKnownSessionLabels(ctx.env);
  }
  return ctx.sessionLabelsPromise;
}

/**
 * Refuses a session label that does not exist, before the handler can answer
 * with a payload of zeros that reads like a real position.
 *
 * If the check itself fails, the tool runs. The session list being unreadable
 * is a reason to answer with a caveat, not to refuse every question.
 */
async function assertSessionExists(ctx, sessionLabel) {
  if (!sessionLabel) return;
  let known;
  try {
    known = await requestSessionLabels(ctx);
  } catch {
    return;
  }
  if (known.size > 0 && !known.has(sessionLabel)) {
    throw new UnknownSessionError(sessionLabel, known);
  }
}

export function defineTool(server, ctx, definition) {
  const { identity, env } = ctx;
  const {
    name,
    title,
    description,
    inputSchema,
    outputSchema,
    requires = [],
    handler,
    money = false,
    // Only tools that emit student rows need the field notes. Attaching them to
    // every money answer added 376 bytes to fifteen payloads that contain no
    // student row at all — a cost with no reader.
    studentRows = false,
  } = definition;

  if (!identityCan(identity, requires)) return false;

  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema,
      // The envelope blocks are appended centrally: a tool that declared its own
      // shape but forgot `provenance` would fail validation on every call, and
      // that is exactly the kind of footgun this indirection exists to remove.
      ...(outputSchema
        ? { outputSchema: withEnvelope(outputSchema, { money, studentRows }) }
        : {}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args, extra) => {
      // A money answer carries how stale it might be. The financial views are
      // rebuilt off the posting path, so a read taken right after a payment can
      // predate it, and saying "as of now" would be a lie.
      //
      // Started before the handler, not after it: this is a round trip to the
      // same database the handler is about to query, and awaiting it afterwards
      // added its full latency to every money answer for no reason.
      const provenance = money ? requestProvenance(ctx) : null;

      // Before the handler, so a label that names no ledger can never be
      // answered with zeros. `list_sessions` declares no sessionLabel and is
      // therefore untouched — it is how a caller recovers from this error.
      if ("sessionLabel" in (inputSchema || {})) {
        await assertSessionExists(ctx, args?.sessionLabel);
      }

      const result = await handler(args, { env, identity, extra });

      if (provenance && result?.structuredContent && !result.structuredContent.provenance) {
        result.structuredContent.provenance = await provenance;
      }
      // Said once per response. These used to be stamped onto every student row,
      // which is how one digest shipped the same 390 characters a hundred times.
      if (studentRows && result?.structuredContent) {
        result.structuredContent.fieldNotes ??= ROW_FIELD_NOTES;
      }

      return result;
    },
  );

  return true;
}

/** Attaches the scope block so a payload explains its own population. */
export function withScope(payload, scopeName, rows) {
  return { ...payload, scope: describeScope(scopeName, rows) };
}

/** Uniform truncation notice — silence here is how a short answer looks complete. */
export function truncationNote(truncated, cap) {
  return truncated
    ? {
        truncated: true,
        note: `The source had more rows than this response could carry (cap ${cap}). Narrow by class, route or session, or page with the cursor. Totals in this payload cover the returned rows only.`,
      }
    : { truncated: false };
}
