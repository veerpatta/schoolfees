import "server-only";

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

export async function getAuthenticatedStaff() {
  if (!hasRequiredEnvVars) {
    return null;
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return null;
  }

  const { data: profileData } = await supabase
    .from("users")
    .select("full_name, role, is_active, last_login_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  const profile = (profileData as StaffProfileRow | null) ?? null;
  const appRole = resolveStaffRole(profile?.role);

  return {
    id: authData.user.id,
    ...(authData.user as unknown as StaffAuthClaims),
    appRole,
    permissions: rolePermissions[appRole],
    isActive: profile?.is_active ?? true,
    fullName: profile?.full_name ?? null,
    lastLoginAt: profile?.last_login_at ?? null,
  } satisfies AuthenticatedStaffSession;
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
