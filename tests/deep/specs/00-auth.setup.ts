import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import {
  availableRoles,
  canMintSessions,
  passwordFor,
  resolveTarget,
  storageStatePath,
  SMOKE_ROLES,
  type SmokeRole,
} from "../lib/identity";

/**
 * Sign in once per role, per target.
 *
 * Per target matters: a cookie minted on `127.0.0.1` is not valid on
 * `schoolfees-two.vercel.app`. Sharing one state between the two legs made the
 * production leg report 43 routes of "not authenticated" instead of one clear
 * failure, so the states are filed under `.auth/<local|production>/`.
 *
 * Two ways in, in this order:
 *
 * 1. **A minted session.** With the service-role key, `auth.admin.generateLink`
 *    issues a one-time magic-link token for one of the `qa.*` accounts and the
 *    app's own `/auth/confirm` exchanges it for a session — the same code path
 *    a staff member takes clicking an emailed link. No password exists in the
 *    flow to be typed, stored or leaked, which is why it is the default.
 * 2. **A password** from the environment, if one was supplied.
 */

const roles = availableRoles();
const target = resolveTarget();

if (roles.length === 0) {
  test("deep harness credentials are configured", () => {
    const names = SMOKE_ROLES.map((role) => role.email).join("\n  ");
    throw new Error(
      "No way to sign in.\n\n" +
        "Either put SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local\n" +
        "(sessions are then minted through /auth/confirm, no password needed), or set:\n\n" +
        "  $env:SMOKE_TEST_STAFF_PASSWORD = '<the TEST_STAFF_PASSWORD for the qa.* logins>'\n\n" +
        `The accounts are:\n  ${names}\n\n` +
        "If they do not exist yet, create them with:\n" +
        "  node scripts/bootstrap-test-staff.mjs",
    );
  });
}

async function mintSession(page: Page, role: SmokeRole) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: role.email,
  });

  if (error) {
    throw new Error(`Could not mint a session for ${role.email}: ${error.message}`);
  }

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error(`No token returned for ${role.email}.`);

  await page.goto(
    `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=%2Fprotected`,
    { waitUntil: "domcontentloaded" },
  );
}

async function signInWithPassword(page: Page, role: SmokeRole, password: string) {
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(role.email);
  await page.locator('input[name="password"]').fill(password);

  await Promise.all([
    page.waitForURL(/\/protected(\/|$)/, { timeout: 45_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

test.describe("authenticate QA staff logins", () => {
  for (const role of roles) {
    test(`sign in as ${role.role} (${role.key}) on ${target}`, async ({ page }) => {
      const authPath = storageStatePath(role.key, target);
      await mkdir(path.dirname(authPath), { recursive: true });

      const password = passwordFor(role);

      if (canMintSessions()) {
        await mintSession(page, role);
      } else {
        expect(password, `no password for ${role.key}`).toBeTruthy();
        await signInWithPassword(page, role, password!);
      }

      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page, `${role.email} did not reach /protected`).toHaveURL(/\/protected/);

      // getDefaultProtectedHref() decides where each role lands. A role landing
      // somewhere else is a real finding — spec 04 asserts it — but it must not
      // stop the other four states from being captured.
      const landedOn = new URL(page.url()).pathname;
      if (!landedOn.startsWith(role.landing)) {
        console.warn(
          `[deep-auth] ${role.role} landed on ${landedOn}, expected ${role.landing}`,
        );
      }

      await page.context().storageState({ path: authPath });
    });
  }
});
