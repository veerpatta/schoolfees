import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  hasAnyRolePermission,
  hasRolePermission,
  resolveStaffRole,
  rolePermissions,
  type StaffPermission,
  type StaffRole,
} from "@/platform/auth/roles";
import { getOptionalEnvVar, hasRequiredEnvVars } from "@/platform/env";
import { createAdminClient } from "@/platform/supabase/admin";
import { cacheSafeUnstableCache } from "@/platform/supabase/cache-safe";
import { createClient } from "@/platform/supabase/server";

export type StaffAuthClaims = Record<string, unknown> & {
  id?: string;
  email?: string;
  role?: string;
  sub?: string;
};

export type AuthenticatedStaffSession = StaffAuthClaims & {
  appRole: StaffRole;
  permissions: readonly StaffPermission[];
  isActive: boolean;
  fullName: string | null;
  lastLoginAt: string | null;
  /** Account-level app language. NULL means "no choice made — use the cookie". */
  preferredLocale: string | null;
};

type StaffProfileRow = {
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  last_login_at: string | null;
  preferred_locale: string | null;
};

// preferred_locale rides along on the profile read the session already does.
// Resolving the account language must not cost a second round trip on every
// protected page.
const STAFF_PROFILE_COLUMNS = "full_name, role, is_active, last_login_at, preferred_locale";

/**
 * How long a staff profile may be served from the data cache before the
 * `users` row is read again. This bounds how long a deactivation or a role
 * change takes to reach every request; the JWT alone would take up to an hour.
 */
export const STAFF_PROFILE_REVALIDATE_SECONDS = 60;

/** Busting this evicts every cached staff profile at once. */
export const STAFF_PROFILES_TAG = "staff-profiles";

/** The per-account tag, for writes that know which staffer they touched. */
export function staffProfileTag(userId: string) {
  return `staff:${userId}`;
}

async function readStaffProfileAsAdmin(userId: string): Promise<StaffProfileRow | null> {
  const { data } = await createAdminClient()
    .from("users")
    .select(STAFF_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  return (data as StaffProfileRow | null) ?? null;
}

/**
 * One cached reader per account, because `unstable_cache` takes its tags up
 * front and the per-account tag needs the id. The map is bounded by the size
 * of the staff table, which is a couple of dozen rows.
 */
const staffProfileReaders = new Map<string, (userId: string) => Promise<StaffProfileRow | null>>();

function getStaffProfileReader(userId: string) {
  let reader = staffProfileReaders.get(userId);
  if (!reader) {
    reader = cacheSafeUnstableCache(readStaffProfileAsAdmin, ["staff-profile"], {
      tags: [STAFF_PROFILES_TAG, staffProfileTag(userId)],
      revalidate: STAFF_PROFILE_REVALIDATE_SECONDS,
    });
    staffProfileReaders.set(userId, reader);
  }
  return reader;
}

const _getAuthenticatedStaffOnce = cache(async () => {
  if (!hasRequiredEnvVars) {
    return null;
  }

  const supabase = await createClient();
  // getClaims() decodes (and verifies) the JWT locally when asymmetric signing
  // keys are configured; otherwise falls back to a server call. Either way,
  // matches the security model of getUser() while avoiding an unconditional
  // round trip on every protected page.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (claimsError || !userId) {
    return null;
  }

  // The profile row used to be read on every request -- every page, every
  // route handler, every avatar thumbnail, every command-palette keystroke --
  // which made it the one database round trip nothing could skip. It is now
  // served from the data cache for STAFF_PROFILE_REVALIDATE_SECONDS, keyed by
  // account, and busted by the staff-management actions. The read has to go
  // through the service-role client: `unstable_cache` may not touch cookies(),
  // and the row is looked up by the id the verified JWT just gave us, so RLS
  // is not what protects it here. Without a service-role key (local setups,
  // tests) it falls back to the per-request read.
  let profile: StaffProfileRow | null;
  if (getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY")) {
    profile = await getStaffProfileReader(userId)(userId);
  } else {
    const { data: profileData } = await supabase
      .from("users")
      .select(STAFF_PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    profile = (profileData as StaffProfileRow | null) ?? null;
  }
  const appRole = resolveStaffRole(profile?.role);

  return {
    id: userId,
    sub: userId,
    email: typeof claims?.email === "string" ? claims.email : undefined,
    role: typeof claims?.role === "string" ? claims.role : undefined,
    ...(claims as StaffAuthClaims),
    appRole,
    permissions: rolePermissions[appRole],
    isActive: profile?.is_active ?? true,
    fullName: profile?.full_name ?? null,
    lastLoginAt: profile?.last_login_at ?? null,
    preferredLocale: profile?.preferred_locale ?? null,
  } satisfies AuthenticatedStaffSession;
});

export async function getAuthenticatedStaff() {
  return _getAuthenticatedStaffOnce();
}

export async function requireAuthenticatedStaff(redirectTo = "/auth/login") {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    redirect(redirectTo);
  }

  if (!staff.isActive) {
    redirect(redirectTo);
  }

  return staff;
}

export function staffCan(
  staff: Pick<AuthenticatedStaffSession, "appRole">,
  permission: StaffPermission,
) {
  return hasRolePermission(staff.appRole, permission);
}

type PermissionGuardOptions = {
  onDenied?: "throw" | "redirect";
  redirectTo?: string;
};

function getAccessDeniedHref(permission: string) {
  return `/protected/access-denied?permission=${encodeURIComponent(permission)}`;
}

export async function requireStaffPermission(
  permission: StaffPermission,
  options: PermissionGuardOptions = {},
) {
  const staff = await requireAuthenticatedStaff();

  if (hasRolePermission(staff.appRole, permission)) {
    return staff;
  }

  if (options.onDenied === "redirect") {
    redirect(options.redirectTo ?? getAccessDeniedHref(permission));
  }

  throw new Error(`You do not have permission: ${permission}`);
}

export async function requireAnyStaffPermission(
  permissions: readonly StaffPermission[],
  options: PermissionGuardOptions = {},
) {
  const staff = await requireAuthenticatedStaff();

  if (hasAnyRolePermission(staff.appRole, permissions)) {
    return staff;
  }

  if (options.onDenied === "redirect") {
    redirect(
      options.redirectTo ?? getAccessDeniedHref(permissions.join(",")),
    );
  }

  throw new Error(`You do not have any required permissions: ${permissions.join(", ")}`);
}

export function hasStaffPermission(
  staff: Pick<AuthenticatedStaffSession, "appRole">,
  permission: StaffPermission,
) {
  return hasRolePermission(staff.appRole, permission);
}

export function hasAnyStaffPermission(
  staff: Pick<AuthenticatedStaffSession, "appRole">,
  permissions: readonly StaffPermission[],
) {
  return hasAnyRolePermission(staff.appRole, permissions);
}
