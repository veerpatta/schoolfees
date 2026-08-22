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
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  hasRolePermission,
  type StaffPermission,
  type StaffRole,
} from "@/platform/auth/roles";

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
    href: "/protected/reminders",
    label: "Reminders",
    description: "WhatsApp fee reminders and campaigns.",
    icon: Send,
    requiredPermission: "settings:view",
    visibleTo: ["admin", "accountant"],
    aliases: ["/protected/admin-tools/whatsapp-reminders"],
    i18nKey: "reminders",
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
    match: "/protected/reminders",
    href: "/protected/reminders",
    label: "Reminders",
    description: "Send the approved WhatsApp reminder to selected families with pending dues.",
  },
  {
    // The legacy path still redirects, so it still needs to resolve to a tab.
    match: "/protected/admin-tools/whatsapp-reminders",
    href: "/protected/reminders",
    label: "Reminders",
    description: "Moved out of Admin Tools on 22 Aug 2026. Redirects, keeping the query.",
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
    "/protected/reminders",
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

/**
 * Sidebar grouping (Ledger Calm 2.0): the four screens office staff live in
 * every day sit on top; everything else files under "Records".
 */
const dailyNavHrefs: readonly string[] = [
  "/protected/dashboard",
  "/protected/payments",
  "/protected/defaulters",
  "/protected/reminders",
  "/protected/students",
];

export type ProtectedNavigationGroup = {
  key: "daily" | "records";
  /** Key under the `Navigation` namespace in messages/. */
  i18nKey: "groupDaily" | "groupRecords";
  label: string;
  items: ProtectedNavigationItem[];
};

export function getGroupedProtectedNavigation(
  staffRole: StaffRole,
): ProtectedNavigationGroup[] {
  const visible = getVisibleProtectedNavigation(staffRole);
  const daily = visible.filter((item) => dailyNavHrefs.includes(item.href));
  const records = visible.filter((item) => !dailyNavHrefs.includes(item.href));

  return [
    { key: "daily", i18nKey: "groupDaily", label: "Daily", items: daily },
    { key: "records", i18nKey: "groupRecords", label: "Records", items: records },
  ].filter((group) => group.items.length > 0) as ProtectedNavigationGroup[];
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

  // Mobile app v2 slot order: Home · Students · Collect (centre saffron pill)
  // · Receipts · More. Collect sits in the middle slot because it is the
  // thumb's home position and the one action the app exists for.
  //
  // Receipts took the fourth slot from Defaulters ("Calls") in 2026-08: taking
  // money and then checking what came in is the daily loop, while chasing a
  // defaulter is a periodic job. Defaulters moved to More, where it keeps its
  // overdue count via the More badge. `fee_collector` is untouched above —
  // chasing IS that role's job.
  //
  // The href is `/protected/transactions`, the day book, NOT
  // `/protected/receipts`. The latter is a takeover route
  // (`mobileTakeoverRoutes` below) and `MobileBottomNav` renders nothing on a
  // takeover, so a tab pointing there would hide the very bar it lives in.
  // Receipt lookup stays in More as "Find a receipt".
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
      label: "Receipts",
      icon: BookOpenCheck,
      i18nKey: "receipts",
    });
  }

  // No `items.length < 4` fallback any more. It existed to backfill a fourth
  // slot when Calls was absent, and with Receipts unconditional it would only
  // ever double-add the same href.
  return items;
}

/* ------------------------------------------------------------------------ *
 * Mobile "More" hub
 *
 * The phone app keeps four daily jobs on the bottom bar; everything else —
 * including modules that never made it into the desktop sidebar (receipts
 * lookup, imports, staff, master data, finance controls, settings) — files
 * under More, grouped the way the office thinks about them rather than the
 * way the routes are laid out.
 * ------------------------------------------------------------------------ */

export type MobileMoreItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiredPermission: StaffPermission;
  /**
   * Key under the `MobileApp` namespace in messages/. `<key>Desc` carries the
   * description. Falls back to the English `label` / `description` above.
   */
  i18nKey?: string;
};

export type MobileMoreGroup = {
  key: "daily" | "records" | "admin" | "system";
  label: string;
  /** Key under the `MobileApp` namespace in messages/. Falls back to `label`. */
  i18nKey: "groupDaily" | "groupRecords" | "groupAdmin" | "groupSystem";
  items: MobileMoreItem[];
};

const mobileMoreGroups: readonly MobileMoreGroup[] = [
  {
    key: "daily",
    i18nKey: "groupDaily",
    label: "Daily",
    items: [
      // Defaulters lives here since Receipts took its slot in the bar. First in
      // the group on purpose: it is the one item here with work attached to it,
      // and the More button carries its overdue count so the number is not lost
      // by the move.
      {
        href: "/protected/defaulters",
        label: "Follow-up calls",
        description: "Who to ring, in order",
        icon: ClipboardList,
        requiredPermission: "defaulters:view",
        i18nKey: "moreDefaulters",
      },
      {
        // Reminders is a top-level section but the bottom bar has only five
        // slots, all spoken for. Without a row here it would be a tab nobody on
        // a phone could reach.
        href: "/protected/reminders",
        label: "Fee reminders",
        description: "WhatsApp the families who owe",
        icon: Send,
        requiredPermission: "settings:view",
        i18nKey: "moreReminders",
      },
      {
        href: "/protected/transactions",
        label: "All receipts",
        description: "By day, mode and staff",
        icon: BookOpenCheck,
        requiredPermission: "receipts:view",
        i18nKey: "moreAllReceipts",
      },
      {
        href: "/protected/receipts",
        label: "Find a receipt",
        description: "Number, name or phone",
        icon: FileSpreadsheet,
        requiredPermission: "receipts:view",
        i18nKey: "moreFindReceipt",
      },
    ],
  },
  {
    key: "records",
    i18nKey: "groupRecords",
    label: "Records",
    items: [
      {
        href: "/protected/fee-setup",
        label: "Fee setup",
        description: "Class fees, installments, discounts",
        icon: ScrollText,
        requiredPermission: "fees:view",
        i18nKey: "moreFeeSetup",
      },
      {
        href: "/protected/exports",
        label: "Reports",
        description: "Collection, defaulters, class-wise",
        icon: Download,
        requiredPermission: "reports:view",
        i18nKey: "moreReports",
      },
      {
        href: "/protected/imports",
        label: "Import data",
        description: "Students and old dues from Excel",
        icon: FolderCog,
        requiredPermission: "imports:view",
        i18nKey: "moreImports",
      },
    ],
  },
  {
    key: "admin",
    i18nKey: "groupAdmin",
    label: "Admin",
    items: [
      {
        href: "/protected/admin-tools",
        label: "Admin tools",
        description: "Promotion, old dues, recovery plans",
        icon: Settings2,
        // Matches the sidebar item and the page's own
        // requireAnyStaffPermission(["finance:view", "settings:view"]).
        requiredPermission: "finance:view",
        i18nKey: "moreAdminTools",
      },
      {
        href: "/protected/finance-controls",
        label: "Finance controls",
        description: "Approvals, refunds and corrections",
        icon: ShieldCheck,
        requiredPermission: "finance:view",
        i18nKey: "moreFinanceControls",
      },
      {
        href: "/protected/staff",
        label: "Staff & roles",
        description: "Logins and permissions",
        icon: UsersRound,
        requiredPermission: "staff:manage",
        i18nKey: "moreStaff",
      },
      {
        href: "/protected/master-data",
        label: "Master data",
        description: "Classes, routes, discount names",
        icon: BadgePercent,
        // The page guards on settings:WRITE — a view-only link here would
        // hand every teacher a row that bounces them straight back.
        requiredPermission: "settings:write",
        i18nKey: "moreMasterData",
      },
    ],
  },
  {
    key: "system",
    i18nKey: "groupSystem",
    label: "System",
    items: [
      {
        href: "/protected/admin-tools/activity",
        label: "Activity log",
        description: "Every change, with who and when",
        icon: ActivitySquare,
        requiredPermission: "settings:view",
        i18nKey: "moreActivity",
      },
      {
        href: "/protected/settings/glossary",
        label: "Money words explained",
        description: "What pending, old balance, adjustment mean",
        icon: BookText,
        requiredPermission: "dashboard:view",
        i18nKey: "moreGlossary",
      },
      {
        href: "/protected/settings",
        label: "Settings",
        description: "Language, session, printer, sync",
        icon: SlidersHorizontal,
        requiredPermission: "settings:view",
        i18nKey: "moreSettings",
      },
    ],
  },
] as const;

export function getMobileMoreGroups(staffRole: StaffRole): MobileMoreGroup[] {
  return mobileMoreGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasRolePermission(staffRole, item.requiredPermission),
      ),
    }))
    .filter((group) => group.items.length > 0);
}


/**
 * Routes the phone app presents as full-screen takeovers.
 *
 * The design keeps the tab bar on six screens only (Home, Students, Collect,
 * Calls, Transactions, More). Everything else — detail views, records and the
 * admin long tail — replaces the screen and offers a back arrow instead. The
 * bar would otherwise cost 68px on screens that need the height most, and it
 * makes "where am I" ambiguous: a tab bar says "you are on a tab", which a
 * student detail page is not.
 *
 * Matching is prefix-based, so nested routes (a promotion run, a receipt id)
 * inherit their parent's treatment.
 */
const mobileTakeoverRoutes: readonly string[] = [
  "/protected/students/",        // detail, new, edit, statements
  "/protected/receipts",
  "/protected/settings",
  "/protected/fee-setup",
  "/protected/exports",
  "/protected/reports",
  "/protected/ledger",
  "/protected/imports",
  "/protected/staff",
  "/protected/master-data",
  "/protected/finance-controls",
  "/protected/admin-tools",
  "/protected/reminders/",
  "/protected/password",
  "/protected/payments/bulk",
] as const;

/** True when the phone app should hide the tab bar and show a back arrow. */
export function isMobileTakeoverRoute(pathname: string): boolean {
  return mobileTakeoverRoutes.some(
    (route) => pathname === route || pathname.startsWith(route),
  );
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
  /** Small static capability chip (e.g. day close runs automatically). */
  statusChip?: { label: string; tone: "good" | "info" | "warning" | "neutral" };
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
        statusChip: { label: "AUTO", tone: "good" },
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
