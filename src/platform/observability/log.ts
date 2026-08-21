/**
 * Audit 1.21 — Minimal observability logger.
 *
 * Replaces ad-hoc `console.log` / `console.error` callsites that leaked raw
 * Supabase errors (table names, constraint names, etc.) into production
 * Vercel logs. In production, error payloads are sanitised — only the
 * top-level message is kept, and a small allow-list of safe fields. In
 * development, payloads are passed through verbatim for easy debugging.
 *
 * Usage:
 *   import { logError } from "@/platform/observability/log";
 *   logError("payments.duplicate-check.failed", { studentId, cause: err });
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

type LogPayload = Record<string, unknown> | undefined;

type SanitisedError = {
  name: string;
  message: string;
};

function sanitiseError(value: unknown): SanitisedError | unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (
    value &&
    typeof value === "object" &&
    ("message" in value || "code" in value)
  ) {
    const obj = value as Record<string, unknown>;
    return {
      name: typeof obj.name === "string" ? obj.name : "UnknownError",
      message:
        typeof obj.message === "string"
          ? obj.message
          : "An error occurred (details suppressed in production).",
    };
  }
  return value;
}

/**
 * A readable message for anything thrown or returned as an error.
 *
 * Supabase does not reject with `Error` instances — it returns a plain object,
 * `{ message, code, details, hint }`. So the obvious
 * `error instanceof Error ? error.message : String(error)` renders every
 * database failure as **"[object Object]"** and throws the cause away. A
 * production issue arrived reading *"Unable to load workbook installment rows:
 * [object Object]"*, which is unactionable; the real message was
 * `invalid input syntax for type uuid: "families"`.
 *
 * The Postgres `code` is included because this string is used to build errors
 * that reach Sentry and the server log, never the browser — Next redacts server
 * errors in production before they leave the machine.
 */
export function describeError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const message = typeof obj.message === "string" ? obj.message.trim() : "";
    const code = typeof obj.code === "string" ? obj.code.trim() : "";

    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return `database error ${code}`;

    try {
      // Better a JSON blob than "[object Object]".
      return JSON.stringify(value);
    } catch {
      return "unserialisable error";
    }
  }

  return String(value);
}

function sanitisePayload(payload: LogPayload): LogPayload {
  if (!payload) return payload;
  if (!IS_PRODUCTION) return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    // Strip known-noisy Postgres error fields entirely in production.
    if (key === "details" || key === "hint" || key === "code" || key === "constraint") {
      continue;
    }
    if (
      value !== null &&
      typeof value === "object" &&
      (value instanceof Error || "message" in (value as object))
    ) {
      out[key] = sanitiseError(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Verbose informational logging. In production this is a no-op unless the
 * VPPS_OBSERVABILITY_VERBOSE env var is set, so timing prints from hot data
 * loaders don't fill the Vercel log stream.
 */
export function logInfo(event: string, payload?: LogPayload): void {
  if (IS_PRODUCTION && process.env.VPPS_OBSERVABILITY_VERBOSE !== "1") {
    return;
  }
  console.log(`[info] ${event}`, sanitisePayload(payload));
}

export function logWarn(event: string, payload?: LogPayload): void {
  console.warn(`[warn] ${event}`, sanitisePayload(payload));
}

export function logError(event: string, payload?: LogPayload): void {
  console.error(`[error] ${event}`, sanitisePayload(payload));
}
