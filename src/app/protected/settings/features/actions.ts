"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { FEATURE_FLAGS_TAG } from "@/platform/features/flags";
import { createClient } from "@/platform/supabase/server";
import { requireStaffPermission } from "@/platform/supabase/session";
import { staffRoles, type StaffRole } from "@/platform/auth/roles";

/**
 * Turning a flag on or off.
 *
 * Deliberately the **user-JWT** client, not the service role: `feature_flags`
 * carries RLS policies that gate writes on `has_permission('settings:write')`,
 * and those are only enforced for a real session. `requireStaffPermission`
 * above is the first line and the policy is the second; using the admin client
 * here would quietly discard the second one.
 *
 * The row records `updated_by` and `updated_at`, which is the audit trail for
 * flags — `/protected/settings` has no existing write path to copy, and there
 * is no DELETE policy, so the history of who could see what is not erasable.
 */
export async function updateFeatureFlag(formData: FormData): Promise<void> {
  const staff = await requireStaffPermission("settings:write");

  const key = String(formData.get("key") ?? "").trim();

  if (!key) {
    throw new Error("No flag was named.");
  }

  const enabledForAll = formData.get("enabledForAll") === "on";

  const roles = formData
    .getAll("enabledRoles")
    .map((value) => String(value))
    .filter((value): value is StaffRole => (staffRoles as readonly string[]).includes(value));

  const userIds = formData
    .getAll("enabledUserIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const supabase = await createClient();

  const { error } = await supabase
    .from("feature_flags")
    .update({
      enabled_for_all: enabledForAll,
      enabled_roles: roles,
      enabled_user_ids: userIds,
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);

  if (error) {
    // Thrown rather than returned: the controls below render the SAVED state,
    // so a silent failure would leave the screen showing what the operator
    // typed as though it had been stored. For a flag, that is the difference
    // between believing the office cannot see something and knowing it.
    throw new Error(`Could not update ${key}: ${error.message}`);
  }

  // Turning a flag OFF is the emergency direction — it is how a half-ready
  // screen is taken away from the office — so it must not wait out the 60
  // second cache.
  revalidateTag(FEATURE_FLAGS_TAG, "max");
  revalidatePath("/protected", "layout");

  // Redirect-then-flash, the house pattern for an action with no
  // useActionState behind it. Without it the page re-renders identically and
  // the operator cannot tell a save from a no-op — which, for a control that
  // decides whether the office can see something, is not a small ambiguity.
  redirect(`/protected/settings/features?done=${encodeURIComponent(key)}`);
}
