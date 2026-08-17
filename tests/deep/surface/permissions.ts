import { registerDimension } from "../lib/coverage";

/**
 * The permission matrix, deliberately kept as a second copy.
 *
 * This is NOT imported from `lib/auth/roles.ts` on purpose. A permission test
 * that reads its expectations from the code under test can only ever prove the
 * code agrees with itself. If the two drift, `tests/unit/rbac-matrix-mirror.test.ts`
 * fails in two seconds and somebody has to decide which one is right — the same
 * arrangement `tests/unit/mcp-permissions.test.ts` already uses to pin the MCP
 * Worker's hand-copy.
 */

export const STAFF_ROLES = [
  "admin",
  "accountant",
  "teacher",
  "fee_collector",
  "view_only",
] as const;

export type StaffRoleName = (typeof STAFF_ROLES)[number];

export const EXPECTED_ROLE_PERMISSIONS: Record<StaffRoleName, readonly string[]> = {
  admin: [
    "dashboard:view", "students:view", "students:write", "students:edit_basic",
    "students:edit_sr_no", "fees:view", "fees:write", "fees:repayment_plan",
    "payments:view", "payments:write", "payments:adjust", "payments:reverse_any",
    "payments:bulk",
    "payments:waive_late_fee", "finance:view", "finance:write", "finance:approve",
    "ledger:view", "receipts:view", "receipts:print", "defaulters:view",
    "contacts:write", "imports:view", "reports:view", "settings:view",
    "settings:write", "staff:manage",
  ],
  accountant: [
    "dashboard:view", "students:view", "fees:view", "payments:view",
    "payments:write", "payments:waive_late_fee", "finance:view", "ledger:view",
    "receipts:view", "receipts:print", "defaulters:view", "imports:view",
    "reports:view", "settings:view",
  ],
  teacher: [
    "dashboard:view", "students:view", "students:edit_basic", "fees:view",
    "payments:view", "finance:view", "ledger:view", "receipts:view",
    "defaulters:view", "imports:view", "reports:view", "settings:view",
  ],
  fee_collector: [
    "dashboard:view", "students:view", "fees:view", "payments:view",
    "finance:view", "ledger:view", "receipts:view", "defaulters:view",
    "contacts:write", "imports:view", "reports:view", "settings:view",
  ],
  view_only: ["dashboard:view", "students:view", "defaulters:view", "receipts:view"],
};

/** `anyOf` mirrors the pages that call `requireAnyStaffPermission()`. */
export type RouteGuard = { path: string; anyOf: readonly string[] };

export const GUARDED_ROUTES: readonly RouteGuard[] = [
  { path: "/protected/dashboard", anyOf: ["dashboard:view"] },
  { path: "/protected/students", anyOf: ["students:view"] },
  { path: "/protected/students/new", anyOf: ["students:write"] },
  { path: "/protected/students/bulk-update", anyOf: ["students:write"] },
  { path: "/protected/fee-setup", anyOf: ["fees:view"] },
  { path: "/protected/fee-setup/generate", anyOf: ["fees:write"] },
  { path: "/protected/fee-setup/time-travel", anyOf: ["fees:view"] },
  { path: "/protected/payments", anyOf: ["payments:view"] },
  { path: "/protected/payments/bulk", anyOf: ["payments:bulk"] },
  {
    path: "/protected/transactions",
    anyOf: ["receipts:view", "defaulters:view", "reports:view", "finance:view"],
  },
  { path: "/protected/receipts", anyOf: ["receipts:view"] },
  { path: "/protected/ledger", anyOf: ["ledger:view"] },
  { path: "/protected/defaulters", anyOf: ["defaulters:view"] },
  { path: "/protected/exports", anyOf: ["reports:view"] },
  { path: "/protected/reports", anyOf: ["reports:view"] },
  { path: "/protected/imports", anyOf: ["imports:view"] },
  { path: "/protected/admin-tools", anyOf: ["finance:view", "settings:view"] },
  { path: "/protected/admin-tools/activity", anyOf: ["settings:view", "finance:view"] },
  { path: "/protected/admin-tools/prev-year-dues", anyOf: ["fees:view", "finance:view"] },
  { path: "/protected/admin-tools/promotion", anyOf: ["students:write"] },
  {
    path: "/protected/admin-tools/recovery",
    anyOf: ["finance:view", "fees:view", "defaulters:view"],
  },
  { path: "/protected/admin-tools/session-health", anyOf: ["fees:view"] },
  {
    path: "/protected/admin-tools/whatsapp-templates",
    anyOf: ["settings:view", "settings:write"],
  },
  { path: "/protected/master-data", anyOf: ["settings:write"] },
  { path: "/protected/finance-controls", anyOf: ["finance:view"] },
  { path: "/protected/staff", anyOf: ["staff:manage"] },
  { path: "/protected/settings", anyOf: ["settings:view"] },
  { path: "/protected/settings/glossary", anyOf: ["dashboard:view"] },
  { path: "/protected/password", anyOf: [] },
];

/**
 * Gates that live inside a page rather than in front of it.
 *
 * Route-level RBAC is the cheap half. These are the ones where the page renders
 * for everybody and the *control* is what differs — a "Read only access" badge
 * where a Collect button should be. A missing in-page gate is invisible to a
 * route sweep, and it is the half that lets somebody post money.
 *
 * `presentFor` lists the roles that must see the control; every other role must
 * not. Only roles that discriminate are worth visiting, which is why this is 24
 * cases rather than 8 x 5 = 40.
 */
export type InPageGate = {
  id: string;
  route: string;
  permission: string;
  /** A control that must exist for a permitted role and must not for others. */
  locator: string;
  presentFor: readonly StaffRoleName[];
  note: string;
};

export const IN_PAGE_GATES: readonly InPageGate[] = [
  {
    id: "payments.posting-enabled-badge",
    route: "/protected/payments",
    permission: "payments:write",
    // The badge, not the Collect button. The button only exists once a student
    // is selected and an amount typed, so its absence on a freshly loaded desk
    // says nothing about permissions — the harness reported a false P0 on
    // exactly that. The badge is rendered on load and is the desk's own
    // statement about what this staff member may do.
    locator: 'text="Posting enabled"',
    presentFor: ["admin", "accountant"],
    note: "A teacher or collector reaching the desk must see it read-only.",
  },
  {
    id: "payments.read-only-badge",
    route: "/protected/payments",
    permission: "payments:view",
    locator: 'text="Read-only access"',
    // The mirror image, asserted separately: a role that cannot post must be
    // TOLD so, not left to discover it when the button does nothing.
    presentFor: ["teacher", "fee_collector"],
    note: "The desk states read-only status on load rather than failing later.",
  },
  {
    id: "students.add-button",
    route: "/protected/students",
    permission: "students:write",
    locator: 'a[href*="/protected/students/new"]',
    presentFor: ["admin"],
    note: "The add-student affordance follows students:write, not students:view.",
  },
  {
    id: "students.bulk-update",
    route: "/protected/students",
    permission: "students:write",
    locator: 'a[href*="/protected/students/bulk-update"]',
    presentFor: ["admin"],
    note: "Bulk update is the highest-blast-radius student write in the app.",
  },
  {
    id: "receipts.print",
    route: "/protected/receipts",
    permission: "receipts:print",
    // The print affordance is an anchor per row, not a button, and its href is
    // the receipt detail with `?print=1` rather than anything containing "pdf".
    // The first locator here matched nothing and reported admin and accountant
    // as wrongly denied a permission they plainly hold.
    locator: 'a:has-text("Print"), button:has-text("Print"), a[href*="print=1"]',
    presentFor: ["admin", "accountant"],
    note: "receipts:print is a strict subset of receipts:view and must stay one.",
  },
];

/**
 * Gates this suite deliberately does NOT assert, and why.
 *
 * Both live behind an interaction: the contact-log form is inside
 * `components/defaulters/contact-popover.tsx` and the payment history inside the
 * worklist drawer, so neither control exists on a freshly loaded page. Locators
 * written against them matched nothing and produced two confident P0s about
 * permissions that are, as far as anyone can tell, working.
 *
 * Recorded here rather than quietly dropped: the coverage ledger prints them by
 * name under "what this run did not test", which is the honest outcome. Closing
 * the gap means driving the drawer open first — worth doing, not worth faking.
 */
export const UNCOVERED_IN_PAGE_GATES: readonly { id: string; reason: string }[] = [
  {
    id: "defaulters.contact-log",
    reason:
      "contacts:write gates a form inside a popover; it needs a row opened first. " +
      "Only admin and fee_collector should be able to write contact history.",
  },
  {
    id: "defaulters.payment-history",
    reason:
      "view_only lacks payments:view and receives a REDACTED payload rather than " +
      "a hidden panel (lib/defaulters/data.ts nulls lastPaymentDate). Asserting " +
      "it means reading the drawer, or the fee-breakdown endpoint, per role.",
  },
];

/**
 * Where `/protected` sends each role. A login that lands somewhere else is a
 * permission bug wearing a redirect.
 */
export const DEFAULT_LANDINGS: Record<StaffRoleName, string> = {
  admin: "/protected/dashboard",
  accountant: "/protected/payments",
  teacher: "/protected/students",
  fee_collector: "/protected/defaulters",
  view_only: "/protected/dashboard",
};

export function roleHolds(role: StaffRoleName, permission: string): boolean {
  return EXPECTED_ROLE_PERMISSIONS[role].includes(permission);
}

export function shouldReach(role: StaffRoleName, guard: RouteGuard): boolean {
  return (
    guard.anyOf.length === 0 ||
    guard.anyOf.some((permission) => roleHolds(role, permission))
  );
}

export const ROLE_DIMENSION = registerDimension({
  id: "rbac.role",
  label: "Staff roles",
  domain: [...STAFF_ROLES],
  strategy: "exhaustive-pairwise",
  pairedWith: ["route.page"],
});

export const GUARD_DIMENSION = registerDimension({
  id: "rbac.guarded-route",
  label: "Permission-guarded routes",
  domain: GUARDED_ROUTES.map((route) => route.path),
  strategy: "exhaustive-pairwise",
  pairedWith: ["rbac.role"],
});

export const IN_PAGE_GATE_DIMENSION = registerDimension({
  id: "rbac.in-page-gate",
  label: "In-page permission gates",
  domain: IN_PAGE_GATES.map((gate) => gate.id),
  strategy: "exhaustive-single-factor",
});

export const UNCOVERED_GATE_DIMENSION = registerDimension({
  id: "rbac.in-page-gate-uncovered",
  label: "In-page gates behind an interaction",
  domain: UNCOVERED_IN_PAGE_GATES.map((gate) => gate.id),
  strategy: "declared-uncovered",
  note:
    "Controls that only exist after a popover or drawer is opened. Asserting " +
    "them means driving that interaction per role first; until then the report " +
    "names them rather than implying they were checked.",
});
