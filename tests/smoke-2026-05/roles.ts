import path from "node:path";

/**
 * The five QA staff logins, one per role.
 *
 * Created by `node scripts/bootstrap-test-staff.mjs` with a `TEST_STAFF_PASSWORD`
 * you choose. They exist so the smoke sweep can check what each role *cannot*
 * reach, not just that an admin can reach everything — the permission matrix is
 * the part of this app most likely to fail silently, because a missing guard
 * looks exactly like a working page.
 *
 * No password lives in this file or anywhere else in the repo. The password is
 * read from the environment at run time and Playwright does the typing.
 */

export type SmokeRoleKey =
  | "admin"
  | "accountant"
  | "teacher"
  | "collector"
  | "viewonly";

export type SmokeRole = {
  key: SmokeRoleKey;
  email: string;
  /** The role as `lib/auth/roles.ts` names it. */
  role: string;
  /** Where `getDefaultProtectedHref()` should land this role. */
  landing: string;
};

export const SMOKE_ROLES: readonly SmokeRole[] = [
  {
    key: "admin",
    email: "qa.admin@qa.vpps.local",
    role: "admin",
    landing: "/protected/dashboard",
  },
  {
    key: "accountant",
    email: "qa.accountant@qa.vpps.local",
    role: "accountant",
    landing: "/protected/payments",
  },
  {
    key: "teacher",
    email: "qa.teacher@qa.vpps.local",
    role: "teacher",
    landing: "/protected/students",
  },
  {
    key: "collector",
    email: "qa.collector@qa.vpps.local",
    role: "fee_collector",
    landing: "/protected/defaulters",
  },
  {
    key: "viewonly",
    email: "qa.viewonly@qa.vpps.local",
    role: "view_only",
    landing: "/protected/dashboard",
  },
];

export function storageStatePath(key: SmokeRoleKey | "admin"): string {
  return path.resolve(process.cwd(), `tests/smoke-2026-05/.auth/${key}.json`);
}

/**
 * The password for a role, or null if it was not supplied.
 *
 * Resolution order, most specific first:
 *   SMOKE_PASSWORD_ADMIN=…      per role, if they ever diverge
 *   SMOKE_TEST_STAFF_PASSWORD=… one password for all five (the normal case,
 *                               and what bootstrap-test-staff.mjs sets)
 *   TEST_STAFF_PASSWORD=…       the variable bootstrap-test-staff.mjs reads,
 *                               accepted so one export covers both
 *   SMOKE_LOGIN_PASSWORD=…      the older single-account mode, kept working
 */
export function passwordFor(role: SmokeRole): string | null {
  const specific = process.env[`SMOKE_PASSWORD_${role.key.toUpperCase()}`];
  const shared =
    process.env.SMOKE_TEST_STAFF_PASSWORD ?? process.env.TEST_STAFF_PASSWORD;

  if (specific?.trim()) return specific;
  if (shared?.trim()) return shared;

  // Single-account mode: only applies to the account that was named.
  if (
    process.env.SMOKE_LOGIN_EMAIL?.trim().toLowerCase() === role.email &&
    process.env.SMOKE_LOGIN_PASSWORD?.trim()
  ) {
    return process.env.SMOKE_LOGIN_PASSWORD;
  }

  return null;
}

/** Roles this run has credentials for. */
export function availableRoles(): SmokeRole[] {
  const only = process.env.SMOKE_ROLES?.trim();
  const wanted = only
    ? new Set(only.split(",").map((value) => value.trim().toLowerCase()))
    : null;

  return SMOKE_ROLES.filter(
    (role) => (!wanted || wanted.has(role.key)) && passwordFor(role) !== null,
  );
}

export const SMOKE_BASE_URL =
  process.env.SCHOOLFEES_SMOKE_BASE_URL?.replace(/\/$/, "") ??
  "https://schoolfees-two.vercel.app";

export const SMOKE_SESSION_LABEL =
  process.env.SCHOOLFEES_SMOKE_SESSION ?? "TEST-2026-27";
