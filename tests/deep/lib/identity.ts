import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Who runs the sweep, and against what.
 *
 * This is the superset of the old `tests/smoke-2026-05/roles.ts` — the five QA
 * logins are unchanged and that file now re-exports from here, so the older
 * suite keeps working untouched. What is new is the target: the deep harness
 * runs the same sweep against a local dev server and against the deployed
 * build, and those two are not interchangeable. A cookie minted on
 * `localhost` is not valid on `vercel.app`, so storage states are filed per
 * target; and a console error in `next dev` is not the same finding as one in
 * production, so the target travels with every finding.
 */

/** Playwright does not read `.env.local`; the operational scripts' loader. */
function loadEnvFile(file: string) {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const at = trimmed.indexOf("=");
    const key = trimmed.slice(0, at).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

export type DeepTarget = "local" | "local-prod" | "production";

export const DEEP_TARGETS: readonly DeepTarget[] = ["local", "local-prod", "production"];

export function resolveTarget(): DeepTarget {
  const raw = (process.env.DEEP_TARGET ?? "local").trim().toLowerCase();
  if ((DEEP_TARGETS as readonly string[]).includes(raw)) return raw as DeepTarget;
  throw new Error(
    `DEEP_TARGET="${raw}" is not one of ${DEEP_TARGETS.join(", ")}.`,
  );
}

const LOCAL_ORIGIN = process.env.DEEP_LOCAL_ORIGIN?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const PRODUCTION_ORIGIN =
  process.env.SCHOOLFEES_SMOKE_BASE_URL?.replace(/\/$/, "") ??
  process.env.DEEP_PRODUCTION_ORIGIN?.replace(/\/$/, "") ??
  "https://schoolfees-two.vercel.app";

export function baseUrlFor(target: DeepTarget): string {
  return target === "production" ? PRODUCTION_ORIGIN : LOCAL_ORIGIN;
}

/**
 * The command that serves each target, or null when something else already is.
 * `local-prod` exists because `next dev` and `next build` disagree in ways that
 * matter here: dev emits strict-mode double renders and a hydration overlay
 * that production never shows.
 */
export function serverCommandFor(target: DeepTarget): string | null {
  if (target === "local") return "npm run dev";
  if (target === "local-prod") return "npm run build && npm run start";
  return null;
}

export type SmokeRoleKey =
  | "admin"
  | "accountant"
  | "teacher"
  | "collector"
  | "viewonly";

export type SmokeRole = {
  key: SmokeRoleKey;
  email: string;
  /** The role as `src/platform/auth/roles.ts` names it. */
  role: string;
  /** Where `getDefaultProtectedHref()` should land this role. */
  landing: string;
  /**
   * Whether this role may connect an assistant to the MCP Worker.
   * Mirrors `SCHOOLFEES_MCP_ALLOWED_ROLES` in `workers/schoolfees-mcp/wrangler.toml`.
   * A role marked false must be REFUSED at `/authorize` — that refusal is an
   * assertion in the MCP suite, not a gap in it.
   */
  mcpAllowed: boolean;
};

export const SMOKE_ROLES: readonly SmokeRole[] = [
  {
    key: "admin",
    email: "qa.admin@qa.vpps.local",
    role: "admin",
    landing: "/protected/dashboard",
    mcpAllowed: true,
  },
  {
    key: "accountant",
    email: "qa.accountant@qa.vpps.local",
    role: "accountant",
    landing: "/protected/payments",
    mcpAllowed: true,
  },
  {
    key: "teacher",
    email: "qa.teacher@qa.vpps.local",
    role: "teacher",
    landing: "/protected/students",
    mcpAllowed: false,
  },
  {
    key: "collector",
    email: "qa.collector@qa.vpps.local",
    role: "fee_collector",
    landing: "/protected/defaulters",
    mcpAllowed: true,
  },
  {
    key: "viewonly",
    email: "qa.viewonly@qa.vpps.local",
    role: "view_only",
    landing: "/protected/dashboard",
    mcpAllowed: false,
  },
];

export function roleByKey(key: string): SmokeRole {
  const found = SMOKE_ROLES.find((role) => role.key === key);
  if (!found) throw new Error(`Unknown smoke role key "${key}".`);
  return found;
}

/**
 * Storage states are per target. Reusing a localhost cookie against Vercel
 * silently lands on `/auth/login`, and the whole sweep then reports 43 routes
 * of "not authenticated" instead of one clear failure.
 */
export function storageStatePath(
  key: SmokeRoleKey,
  target: DeepTarget = resolveTarget(),
): string {
  const dir = target === "production" ? "production" : "local";
  return path.resolve(process.cwd(), `tests/deep/.auth/${dir}/${key}.json`);
}

/** The legacy path, still written by `tests/smoke-2026-05/auth.setup.ts`. */
export function legacyStorageStatePath(key: SmokeRoleKey): string {
  return path.resolve(process.cwd(), `tests/smoke-2026-05/.auth/${key}.json`);
}

/**
 * The password for a role, or null if it was not supplied.
 *
 * Resolution order, most specific first:
 *   SMOKE_PASSWORD_ADMIN=…      per role, if they ever diverge
 *   SMOKE_TEST_STAFF_PASSWORD=… one password for all five (the normal case)
 *   TEST_STAFF_PASSWORD=…       what bootstrap-test-staff.mjs reads
 *   SMOKE_LOGIN_PASSWORD=…      the older single-account mode, kept working
 */
export function passwordFor(role: SmokeRole): string | null {
  const specific = process.env[`SMOKE_PASSWORD_${role.key.toUpperCase()}`];
  const shared =
    process.env.SMOKE_TEST_STAFF_PASSWORD ?? process.env.TEST_STAFF_PASSWORD;

  if (specific?.trim()) return specific;
  if (shared?.trim()) return shared;

  if (
    process.env.SMOKE_LOGIN_EMAIL?.trim().toLowerCase() === role.email &&
    process.env.SMOKE_LOGIN_PASSWORD?.trim()
  ) {
    return process.env.SMOKE_LOGIN_PASSWORD;
  }

  return null;
}

/**
 * Whether a session can be minted without a password at all.
 *
 * With the service-role key, `auth.admin.generateLink` issues a one-time
 * magic-link token for an existing account, and the app's own `/auth/confirm`
 * route exchanges it for a session exactly as it would for a real staff member
 * clicking an emailed link. Nothing types a password, nothing is created, and
 * no account's credentials change.
 */
export function canMintSessions(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );
}

/** Roles this run can sign in as, by password or by minted session. */
export function availableRoles(): SmokeRole[] {
  const only = process.env.SMOKE_ROLES?.trim();
  const wanted = only
    ? new Set(only.split(",").map((value) => value.trim().toLowerCase()))
    : null;

  const mintable = canMintSessions();

  return SMOKE_ROLES.filter(
    (role) => (!wanted || wanted.has(role.key)) && (mintable || passwordFor(role) !== null),
  );
}

export const SMOKE_BASE_URL = PRODUCTION_ORIGIN;

export const SMOKE_SESSION_LABEL =
  process.env.SCHOOLFEES_SMOKE_SESSION ?? "TEST-2026-27";

/** The session every sweep runs under. Live `2026-27` is never a target. */
export const TEST_SESSION = SMOKE_SESSION_LABEL;

/** The live production session. Named so writes can refuse it by identity. */
export const LIVE_SESSION = "2026-27";

/**
 * Hosts a write is ever allowed to touch. A base URL outside this set means
 * someone pointed the harness at an unexpected deployment, and the write locks
 * refuse rather than guess.
 */
export const WRITE_ALLOWED_HOSTS = new Set(
  [
    new URL(LOCAL_ORIGIN).host,
    "localhost:3000",
    "127.0.0.1:3000",
    new URL(PRODUCTION_ORIGIN).host,
  ].filter(Boolean),
);

export function withSession(route: string, session: string = TEST_SESSION): string {
  if (!route.startsWith("/protected")) return route;
  // Never append a second `session=`. A repeated parameter is a real and
  // interesting case — it crashes a Server Component on this deployment — but
  // it has to be a case the harness chose, in `surface/negatives.ts`, not an
  // accident of a helper stacking on a URL that already carried one.
  if (/[?&]session(Label)?=/.test(route)) return route;
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}session=${encodeURIComponent(session)}`;
}
