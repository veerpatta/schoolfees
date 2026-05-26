import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const authPath = path.resolve("tests/smoke-2026-05/.auth/admin.json");
const screenshotDir = path.resolve("docs/smoke-reports/2026-05/screenshots");

test("authenticate admin and save storage state", async ({ page }) => {
  const email = process.env.SMOKE_LOGIN_EMAIL;
  const password = process.env.SMOKE_LOGIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Set SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD before running smoke tests.");
  }

  await mkdir(path.dirname(authPath), { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(screenshotDir, "auth-login-before.png"),
    fullPage: true,
    timeout: 30_000,
  });

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(/\/protected(\/dashboard|\/payments)?/, { timeout: 45_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveURL(/\/protected/);
  await page.screenshot({
    path: path.join(screenshotDir, "auth-login-after.png"),
    fullPage: true,
    timeout: 30_000,
  });
  await page.context().storageState({ path: authPath });
});
