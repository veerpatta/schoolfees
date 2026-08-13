import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { availableRoles, passwordFor, storageStatePath, SMOKE_ROLES } from "./roles";

const screenshotDir = path.resolve("docs/smoke-reports/2026-05/screenshots");

/**
 * Sign in once per role and save a storage state each.
 *
 * The sweep needs all five because the interesting failures are the ones a
 * single admin login cannot see: a page that renders for a teacher when it
 * should have redirected to /protected/access-denied looks identical to a page
 * that is working.
 *
 * Passwords come from the environment and Playwright types them. Nothing is
 * printed, and `tests/smoke-2026-05/.auth/` is gitignored.
 */

const roles = availableRoles();

// With no credentials the loop below defines zero tests, the setup project
// passes vacuously, and every dependent project then fails on a missing
// storage-state file. Fail here instead, where the message can be useful.
if (roles.length === 0) {
  test("smoke credentials are configured", () => {
    const names = SMOKE_ROLES.map((role) => role.email).join("\n  ");
    throw new Error(
      "No smoke credentials found.\n\n" +
        "Set one password for all five QA logins:\n\n" +
        "  $env:SMOKE_TEST_STAFF_PASSWORD = '<the TEST_STAFF_PASSWORD you gave bootstrap-test-staff.mjs>'\n\n" +
        `The accounts are:\n  ${names}\n\n` +
        "If they do not exist yet, create them with:\n" +
        "  node scripts/bootstrap-test-staff.mjs\n\n" +
        "Set SMOKE_ROLES=admin,accountant to capture only some of them.",
    );
  });
}

test.describe("authenticate QA staff logins", () => {
  for (const role of roles) {
    test(`sign in as ${role.role} (${role.key})`, async ({ page }) => {
      const password = passwordFor(role);
      expect(password, `no password for ${role.key}`).toBeTruthy();

      const authPath = storageStatePath(role.key);
      await mkdir(path.dirname(authPath), { recursive: true });
      await mkdir(screenshotDir, { recursive: true });

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator('input[name="email"]').fill(role.email);
      await page.locator('input[name="password"]').fill(password!);

      await Promise.all([
        page.waitForURL(/\/protected(\/|$)/, { timeout: 45_000 }),
        page.getByRole("button", { name: /sign in/i }).click(),
      ]);
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/protected/);

      // getDefaultProtectedHref() decides where each role lands. A role landing
      // somewhere else is a real finding, not a flaky assertion — but it must
      // not stop the other four from being captured, so it is reported rather
      // than thrown.
      const landedOn = new URL(page.url()).pathname;
      if (!landedOn.startsWith(role.landing)) {
        console.warn(
          `[smoke-auth] ${role.role} landed on ${landedOn}, expected ${role.landing}`,
        );
      }

      await page.screenshot({
        path: path.join(screenshotDir, `auth-${role.key}-landing.png`),
        fullPage: true,
        timeout: 30_000,
      });

      await page.context().storageState({ path: authPath });
    });
  }
});
