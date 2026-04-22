import {
  BadgeIndianRupee,
  BookOpenCheck,
  BookText,
  CircleAlert,
  ClipboardList,
  FolderCog,
  LayoutDashboard,
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
    href: "/protected",
    label: "Start Here",
    description: "Today’s work, blockers, and the next safe office step.",
    icon: LayoutDashboard,
    requiredPermission: "dashboard:view",
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Student master, class-wise cleanup, and one-student workspace.",
    icon: UsersRound,
    requiredPermission: "students:view",
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Structure",
    description: "Policy-driven defaults, overrides, and due recalculation.",
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
    description: "Workbook-style dues, transactions, receipts, and import issues.",
    icon: BookOpenCheck,
    requiredPermission: "receipts:view",
  },
  {
    href: "/protected/advanced",
    label: "Advanced",
    description: "Setup, day close, exports, staff, and settings.",
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
    href: "/protected",
    label: "Start Here",
    description: "Today’s work, blockers, and the next safe office step.",
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
    label: "Fee Structure",
    description: "Policy-driven defaults, overrides, and due recalculation.",
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
    description: "Workbook-style tables for dues, transactions, receipts, and import issues.",
  },
  {
    match: "/protected/advanced",
    href: "/protected/advanced",
    label: "Advanced",
    description: "Setup, day close, exports, staff, and settings.",
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
    description: "Sessions, classes, and routes kept in one admin source of truth.",
  },
  {
    match: "/protected/finance-controls",
    href: "/protected/advanced",
    label: "Day Close & Refunds",
    description: "Day close, refund review, corrections, and finance-office controls.",
  },
  {
    match: "/protected/reports",
    href: "/protected/advanced",
    label: "Export & Print",
    description: "Advanced reports, print views, and CSV export tools.",
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
  return role === "accountant" ? "/protected/payments" : "/protected";
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
    "/protected/students",
    "/protected/fee-setup",
    "/protected",
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
    description: "Sessions, classes, routes, fee-head reference, and payment modes reference.",
    icon: BookText,
    requiredPermission: "settings:write",
  },
  {
    href: "/protected/finance-controls",
    label: "Day Close & Refunds",
    description: "Day-book review, refund workflow, cashier totals, and close controls.",
    icon: ClipboardList,
    requiredPermission: "finance:view",
  },
  {
    href: "/protected/reports",
    label: "Export & Print",
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

