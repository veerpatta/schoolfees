import {
  BadgeIndianRupee,
  BookText,
  CircleAlert,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { hasRolePermission, type StaffPermission, type StaffRole } from "@/lib/auth/roles";

export type ProtectedNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiredPermission: StaffPermission;
  aliases?: readonly string[];
};

export const protectedNavigation: ProtectedNavigationItem[] = [
  {
    href: "/protected",
    label: "Dashboard",
    description: "Daily overview of collections, dues, and staff activity.",
    icon: LayoutDashboard,
    requiredPermission: "dashboard:view",
  },
  {
    href: "/protected/setup",
    label: "Setup",
    description: "First-time session setup, go-live checks, and collection readiness.",
    icon: ListChecks,
    requiredPermission: "settings:write",
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Student master records and enrollment status.",
    icon: UsersRound,
    requiredPermission: "students:view",
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Class-wise fee plans, due dates, and defaults.",
    icon: ScrollText,
    requiredPermission: "fees:view",
    aliases: ["/protected/fee-structure"],
  },
  {
    href: "/protected/payments",
    label: "Payments",
    description: "Counter entry, payment modes, and daily posting.",
    icon: BadgeIndianRupee,
    requiredPermission: "payments:view",
    aliases: ["/protected/collections"],
  },
  {
    href: "/protected/ledger",
    label: "Ledger",
    description: "Student-wise balances, history, and adjustments.",
    icon: BookText,
    requiredPermission: "ledger:view",
  },
  {
    href: "/protected/receipts",
    label: "Receipts",
    description: "Receipt printing, reprints, and reference checks.",
    icon: ReceiptText,
    requiredPermission: "receipts:view",
  },
  {
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Outstanding follow-up by class and due window.",
    icon: CircleAlert,
    requiredPermission: "defaulters:view",
  },
  {
    href: "/protected/staff",
    label: "Staff",
    description: "Internal staff accounts, roles, resets, and access control.",
    icon: ShieldCheck,
    requiredPermission: "staff:manage",
  },
  {
    href: "/protected/settings",
    label: "Settings",
    description: "Staff roles, policy defaults, and app configuration.",
    icon: Settings2,
    requiredPermission: "settings:view",
  },
] as const;

export type ProtectedRouteMeta = {
  label: string;
  description: string;
  href: string | null;
};

const protectedSecondaryPages: ProtectedRouteMeta[] = [
  {
    href: "/protected/password",
    label: "Change Password",
    description: "Update the password for the current internal staff account.",
  },
  {
    href: "/protected/imports",
    label: "Imports",
    description: "Workbook migration and validation checkpoints.",
  },
  {
    href: "/protected/reports",
    label: "Reports",
    description: "Legacy reporting hub while dedicated pages are scaffolded.",
  },
] as const;

function matchesRoute(pathname: string, href: string) {
  if (href === "/protected") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getProtectedNavigationItem(pathname: string) {
  return (
    protectedNavigation.find((item) =>
      [item.href, ...(item.aliases ?? [])].some((href) =>
        matchesRoute(pathname, href),
      ),
    ) ?? null
  );
}

export function getVisibleProtectedNavigation(staffRole: StaffRole) {
  return protectedNavigation.filter((item) =>
    hasRolePermission(staffRole, item.requiredPermission),
  );
}

export function getProtectedRouteMeta(pathname: string): ProtectedRouteMeta {
  const navigationItem = getProtectedNavigationItem(pathname);

  if (navigationItem) {
    return {
      label: navigationItem.label,
      description: navigationItem.description,
      href: navigationItem.href,
    };
  }

  const secondaryPage =
    protectedSecondaryPages.find((item) => matchesRoute(pathname, item.href!)) ??
    null;

  return (
    secondaryPage ?? {
      href: null,
      label: "Workspace",
      description: "Internal staff workspace for fee operations.",
    }
  );
}
