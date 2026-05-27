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
} from "@/lib/auth/roles";
import { hasRequiredEnvVars } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

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
};

type StaffProfileRow = {
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

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

  const { data: profileData } = await supabase
    .from("users")
    .select("full_name, role, is_active, last_login_at")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileData as StaffProfileRow | null) ?? null;
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
