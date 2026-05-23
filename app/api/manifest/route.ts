import { NextResponse } from "next/server";

import { hasRolePermission, type StaffRole } from "@/lib/auth/roles";
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
  const role = staff?.appRole ?? "read_only_staff";

  return NextResponse.json(
    {
      name: "Shri Veer Patta School Fee Admin",
      short_name: "VPPS Fee",
      start_url: "/protected",
      display: "standalone",
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
