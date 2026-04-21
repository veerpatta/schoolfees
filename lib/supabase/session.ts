import "server-only";

import { redirect } from "next/navigation";

import { resolveStaffRole, type StaffRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type StaffAuthClaims = Record<string, unknown> & {
  email?: string;
  role?: string;
  sub?: string;
};

export type AuthenticatedStaffSession = StaffAuthClaims & {
  appRole: StaffRole;
};

export async function getAuthenticatedStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  return (data?.claims as StaffAuthClaims | null) ?? null;
}

// Placeholder for future role-aware checks against public.users.
export async function requireAuthenticatedStaff(redirectTo = "/auth/login") {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    redirect(redirectTo);
  }

  return {
    ...staff,
    appRole: resolveStaffRole(staff.role),
  } satisfies AuthenticatedStaffSession;
}
