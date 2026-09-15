import type { Metadata } from "next";

import { PageHeader } from "@/ui/shell/page-header";
import { requireFeature } from "@/platform/features/flags";
import { requireStaffPermission } from "@/platform/supabase/session";

export const metadata: Metadata = {
  title: "School One",
};

/**
 * The placeholder the canary model is proved on.
 *
 * It deliberately does nothing. Its whole job is to be a real route, gated on a
 * real flag, so that "only my user id can see this" is something that has been
 * demonstrated in production against real data before any module the school
 * depends on is gated the same way.
 *
 * `requireFeature` answers 404 rather than 403: a feature the office is not
 * meant to have yet should be invisible, not forbidden.
 */
export default async function SchoolOnePage() {
  // Both, in this order, and they answer different questions. The permission
  // decides whether this person may use the surface at all; the flag decides
  // whether it exists for them yet. A flag is a rollout control and must never
  // be the only thing standing between a user and a page — turn one on for
  // everyone by mistake and permission is what is still there.
  await requireStaffPermission("dashboard:view", { onDenied: "redirect" });
  await requireFeature("school_one_placeholder");

  return (
    <div className="space-y-6">
      <PageHeader
        title="School One"
        description="Staff, academics, timetable, attendance and reports will appear here as they ship."
      />
      <p className="max-w-prose text-sm text-muted-foreground">
        Nothing to do here yet. This page exists so the feature-flag model can be
        checked end to end: it is visible only to the staff accounts the
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">school_one_placeholder</code>
        flag names, and returns 404 to everyone else.
      </p>
    </div>
  );
}
