/**
 * Moved to `tests/deep/lib/identity.ts`.
 *
 * The deep harness needs a superset of what this file held — per-target base
 * URLs, per-target storage states, and the MCP allow-list flag — and two copies
 * of a login table is exactly the kind of duplication that goes stale. This
 * shim keeps `smoke.config.ts` and the older specs working unedited while the
 * definition lives in one place.
 *
 * One deliberate difference: `storageStatePath` here still resolves to
 * `tests/smoke-2026-05/.auth/`, because the older suite's `auth.setup.ts` writes
 * there and its projects read from there. The deep harness files its own states
 * per target under `tests/deep/.auth/<target>/`, since a cookie minted on
 * localhost is not valid against the Vercel deployment.
 */

export {
  SMOKE_ROLES,
  SMOKE_BASE_URL,
  SMOKE_SESSION_LABEL,
  availableRoles,
  canMintSessions,
  passwordFor,
  legacyStorageStatePath as storageStatePath,
  type SmokeRole,
  type SmokeRoleKey,
} from "../deep/lib/identity";
