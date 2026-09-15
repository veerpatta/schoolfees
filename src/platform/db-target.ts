/**
 * Which Supabase project is this process pointed at, and is it allowed to be?
 *
 * The rule School One runs on is that development, preview and agent sessions
 * never touch the live school database. That rule cannot live only in people's
 * heads: `NEXT_PUBLIC_SUPABASE_URL` is one line in one dashboard, and a preview
 * deployment that silently reads production looks exactly like one that does
 * not — until somebody posts a payment against real children.
 *
 * So the app refuses to start. `assertSafeDatabaseTarget()` runs from
 * `register()` in src/instrumentation.ts and throws before any request is
 * served, which turns a configuration mistake into a deployment that visibly
 * does not boot rather than one that quietly works on the wrong data.
 *
 * `scripts/lib/db-target-guard.mjs` is the same rule for `.mjs` scripts, and
 * `scripts/school-one/dev-db.mjs` is the same rule for the Supabase CLI. The
 * three are deliberately independent: the app never sees the CLI's link file,
 * and a script never boots the app.
 *
 * Two deliberate softnesses, both so the guard cannot itself cause an outage:
 *
 *   - If `PRODUCTION_SUPABASE_PROJECT_REF` is unset the guard warns once and
 *     allows. A guard that hard-fails on its own missing configuration would
 *     take production down the first time somebody forgot to copy a variable.
 *   - `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION="I understand"` is an escape hatch
 *     for a deliberate scripted READ from a laptop, and works only when
 *     `VERCEL_ENV` is unset. It can never be used on Vercel.
 */
import { getOptionalEnvVar } from "@/platform/env";

export type DatabaseTargetKind = "production" | "dev" | "local" | "unknown";

export type DatabaseTarget = {
  ref: string | null;
  kind: DatabaseTargetKind;
};

export class DatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTargetError";
  }
}

/** The exact string the override has to be set to. Not a boolean: typing a
 *  sentence is a speed bump, and "true" is something a CI system sets by
 *  accident in a way that "I understand" is not. */
const OVERRIDE_PHRASE = "I understand";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/**
 * `https://<ref>.supabase.co` → `<ref>`.
 *
 * Returns null for a local stack and for anything that is not a Supabase
 * project URL, so callers have to decide what an unrecognised target means
 * rather than having a wrong answer handed to them.
 */
export function getSupabaseProjectRef(
  url: string | undefined = getOptionalEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
): string | null {
  if (!url) {
    return null;
  }

  let host: string;

  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  if (LOCAL_HOSTS.has(host)) {
    return null;
  }

  return host.match(/^([a-z0-9-]+)\.supabase\.(co|in|net)$/i)?.[1] ?? null;
}

function isLocalUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function getDatabaseTarget(): DatabaseTarget {
  const url = getOptionalEnvVar("NEXT_PUBLIC_SUPABASE_URL");

  if (isLocalUrl(url)) {
    return { ref: null, kind: "local" };
  }

  const ref = getSupabaseProjectRef(url);

  if (!ref) {
    // No URL, or one this does not recognise. Deliberately NOT "dev": an
    // unreadable target is not a safe target, and the caller should say so.
    return { ref: null, kind: "unknown" };
  }

  const productionRef = getOptionalEnvVar("PRODUCTION_SUPABASE_PROJECT_REF");

  return {
    ref,
    kind: productionRef && ref === productionRef ? "production" : "dev",
  };
}

/**
 * Warn-once state. Exported reset exists only so tests can assert the warning
 * path more than once in a run; nothing in the application calls it.
 */
let hasWarnedAboutMissingProductionRef = false;
let hasWarnedAboutOverride = false;

export function resetDatabaseTargetWarningsForTests(): void {
  hasWarnedAboutMissingProductionRef = false;
  hasWarnedAboutOverride = false;
}

/**
 * Throws unless this process is allowed to talk to the database it is pointed
 * at. Called from instrumentation's `register()`, so a wrong answer stops the
 * server rather than serving from the wrong database.
 */
export function assertSafeDatabaseTarget(): void {
  const productionRef = getOptionalEnvVar("PRODUCTION_SUPABASE_PROJECT_REF");

  if (!productionRef) {
    if (!hasWarnedAboutMissingProductionRef) {
      hasWarnedAboutMissingProductionRef = true;
      console.warn(
        "[db-target] PRODUCTION_SUPABASE_PROJECT_REF is not set, so the production " +
          "database guard cannot tell production from development and is allowing this " +
          "process to start. Set it in every environment, including locally.",
      );
    }
    return;
  }

  const target = getDatabaseTarget();

  if (target.kind !== "production") {
    return;
  }

  const vercelEnv = getOptionalEnvVar("VERCEL_ENV");

  if (vercelEnv === "production") {
    return;
  }

  const overrideRequested =
    getOptionalEnvVar("ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION") === OVERRIDE_PHRASE;

  // The override is for a human running a read from their own machine. On
  // Vercel, VERCEL_ENV is always set, so this can never loosen a deployment.
  if (overrideRequested && vercelEnv === undefined) {
    if (!hasWarnedAboutOverride) {
      hasWarnedAboutOverride = true;
      process.stderr.write(
        "[31m\n" +
          "  ████ PRODUCTION DATABASE ████\n" +
          `  This process is pointed at the LIVE school database (${target.ref}).\n` +
          "  ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION is set, so it is being allowed.\n" +
          "  Real children, real families, real money. Read only, and be sure.\n" +
          "[0m\n",
      );
    }
    return;
  }

  throw new DatabaseTargetError(
    `Refusing to start: this environment (VERCEL_ENV=${vercelEnv ?? "unset"}) is ` +
      "pointed at the PRODUCTION Supabase project. Fix the environment variables.",
  );
}
