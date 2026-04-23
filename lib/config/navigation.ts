import {
  BadgeIndianRupee,
  BookOpenCheck,
  BookText,
  CircleAlert,
  ClipboardList,
  FolderCog,
  ListChecks,
  ReceiptText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  hasRolePermission,
  type StaffPermission,
  type StaffRole,
} from "@/lib/auth/roles";

export type ProtectedNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiredPermission: StaffPermission;
  visibleTo?: readonly StaffRole[];
  aliases?: readonly string[];
};

export type ProtectedRouteMeta = {
  label: string;
  description: string;
  href: string | null;
};

const simpleNavigationItems: ProtectedNavigationItem[] = [
  {
    href: "/protected/students",
    label: "Students",
    description: "Student master, class-wise cleanup, and one-student workspace.",
    icon: UsersRound,
    requiredPermission: "students:view",
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Live fee rules, defaults, overrides, and dues updates.",
    icon: ScrollText,
    requiredPermission: "fees:view",
    aliases: ["/protected/fee-structure"],
  },
  {
    href: "/protected/payments",
    label: "Payment Desk",
    description: "Counter entry, receipt generation, and daily collection shortcuts.",
    icon: BadgeIndianRupee,
    requiredPermission: "payments:view",
    aliases: ["/protected/collections"],
  },
  {
    href: "/protected/dues",
    label: "Dues & Receipts",
    description: "Workbook-style dues, receipts, overdue follow-up, and import issues.",
    icon: BookOpenCheck,
    requiredPermission: "receipts:view",
  },
  {
    href: "/protected/advanced",
    label: "Advanced",
    description: "School setup, day close, exports, staff, and settings.",
    icon: FolderCog,
    requiredPermission: "finance:view",
    visibleTo: ["admin", "accountant"],
  },
] as const;

const routeMetaItems: Array<
  ProtectedRouteMeta & {
    match: string;
    aliases?: readonly string[];
  }
> = [
  {
    match: "/protected",
    href: null,
    label: "Workspace",
    description: "Protected workspace routing entry point.",
  },
  {
    match: "/protected/students",
    href: "/protected/students",
    label: "Students",
    description: "Student master, class-wise cleanup, and one-student workspace.",
  },
  {
    match: "/protected/fee-setup",
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Live fee rules, defaults, overrides, and dues updates.",
    aliases: ["/protected/fee-structure", "/protected/fee-setup/generate"],
  },
  {
    match: "/protected/payments",
    href: "/protected/payments",
    label: "Payment Desk",
    description: "Counter posting, receipt printing, and fast daily collection work.",
    aliases: ["/protected/collections"],
  },
  {
    match: "/protected/dues",
    href: "/protected/dues",
    label: "Dues & Receipts",
    description: "Workbook-style tables for dues, receipts, overdue follow-up, and import issues.",
  },
  {
    match: "/protected/advanced",
    href: "/protected/advanced",
    label: "Advanced",
    description: "School setup, day close, exports, staff, and settings.",
  },
  {
    match: "/protected/setup",
    href: "/protected/advanced",
    label: "Setup",
    description: "First-time go-live preparation, readiness, and completion review.",
  },
  {
    match: "/protected/master-data",
    href: "/protected/advanced",
    label: "School Setup Lists",
    description: "Sessions, classes, and routes kept in one place for admin upkeep.",
  },
  {
    match: "/protected/finance-controls",
    href: "/protected/advanced",
    label: "Day Close & Corrections",
    description: "Day close, refunds, correction review, and finance-office controls.",
  },
  {
    match: "/protected/reports",
    href: "/protected/advanced",
    label: "Reports & Exports",
    description: "Advanced reports, print views, and CSV exports.",
  },
  {
    match: "/protected/ledger",
    href: "/protected/dues",
    label: "Ledger",
    description: "Append-only student payment history and adjustment review.",
  },
  {
    match: "/protected/receipts",
    href: "/protected/dues",
    label: "Receipts",
    description: "Receipt lookup, reprints, and desk verification.",
  },
  {
    match: "/protected/defaulters",
    href: "/protected/dues",
    label: "Defaulters",
    description: "Outstanding follow-up by class, route, and overdue window.",
  },
  {
    match: "/protected/imports",
    href: "/protected/dues",
    label: "Import Issues",
    description: "Workbook import review, row issues, and anomaly follow-up.",
  },
  {
    match: "/protected/staff",
    href: "/protected/advanced",
    label: "Staff",
    description: "Internal staff accounts, role access, and password resets.",
  },
  {
    match: "/protected/settings",
    href: "/protected/advanced",
    label: "Settings",
    description: "Deployment checks, active policy notes, and config audit history.",
  },
  {
    match: "/protected/password",
    href: null,
    label: "Change Password",
    description: "Update the password for the current internal staff account.",
  },
  {
    match: "/protected/access-denied",
    href: null,
    label: "Access Denied",
    description: "This action is blocked for the current staff role.",
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
    simpleNavigationItems.find((item) =>
      [item.href, ...(item.aliases ?? [])].some((href) => matchesRoute(pathname, href)),
    ) ?? null
  );
}

export function getDefaultProtectedHref(role: StaffRole) {
  return role === "accountant" ? "/protected/payments" : "/protected/fee-setup";
}

export function getVisibleProtectedNavigation(staffRole: StaffRole) {
  const visibleItems = simpleNavigationItems.filter((item) => {
    if (!hasRolePermission(staffRole, item.requiredPermission)) {
      return false;
    }

    if (item.visibleTo && !item.visibleTo.includes(staffRole)) {
      return false;
    }

    return true;
  });

  if (staffRole !== "accountant") {
    return visibleItems;
  }

  const preferredOrder = [
    "/protected/payments",
    "/protected/dues",
    "/protected/fee-setup",
    "/protected/students",
    "/protected/advanced",
  ];

  return [...visibleItems].sort((left, right) => {
    return preferredOrder.indexOf(left.href) - preferredOrder.indexOf(right.href);
  });
}

export function getProtectedRouteMeta(pathname: string): ProtectedRouteMeta {
  const item = routeMetaItems.find((meta) =>
    [meta.match, ...(meta.aliases ?? [])].some((href) => matchesRoute(pathname, href)),
  );

  return (
    item ?? {
      href: null,
      label: "Workspace",
      description: "Internal staff workspace for fee office operations.",
    }
  );
}

export type AdvancedHubItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiredPermission: StaffPermission;
};

export const advancedHubItems: AdvancedHubItem[] = [
  {
    href: "/protected/setup",
    label: "Setup",
    description: "First-time go-live preparation, readiness, and completion review.",
    icon: ListChecks,
    requiredPermission: "settings:write",
  },
  {
    href: "/protected/master-data",
    label: "School Setup Lists",
    description: "Sessions, classes, routes, and other school setup lists in one place.",
    icon: BookText,
    requiredPermission: "settings:write",
  },
  {
    href: "/protected/finance-controls",
    label: "Day Close & Corrections",
    description: "Day-book review, refunds, correction review, and close controls.",
    icon: ClipboardList,
    requiredPermission: "finance:view",
  },
  {
    href: "/protected/reports",
    label: "Reports & Exports",
    description: "Advanced reports, exports, and print-friendly views.",
    icon: ReceiptText,
    requiredPermission: "reports:view",
  },
  {
    href: "/protected/staff",
    label: "Staff",
    description: "Staff accounts, role assignment, and password management.",
    icon: ShieldCheck,
    requiredPermission: "staff:manage",
  },
  {
    href: "/protected/settings",
    label: "Settings",
    description: "Deployment checks, policy notes, and config audit history.",
    icon: Settings2,
    requiredPermission: "settings:view",
  },
  {
    href: "/protected/ledger",
    label: "Ledger",
    description: "Append-only student ledger and adjustment review.",
    icon: BookText,
    requiredPermission: "ledger:view",
  },
  {
    href: "/protected/receipts",
    label: "Receipts",
    description: "Receipt lookup, reprints, and formal printable copies.",
    icon: ReceiptText,
    requiredPermission: "receipts:view",
  },
  {
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Outstanding follow-up by class and route.",
    icon: CircleAlert,
    requiredPermission: "defaulters:view",
  },
  {
    href: "/protected/imports",
    label: "Imports",
    description: "Workbook import review, validation, and issue queues.",
    icon: UsersRound,
    requiredPermission: "imports:view",
  },
] as const;
