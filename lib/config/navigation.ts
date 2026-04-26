import {
  BadgeIndianRupee,
  BarChart3,
  BookOpenCheck,
  BookText,
  ClipboardList,
  FileSpreadsheet,
  FolderCog,
  ListChecks,
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
    href: "/protected/dashboard",
    label: "Dashboard",
    description: "Today collection, dues, students, and follow-up.",
    icon: BarChart3,
    requiredPermission: "dashboard:view",
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Student register and fee exceptions.",
    icon: UsersRound,
    requiredPermission: "students:view",
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Academic year fees and installment dates.",
    icon: ScrollText,
    requiredPermission: "fees:view",
    aliases: ["/protected/fee-structure"],
  },
  {
    href: "/protected/payments",
    label: "Payment Desk",
    description: "Collect payments and print receipts.",
    icon: BadgeIndianRupee,
    requiredPermission: "payments:view",
    aliases: ["/protected/collections"],
  },
  {
    href: "/protected/transactions",
    label: "Transactions",
    description: "Receipts, dues, and payment history.",
    icon: BookOpenCheck,
    requiredPermission: "receipts:view",
    aliases: ["/protected/dues", "/protected/receipts", "/protected/ledger"],
  },
  {
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Daily fee follow-up list.",
    icon: ClipboardList,
    requiredPermission: "defaulters:view",
  },
  {
    href: "/protected/exports",
    label: "Exports",
    description: "Excel downloads for office records.",
    icon: FileSpreadsheet,
    requiredPermission: "reports:view",
  },
  {
    href: "/protected/advanced",
    label: "Admin Tools",
    description: "Setup, corrections, and system checks.",
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
    match: "/protected/dashboard",
    href: "/protected/dashboard",
    label: "Dashboard",
    description: "Fee collection overview for the current academic session.",
  },
  {
    match: "/protected/students",
    href: "/protected/students",
    label: "Students",
    description: "Student master, fee profiles, imports, and one-student workspace.",
  },
  {
    match: "/protected/fee-setup",
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Academic year fees and installment dates.",
    aliases: ["/protected/fee-structure", "/protected/fee-setup/generate"],
  },
  {
    match: "/protected/payments",
    href: "/protected/payments",
    label: "Payment Desk",
    description: "Collect payments and print receipts.",
    aliases: ["/protected/collections"],
  },
  {
    match: "/protected/transactions",
    href: "/protected/transactions",
    label: "Transactions",
    description: "Financial activity, receipts, dues, and payment history.",
    aliases: ["/protected/dues", "/protected/receipts", "/protected/ledger"],
  },
  {
    match: "/protected/defaulters",
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Outstanding follow-up by class, route, and overdue window.",
  },
  {
    match: "/protected/exports",
    href: "/protected/exports",
    label: "Exports",
    description: "Excel downloads for students, dues, payments, and admin review.",
  },
  {
    match: "/protected/advanced",
    href: "/protected/advanced",
    label: "Admin Tools",
    description: "Rare setup, staff, correction, and troubleshooting tools.",
  },
  {
    match: "/protected/setup",
    href: "/protected/advanced",
    label: "First-time Setup",
    description: "First-time go-live preparation, readiness, and completion review.",
  },
  {
    match: "/protected/master-data",
    href: "/protected/advanced",
    label: "School Lists",
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
    href: "/protected/transactions",
    label: "Reports & Exports",
    description: "Detailed reports, print views, and CSV exports.",
  },
  {
    match: "/protected/ledger",
    href: "/protected/transactions",
    label: "Ledger",
    description: "Append-only student payment history and adjustment review.",
  },
  {
    match: "/protected/receipts",
    href: "/protected/transactions",
    label: "Receipts",
    description: "Receipt lookup, reprints, and desk verification.",
  },
  {
    match: "/protected/imports",
    href: "/protected/advanced",
    label: "Import History",
    description: "Student spreadsheet upload history and review.",
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
    label: "App Settings",
    description: "School settings, system checks, and change history.",
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
  if (role === "accountant") {
    return "/protected/payments";
  }

  return "/protected/dashboard";
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
    "/protected/dashboard",
    "/protected/transactions",
    "/protected/defaulters",
    "/protected/exports",
    "/protected/fee-setup",
    "/protected/students",
    "/protected/advanced",
  ];

  return [...visibleItems].sort((left, right) => {
    return preferredOrder.indexOf(left.href) - preferredOrder.indexOf(right.href);
  });
}

const mobilePrimaryOrder = [
  "/protected/dashboard",
  "/protected/students",
  "/protected/payments",
  "/protected/defaulters",
] as const;

export function getMobilePrimaryNavigation(staffRole: StaffRole) {
  const visibleItems = getVisibleProtectedNavigation(staffRole);
  return mobilePrimaryOrder
    .map((href) => visibleItems.find((item) => item.href === href))
    .filter((item): item is ProtectedNavigationItem => Boolean(item));
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

export type AdvancedHubSection = {
  title: string;
  description: string;
  items: readonly AdvancedHubItem[];
};

export const advancedHubSections: readonly AdvancedHubSection[] = [
  {
    title: "Staff & Permissions",
    description: "Internal staff accounts, roles, and password controls.",
    items: [
      {
        href: "/protected/staff",
        label: "Staff",
        description: "Create internal staff accounts, assign roles, and reset passwords.",
        icon: ShieldCheck,
        requiredPermission: "staff:manage",
      },
    ],
  },
  {
    title: "School Settings",
    description: "School settings and system checks.",
    items: [
      {
        href: "/protected/settings",
        label: "App Settings",
        description: "School settings, system checks, and change history.",
        icon: Settings2,
        requiredPermission: "settings:view",
      },
    ],
  },
  {
    title: "School Lists",
    description: "Sessions, classes, routes, and payment lists.",
    items: [
      {
        href: "/protected/master-data",
        label: "School Lists",
        description: "Maintain sessions, classes, routes, fee heads, and payment modes.",
        icon: BookText,
        requiredPermission: "settings:write",
      },
    ],
  },
  {
    title: "Corrections & Day Close",
    description: "Finance-office review, refunds, and close controls.",
    items: [
      {
        href: "/protected/finance-controls",
        label: "Day Close & Corrections",
        description: "Review day-book totals, refund work, correction review, and close controls.",
        icon: ClipboardList,
        requiredPermission: "finance:view",
      },
    ],
  },
  {
    title: "Import History",
    description: "Spreadsheet upload history and row review.",
    items: [
      {
        href: "/protected/imports",
        label: "Import History",
        description: "Review spreadsheet uploads, row results, and saved batches.",
        icon: UsersRound,
        requiredPermission: "imports:view",
      },
    ],
  },
  {
    title: "Fee Data Troubleshooting",
    description: "Prepare missing dues and fix fee records when daily pages need attention.",
    items: [
      {
        href: "/protected/advanced#fee-data-troubleshooting",
        label: "Fee Data Troubleshooting",
        description: "Prepare missing dues, update fee records, and fix Payment Desk dues.",
        icon: FolderCog,
        requiredPermission: "fees:write",
      },
    ],
  },
  {
    title: "System Readiness",
    description: "First-time go-live preparation and completion review.",
    items: [
      {
        href: "/protected/setup",
        label: "First-time Setup",
        description: "Prepare the school for go-live, confirm readiness, and complete setup once.",
        icon: ListChecks,
        requiredPermission: "settings:write",
      },
    ],
  },
] as const;
