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
import { createClient } from "@/lib/supabase/server";

export type StaffAuthClaims = Record<string, unknown> & {
  email?: string;
  role?: string;
  sub?: string;
};

export type AuthenticatedStaffSession = StaffAuthClaims & {
  appRole: StaffRole;
  permissions: readonly StaffPermission[];
  isActive: boolean;
};

type StaffProfileRow = {
  role: string | null;
  is_active: boolean;
};

export async function getAuthenticatedStaff() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return null;
  }

  const { data: profileData } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  const profile = (profileData as StaffProfileRow | null) ?? null;
  const appRole = resolveStaffRole(profile?.role);

  return {
    ...(authData.user as unknown as StaffAuthClaims),
    appRole,
    permissions: rolePermissions[appRole],
    isActive: profile?.is_active ?? true,
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

export async function requireStaffPermission(
  permission: StaffPermission,
  options: PermissionGuardOptions = {},
) {
  const staff = await requireAuthenticatedStaff();

  if (hasRolePermission(staff.appRole, permission)) {
    return staff;
  }

  if (options.onDenied === "redirect") {
    redirect(options.redirectTo ?? "/protected");
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
    redirect(options.redirectTo ?? "/protected");
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
