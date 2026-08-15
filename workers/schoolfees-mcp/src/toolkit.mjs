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

export function permissionDenied(toolName, required) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `You do not have permission to use ${toolName}. It requires one of: ${required.join(", ")}. Ask a Schoolfees admin to change your staff role.`,
      },
    ],
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

export function defineTool(server, ctx, definition) {
  const { identity, env } = ctx;
  const {
    name,
    title,
    description,
    inputSchema,
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
