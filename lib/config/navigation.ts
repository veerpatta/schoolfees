import {
  BadgeIndianRupee,
  BookText,
  CircleAlert,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type ProtectedNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  aliases?: readonly string[];
};

export const protectedNavigation: ProtectedNavigationItem[] = [
  {
    href: "/protected",
    label: "Dashboard",
    description: "Daily overview of collections, dues, and staff activity.",
    icon: LayoutDashboard,
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Student master records and enrollment status.",
    icon: UsersRound,
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Class-wise fee plans, due dates, and defaults.",
    icon: ScrollText,
    aliases: ["/protected/fee-structure"],
  },
  {
    href: "/protected/payments",
    label: "Payments",
    description: "Counter entry, payment modes, and daily posting.",
    icon: BadgeIndianRupee,
    aliases: ["/protected/collections"],
  },
  {
    href: "/protected/ledger",
    label: "Ledger",
    description: "Student-wise balances, history, and adjustments.",
    icon: BookText,
  },
  {
    href: "/protected/receipts",
    label: "Receipts",
    description: "Receipt printing, reprints, and reference checks.",
    icon: ReceiptText,
  },
  {
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Outstanding follow-up by class and due window.",
    icon: CircleAlert,
  },
  {
    href: "/protected/settings",
    label: "Settings",
    description: "Staff roles, policy defaults, and app configuration.",
    icon: Settings2,
  },
] as const;

export type ProtectedRouteMeta = {
  label: string;
  description: string;
  href: string | null;
};

const protectedSecondaryPages: ProtectedRouteMeta[] = [
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
