import {
  ActivitySquare,
  BadgeIndianRupee,
  BadgePercent,
  BarChart3,
  BookOpenCheck,
  BookText,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FolderCog,
  MessageCircle,
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
  /** Key under the `Navigation` namespace in messages/. Falls back to `label`. */
  i18nKey?: string;
};

export type ProtectedRouteMeta = {
  label: string;
  description: string;
  href: string | null;
};

export type MobileBottomNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Key under the `Navigation` namespace in messages/. Falls back to `label`. */
  i18nKey?: string;
};

const simpleNavigationItems: ProtectedNavigationItem[] = [
  {
    href: "/protected/dashboard",
    label: "Dashboard",
    description: "Today, pending, follow-up.",
    icon: BarChart3,
    requiredPermission: "dashboard:view",
    i18nKey: "dashboard",
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Add, search, update students.",
    icon: UsersRound,
    requiredPermission: "students:view",
    i18nKey: "students",
  },
  {
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Yearly fees and due dates.",
    icon: ScrollText,
    requiredPermission: "fees:view",
    aliases: ["/protected/fee-structure"],
    i18nKey: "feeSetup",
  },
  {
    href: "/protected/payments",
    label: "Payment Desk",
    description: "Collect and print receipts.",
    icon: BadgeIndianRupee,
    requiredPermission: "payments:view",
    aliases: ["/protected/collections"],
    i18nKey: "paymentDesk",
  },
  {
    href: "/protected/transactions",
    label: "Transactions",
    description: "Read-only finance records.",
    icon: BookOpenCheck,
    requiredPermission: "receipts:view",
    aliases: ["/protected/dues", "/protected/receipts", "/protected/ledger"],
    i18nKey: "transactions",
  },
  {
    href: "/protected/defaulters",
    label: "Defaulters",
    description: "Call and follow-up list.",
    icon: ClipboardList,
    requiredPermission: "defaulters:view",
    i18nKey: "defaulters",
  },
  {
    href: "/protected/exports",
    label: "Exports",
    description: "Excel files for office work.",
    icon: FileSpreadsheet,
    requiredPermission: "reports:view",
    i18nKey: "exports",
  },
  {
    href: "/protected/admin-tools",
    label: "Admin Tools",
    description: "Rare setup and fixes.",
    icon: FolderCog,
    requiredPermission: "finance:view",
    visibleTo: ["admin", "accountant"],
    i18nKey: "adminTools",
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
    description: "Today collection, pending dues, students, and follow-up.",
  },
  {
    match: "/protected/students",
    href: "/protected/students",
    label: "Students",
    description: "Add students, search records, bulk update, and review student fee exceptions.",
  },
  {
    match: "/protected/fee-setup",
    href: "/protected/fee-setup",
    label: "Fee Setup",
    description: "Set academic-year fees, installment dates, and transport defaults. Saving syncs dues automatically.",
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
    description: "Read-only receipts, dues, class register, and payment history.",
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
    description: "Download Excel files for student, dues, payment, and follow-up work.",
  },
  {
    match: "/protected/admin-tools/session-health",
    href: "/protected/admin-tools",
    label: "Session Health",
    description: "Review every academic session and reconcile missing dues.",
  },
  {
    match: "/protected/admin-tools/whatsapp-templates",
    href: "/protected/admin-tools",
    label: "WhatsApp templates",
    description: "Pre-canned message templates with placeholder variables for parent outreach.",
  },
  {
    match: "/protected/admin-tools/activity",
    href: "/protected/admin-tools",
    label: "Activity feed",
    description: "Recent staff actions across the workspace.",
  },
  {
    match: "/protected/admin-tools",
    href: "/protected/admin-tools",
    label: "Admin Tools",
    description: "Rare setup, staff access, corrections, and troubleshooting.",
  },
  {
    match: "/protected/master-data",
    href: "/protected/admin-tools",
    label: "School Lists",
    description: "Sessions, classes, and routes kept in one place for admin upkeep.",
  },
  {
    match: "/protected/finance-controls",
    href: "/protected/admin-tools",
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
    href: "/protected/admin-tools",
    label: "Import History",
    description: "Student spreadsheet upload history and review.",
  },
  {
    match: "/protected/staff",
    href: "/protected/admin-tools",
    label: "Staff",
    description: "Internal staff accounts, role access, and password resets.",
  },
  {
    match: "/protected/settings",
    href: "/protected/admin-tools",
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

  if (role === "teacher") {
    return "/protected/students";
  }

  if (role === "fee_collector") {
    return "/protected/defaulters";
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

    // Teacher and Fee Collector see every tab they have permission for.
    // Their workflow focus is set by the default landing route, not by
    // hiding nav items.
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
    "/protected/admin-tools",
  ];

  return [...visibleItems].sort((left, right) => {
    return preferredOrder.indexOf(left.href) - preferredOrder.indexOf(right.href);
  });
}

export function getMobileBottomNavigation(staffRole: StaffRole) {
  return getMobilePrimaryNavigation(staffRole);
}

export function getMobilePrimaryNavigation(staffRole: StaffRole) {
  if (staffRole === "fee_collector") {
    return [
      {
        href: "/protected/defaulters",
        label: "Defaulters",
        icon: ClipboardList,
        i18nKey: "defaulters",
      },
      {
        href: "/protected/students",
        label: "Students",
        icon: UsersRound,
        i18nKey: "students",
      },
    ] satisfies MobileBottomNavigationItem[];
  }

  const items: MobileBottomNavigationItem[] = [
    {
      href: "/protected/dashboard",
      label: "Home",
      icon: BarChart3,
      i18nKey: "home",
    },
    {
      href: "/protected/students",
      label: "Students",
      icon: UsersRound,
      i18nKey: "students",
    },
  ];

  if (hasRolePermission(staffRole, "payments:write")) {
    items.push({
      href: "/protected/payments",
      label: "Collect",
      icon: BadgeIndianRupee,
      i18nKey: "collect",
    });
  }

  if (hasRolePermission(staffRole, "receipts:view")) {
    items.push({
      href: "/protected/transactions",
      label: "Transactions",
      icon: BookOpenCheck,
      i18nKey: "transactions",
    });
  }

  if (staffRole === "teacher") {
    items.push({
      href: "/protected/defaulters",
      label: "Defaulters",
      icon: ClipboardList,
      i18nKey: "defaulters",
    });
  }

  return items;
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
    title: "Fees & Recovery",
    description: "Fee policy, custom discounts, and recovering old or left-student dues.",
    items: [
      {
        href: "/protected/fee-setup",
        label: "Fee Policy",
        description:
          "The canonical fee-policy editor: installment dates, class tuition, academic fees, and late fee.",
        icon: BookOpenCheck,
        requiredPermission: "fees:view",
      },
      {
        href: "/protected/fee-setup?section=discounts",
        label: "Custom Discounts",
        description:
          "Manage conventional discount policies. Built-ins (RTE, Staff Child, 3rd Child) are protected; add your own.",
        icon: BadgePercent,
        requiredPermission: "fees:view",
      },
      {
        href: "/protected/admin-tools/prev-year-dues",
        label: "Previous Year Dues",
        description:
          "Audit the carry-forward of unpaid prior-year tuition balances: matched, written-off, and applied rows, with reconciliation and rollback.",
        icon: BadgeIndianRupee,
        requiredPermission: "fees:view",
      },
      {
        href: "/protected/admin-tools/recovery",
        label: "Left Students With Dues",
        description:
          "Recovery queue for left / graduated / inactive students who still owe fees. Collect against existing dues via the guarded Payment Desk recovery mode.",
        icon: UsersRound,
        requiredPermission: "defaulters:view",
      },
      {
        href: "/protected/exports",
        label: "Exports",
        description: "Download XLSX/PDF reports: students, dues, defaulters, previous-year dues, left-student dues.",
        icon: Download,
        requiredPermission: "reports:view",
      },
    ],
  },
  {
    title: "Year & Sessions",
    description: "Move into the next academic year and clean up sessions made by mistake.",
    items: [
      {
        href: "/protected/admin-tools/promotion",
        label: "Transfer to Next Session",
        description:
          "Create next year by copying classes, fees, and discount policies, then promote students. Roll back or delete a session made by mistake.",
        icon: UsersRound,
        requiredPermission: "students:write",
      },
    ],
  },
  {
    title: "Money Controls",
    description: "Refunds, the automatic day close, and correction review.",
    items: [
      {
        href: "/protected/finance-controls",
        label: "Refunds",
        description: "Request, approve, and process refunds. Processing posts a reversal to the ledger.",
        icon: BadgeIndianRupee,
        requiredPermission: "finance:view",
      },
      {
        href: "/protected/finance-controls",
        label: "Day Close & Corrections",
        description: "Read the automatic day-close snapshot, day-book totals, and correction review.",
        icon: ClipboardList,
        requiredPermission: "finance:view",
      },
    ],
  },
  {
    title: "People & Access",
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
    title: "School Configuration",
    description: "School settings and the lists every module reads from.",
    items: [
      {
        href: "/protected/settings",
        label: "School Settings",
        description: "School identity, active fee policy summary, and system health in one place.",
        icon: Settings2,
        requiredPermission: "settings:view",
      },
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
    title: "History & Audit",
    description: "Read-only records of activity, imports, and outreach templates.",
    items: [
      {
        href: "/protected/admin-tools/activity",
        label: "Activity feed",
        description: "Recent payments, edits, follow-ups, and exports — for audit and review.",
        icon: ActivitySquare,
        requiredPermission: "settings:view",
      },
      {
        href: "/protected/imports",
        label: "Import History",
        description: "Review spreadsheet uploads, row results, and saved batches.",
        icon: FileSpreadsheet,
        requiredPermission: "imports:view",
      },
      {
        href: "/protected/admin-tools/whatsapp-templates",
        label: "WhatsApp templates",
        description: "Manage message templates with placeholders used in bulk WhatsApp drafts.",
        icon: MessageCircle,
        requiredPermission: "settings:view",
      },
    ],
  },
] as const;
