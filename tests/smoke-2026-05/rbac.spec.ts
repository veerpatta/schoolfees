import { expect, test, type Page } from "@playwright/test";

import { SMOKE_ROLES, SMOKE_SESSION_LABEL, type SmokeRoleKey } from "./roles";

/**
 * Every protected route, seen by one role.
 *
 * The project name carries the role (`rbac-teacher`), so this one file runs
 * once per staff login and each run is a different person looking at the same
 * 44 routes.
 *
 * What this catches that an admin sweep cannot: a page whose permission guard
 * is missing or wrong renders perfectly. It looks like a working page. The only
 * way to see it is to visit it as somebody who should have been turned away.
 */

// Copied from lib/auth/roles.ts rather than imported. If the two drift, this
// test should fail and make somebody decide which one is right — that is the
// whole value of a second copy for a permission matrix.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: [
    "dashboard:view", "students:view", "students:write", "students:edit_basic",
    "students:edit_sr_no", "fees:view", "fees:write", "fees:repayment_plan",
    "payments:view", "payments:write", "payments:adjust", "payments:bulk",
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

/** `anyOf` mirrors the pages that call requireAnyStaffPermission(). */
type RouteGuard = { path: string; anyOf: readonly string[] };

const ROUTES: readonly RouteGuard[] = [
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

function roleFromProjectName(name: string): SmokeRoleKey {
  const key = name.replace(/^rbac-/, "") as SmokeRoleKey;
  if (!SMOKE_ROLES.some((role) => role.key === key)) {
    throw new Error(`Project "${name}" does not name a known role.`);
  }
  return key;
}

function withSession(path: string): string {
  return `${path}?session=${encodeURIComponent(SMOKE_SESSION_LABEL)}`;
}

type Visit = {
  path: string;
  landedOn: string;
  status: number;
  allowed: boolean;
  denied: boolean;
  bouncedToLogin: boolean;
  consoleErrors: string[];
  serverErrors: string[];
};

async function visit(page: Page, path: string): Promise<Visit> {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onResponse = (response: { status: () => number; url: () => string }) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on("console", onConsole);
  page.on("response", onResponse);

  let status = 0;
  try {
    const response = await page.goto(withSession(path), { waitUntil: "domcontentloaded" });
    status = response?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  } finally {
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  const landedOn = new URL(page.url()).pathname;

  return {
    path,
    landedOn,
    status,
    allowed: landedOn === path,
    denied: landedOn.startsWith("/protected/access-denied"),
    bouncedToLogin: landedOn.startsWith("/auth/"),
    consoleErrors,
    serverErrors,
  };
}

test.describe("permission matrix", () => {
  for (const route of ROUTES) {
    test(`${route.path}`, async ({ page }, testInfo) => {
      const key = roleFromProjectName(testInfo.project.name);
      const role = SMOKE_ROLES.find((entry) => entry.key === key)!;
      const held = ROLE_PERMISSIONS[role.role] ?? [];
      const shouldSee =
        route.anyOf.length === 0 || route.anyOf.some((permission) => held.includes(permission));

      const result = await visit(page, route.path);

      // A stored session that has expired invalidates the whole run, so say so
      // loudly rather than reporting 29 false denials.
      expect(
        result.bouncedToLogin,
        `${role.role} was signed out visiting ${route.path} — re-run the setup project`,
      ).toBe(false);

      expect(
        result.serverErrors,
        `${role.role} got a server error on ${route.path}`,
      ).toEqual([]);

      if (shouldSee) {
        expect(
          result.denied,
          `${role.role} holds ${route.anyOf.join(" or ") || "no permission requirement"} but was denied ${route.path}`,
        ).toBe(false);
        expect(
          result.allowed,
          `${role.role} should reach ${route.path} but landed on ${result.landedOn}`,
        ).toBe(true);
      } else {
        // Turned away is correct. Landing on the page is the bug this file exists
        // to find: a missing guard renders a perfectly normal-looking screen.
        expect(
          result.allowed,
          `${role.role} lacks ${route.anyOf.join(" or ")} but rendered ${route.path}`,
        ).toBe(false);
      }

      // React key warnings, hydration mismatches and failed fetches are
      // reported but do not fail the permission check.
      if (result.consoleErrors.length > 0) {
        console.warn(
          `[rbac] ${role.role} ${route.path} console errors:\n  ${result.consoleErrors.join("\n  ")}`,
        );
      }
    });
  }
});
