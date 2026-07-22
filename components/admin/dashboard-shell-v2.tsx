import { ReactNode } from "react";

import { type StaffRole } from "@/lib/auth/roles";

import { DashboardShell } from "./dashboard-shell";

/**
 * SHELL_V2 wrapper — kept for the isShellV2Enabled() flag plumbing.
 *
 * The "Ledger Calm 2.0" redesign folded the V1/V2 split back into a single
 * shell (components/admin/dashboard-shell.tsx): ink sidebar, grouped nav,
 * "Day so far" footer card. Both flag states now render the same shell so
 * flipping SHELL_V2 no longer changes the visual chrome.
 */

type DashboardShellV2Props = {
  children: ReactNode;
  staffEmail: string;
  staffRole: StaffRole;
  viewSessionLabel: string;
  viewSessionIsTest: boolean;
};

export async function DashboardShellV2(props: DashboardShellV2Props) {
  return <DashboardShell {...props} />;
}
