import type { Metadata } from "next";

import { FlashNotice } from "@/ui/shell/flash-notice";
import { PageHeader } from "@/ui/shell/page-header";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { createAdminClient } from "@/platform/supabase/admin";
import { listFeatureFlags } from "@/platform/features/flags";
import { requireStaffPermission } from "@/platform/supabase/session";
import { staffRoles } from "@/platform/auth/roles";

import { updateFeatureFlag } from "./actions";

export const metadata: Metadata = {
  title: "Feature flags",
};

export const dynamic = "force-dynamic";

/**
 * Who can see what, and the screen where it is decided.
 *
 * This is the control room for the canary model: production runs one
 * deployment, `director@vpps.co.in` does the school's work in it, and
 * `raj@vpps.co.in` sees new School One surfaces first. A flag moves off → one
 * user id → roles → everyone, and every step is a click here rather than a
 * deploy, because the rollback for "this is not ready" must not be a git revert
 * while families are waiting at the counter.
 *
 * The controls render the SAVED state, not what was last typed, so what is on
 * screen is what the database says.
 */
export default async function FeatureFlagsPage() {
  await requireStaffPermission("settings:write", { onDenied: "redirect" });

  const [flags, staffList] = await Promise.all([
    listFeatureFlags(),
    createAdminClient()
      .from("users")
      .select("id, full_name, role, is_active")
      .order("full_name")
      .then(({ data }) => data ?? []),
  ]);

  return (
    <div className="space-y-6">
      <FlashNotice
        messages={Object.fromEntries(
          flags.map((flag) => [
            flag.key,
            { title: `${flag.key} saved`, description: "Who can see it has changed." },
          ]),
        )}
      />
      <PageHeader
        title="Feature flags"
        description="Who can see each School One surface. Changes take effect immediately, for everyone, without a deploy."
      />

      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feature flags are defined.</p>
      ) : null}

      <div className="space-y-6">
        {flags.map((flag) => (
          <form
            key={flag.key}
            action={updateFeatureFlag}
            className="space-y-4 rounded-lg border border-border bg-card p-4"
          >
            <input type="hidden" name="key" value={flag.key} />

            <div>
              <h2 className="font-mono text-sm font-semibold">{flag.key}</h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {flag.description}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabledForAll"
                defaultChecked={flag.enabled_for_all}
                className="h-4 w-4"
              />
              <span>
                On for everyone
                <span className="ml-2 text-xs text-muted-foreground">
                  overrides the two lists below
                </span>
              </span>
            </label>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Roles
              </legend>
              <div className="flex flex-wrap gap-3">
                {staffRoles.map((role) => (
                  <label key={role} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="enabledRoles"
                      value={role}
                      defaultChecked={flag.enabled_roles?.includes(role) ?? false}
                      className="h-4 w-4"
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Individual staff
              </legend>
              <div className="flex flex-col gap-1.5">
                {staffList.map((member) => (
                  <label key={member.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="enabledUserIds"
                      value={member.id}
                      defaultChecked={flag.enabled_user_ids?.includes(member.id) ?? false}
                      className="h-4 w-4"
                    />
                    <span>
                      {member.full_name ?? member.id}
                      <span className="ml-2 text-xs text-muted-foreground">{member.role}</span>
                      {member.is_active ? null : (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-4">
              <PendingSubmitButton>Save</PendingSubmitButton>
              <span className="text-xs text-muted-foreground">
                Last changed {new Date(flag.updated_at).toLocaleString("en-IN")}
              </span>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
