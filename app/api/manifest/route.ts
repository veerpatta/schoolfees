import { NextResponse } from "next/server";

import { hasRolePermission, type StaffRole } from "@/lib/auth/roles";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getAuthenticatedStaff } from "@/lib/supabase/session";

type ManifestShortcut = {
  name: string;
  short_name?: string;
  description?: string;
  url: string;
};

function shortcutsForRole(role: StaffRole): ManifestShortcut[] {
  const shortcuts: ManifestShortcut[] = [];

  if (hasRolePermission(role, "payments:write")) {
    shortcuts.push({
      name: "Payment Desk",
      short_name: "Desk",
      description: "Collect a fee payment.",
      url: "/protected/payments",
    });
  }

  shortcuts.push(
    {
      name: "Today's Receipts",
      short_name: "Receipts",
      description: "Review receipt history.",
      url: "/protected/transactions",
    },
    {
      name: "Defaulters",
      short_name: "Dues",
      description: "Open the follow-up list.",
      url: "/protected/defaulters",
    },
  );

  return shortcuts;
}

export async function GET() {
  const staff = await getAuthenticatedStaff();
  const role = staff?.appRole ?? "view_only";

  return NextResponse.json(
    {
      name: "Shri Veer Patta School Fee Admin",
      short_name: "VPPS Fee",
      // A stable install identity. start_url moves per role (below), and
      // without an explicit id Chrome derives the identity from start_url --
      // so an accountant and a teacher would read as two different apps, and
      // a role change would orphan the installed one.
      id: "/protected",
      scope: "/",
      // Land on the role's real home rather than on `/protected`, which only
      // exists to `redirect()` there from a Server Component. Every PWA launch
      // used to traverse that redirect, and the App Router crashed part-way
      // through it often enough to be the top production error (SCHOOLFEES-8:
      // "Rendered more hooks than during the previous render", thrown inside
      // Next's own Router while the pending navigation state was resolving).
      // Skipping the hop removes the trigger on the launch path.
      start_url: getDefaultProtectedHref(role),
      display: "standalone",
      display_override: ["standalone", "minimal-ui"],
      orientation: "any",
      categories: ["business", "education"],
      // focus-existing, not navigate-existing: tapping the icon while a window
      // is already open brings it forward and leaves it where it is. A cashier
      // half-way through entering an amount must not have the form navigated
      // out from under them because someone tapped the icon on the taskbar.
      launch_handler: { client_mode: "focus-existing" },
      background_color: "#faf9f6",
      theme_color: "#c0521a",
      description: "Internal fee management workspace for VPPS office/accounts staff.",
      icons: [
        {
          src: "/branding/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/branding/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/branding/veer-patta-school-logo.jpg",
          sizes: "512x512",
          type: "image/jpeg",
          purpose: "any",
        },
      ],
      shortcuts: shortcutsForRole(role),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
