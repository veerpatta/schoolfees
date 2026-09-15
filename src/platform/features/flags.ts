import "server-only";

import { notFound } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

import { cacheSafeUnstableCache } from "@/platform/supabase/cache-safe";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAuthenticatedStaff } from "@/platform/supabase/session";
import type { StaffRole } from "@/platform/auth/roles";

/**
 * Feature flags, and the canary model they exist for.
 *
 * Production runs one deployment for the whole school. `director@vpps.co.in`
 * does the day's work in it and must never meet an unfinished School One screen
 * by accident; `raj@vpps.co.in` is the canary and sees new work the day it
 * merges. A flag is the difference between those two experiences, and it moves
 * by a person clicking something — off → the canary's id → the roles that need
 * it → everyone — not by a deploy.
 *
 * Two rules that look like details and are not:
 *
 *   - **An unknown key is false, never an error.** A missing row must not take
 *     a page down. It reports to Sentry, because a surface gated on a key
 *     nobody created is a bug, and then it hides the surface — which is the
 *     safe direction to be wrong in.
 *   - **`requireFeature` answers 404, not 403.** A feature the office is not
 *     meant to have yet should be invisible, not forbidden. 403 tells them
 *     something exists and they cannot have it, which is an invitation to ask
 *     about it; 404 is the truth as far as they are concerned.
 */

export type FeatureFlagRow = {
  key: string;
  description: string;
  enabled_for_all: boolean;
  enabled_roles: StaffRole[] | null;
  enabled_user_ids: string[] | null;
  updated_by: string | null;
  updated_at: string;
};

/**
 * Same bound as STAFF_PROFILE_REVALIDATE_SECONDS, and for the same reason: it
 * caps how long a change takes to reach every request. Turning a flag OFF is
 * the emergency direction — it is how a half-ready screen is taken away from
 * the office — so a minute is the most anyone should have to wait, and the
 * editor busts the tag anyway so in practice it is immediate.
 */
export const FEATURE_FLAG_REVALIDATE_SECONDS = 60;

/** Busting this evicts every cached flag at once. */
export const FEATURE_FLAGS_TAG = "feature-flags";

async function readFeatureFlagsAsAdmin(): Promise<FeatureFlagRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, description, enabled_for_all, enabled_roles, enabled_user_ids, updated_by, updated_at");

  if (error) {
    // Same stance as an unknown key: report it, then behave as though nothing
    // is enabled. A database hiccup must not switch features ON.
    Sentry.captureMessage("feature-flags.read-failed", {
      level: "warning",
      extra: { error: error.message },
    });
    return [];
  }

  return (data ?? []) as FeatureFlagRow[];
}

const readFlags = cacheSafeUnstableCache(readFeatureFlagsAsAdmin, ["feature-flags"], {
  tags: [FEATURE_FLAGS_TAG],
  revalidate: FEATURE_FLAG_REVALIDATE_SECONDS,
});

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const flags = await readFlags();
  return [...flags].sort((left, right) => left.key.localeCompare(right.key));
}

export type FeatureStaff = { id: string; role: StaffRole };

/**
 * The three conditions are OR-ed, never AND-ed: on for everyone, or this
 * person's role, or this person by id.
 */
export function isFeatureEnabledForStaff(
  flag: FeatureFlagRow | undefined,
  staff: FeatureStaff,
): boolean {
  if (!flag) {
    return false;
  }

  if (flag.enabled_for_all) {
    return true;
  }

  if (flag.enabled_roles?.includes(staff.role)) {
    return true;
  }

  return flag.enabled_user_ids?.includes(staff.id) ?? false;
}

export async function isFeatureEnabled(
  key: string,
  staff: FeatureStaff,
): Promise<boolean> {
  const flags = await readFlags();
  const flag = flags.find((row) => row.key === key);

  if (!flag) {
    Sentry.captureMessage("feature-flags.unknown-key", {
      level: "warning",
      extra: { key },
    });
    return false;
  }

  return isFeatureEnabledForStaff(flag, staff);
}

/**
 * Every key this staff member has, as a set — one read for a whole page rather
 * than one per gated item. The navigation needs exactly this shape.
 */
export async function getEnabledFeatures(staff: FeatureStaff): Promise<string[]> {
  const flags = await readFlags();
  return flags.filter((flag) => isFeatureEnabledForStaff(flag, staff)).map((flag) => flag.key);
}

/**
 * For a server component or server action behind a flag. Answers 404 when the
 * feature is off — the surface should be invisible, not forbidden.
 */
export async function requireFeature(key: string): Promise<void> {
  const staff = await requireAuthenticatedStaff();
  const enabled = await isFeatureEnabled(key, { id: staff.id, role: staff.appRole });

  if (!enabled) {
    notFound();
  }
}
