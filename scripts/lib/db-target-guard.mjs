/**
 * The production-database guard, for `.mjs` scripts.
 *
 * Import it as the FIRST line of any script that can write:
 *
 *   import "./lib/db-target-guard.mjs";
 *
 * ES module imports are evaluated before the importing module's body, so the
 * check has already run and refused before a single line of the script exists.
 * That is the point: a script that reads its own arguments first has already
 * decided what to do to the database by the time anybody checks which database
 * it is.
 *
 * This is the same rule as src/platform/db-target.ts, deliberately duplicated
 * rather than shared: the scripts are plain ESM with no TypeScript build step
 * and no path aliases, and a guard that fails to import is a guard that does
 * not run. The two copies are small, and the SHARED RULE comment below marks
 * what has to stay in step.
 *
 * It loads .env.local itself, because the scripts that import it load their own
 * environment further down their own file — by which time it would be too late.
 */
import { existsSync, readFileSync } from "node:fs";

/* >>> SHARED RULE — keep in step with src/platform/db-target.ts <<<
 *   production        → refuse, unless VERCEL_ENV=production
 *   override          → ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION="I understand"
 *                       AND VERCEL_ENV unset (never on Vercel)
 *   ref unset         → warn once and allow; a guard must not cause the outage
 */
const OVERRIDE_PHRASE = "I understand";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

export function getSupabaseProjectRef(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
) {
  if (!url) return null;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  if (LOCAL_HOSTS.has(host)) return null;

  return host.match(/^([a-z0-9-]+)\.supabase\.(co|in|net)$/i)?.[1] ?? null;
}

export function getDatabaseTarget() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

  let host = null;
  try {
    host = url ? new URL(url).hostname : null;
  } catch {
    host = null;
  }

  if (host && LOCAL_HOSTS.has(host)) return { ref: null, kind: "local" };

  const ref = getSupabaseProjectRef(url);
  if (!ref) return { ref: null, kind: "unknown" };

  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  return { ref, kind: productionRef && ref === productionRef ? "production" : "dev" };
}

export function assertSafeDatabaseTarget() {
  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (!productionRef) {
    console.warn(
      "[db-target] PRODUCTION_SUPABASE_PROJECT_REF is not set, so this script cannot " +
        "tell production from development and is continuing. Set it in .env.local.",
    );
    return;
  }

  const target = getDatabaseTarget();
  if (target.kind !== "production") return;

  const vercelEnv = process.env.VERCEL_ENV?.trim() || undefined;
  if (vercelEnv === "production") return;

  const overrideRequested =
    process.env.ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION?.trim() === OVERRIDE_PHRASE;

  if (overrideRequested && vercelEnv === undefined) {
    process.stderr.write(
      "[31m\n" +
        "  ████ PRODUCTION DATABASE ████\n" +
        `  This script is pointed at the LIVE school database (${target.ref}).\n` +
        "  ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION is set, so it is being allowed.\n" +
        "  Real children, real families, real money. Read only, and be sure.\n" +
        "[0m\n",
    );
    return;
  }

  console.error(
    `\n  ✖  Refusing to start: this environment (VERCEL_ENV=${vercelEnv ?? "unset"}) is ` +
      "pointed at the PRODUCTION Supabase project.\n" +
      "     Fix the environment variables.\n",
  );
  process.exit(1);
}

assertSafeDatabaseTarget();
