import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const baseUrl = process.env.SCHOOLFEES_READINESS_BASE_URL ?? "https://schoolfees-two.vercel.app";
const authPath = path.resolve("tests/smoke-readiness/.auth/admin.json");
const browser = await chromium.launch({
  channel: process.env.SCHOOLFEES_READINESS_BROWSER_CHANNEL ?? "chrome",
  headless: false,
});

try {
  await mkdir(path.dirname(authPath), { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log("Sign in with an admin staff account in the opened browser.");
  console.log("No password or browser state will be printed; the state file is gitignored.");
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/protected(?:\/|$)/, { timeout: 5 * 60_000 });

  await page.goto(`${baseUrl}/protected/dashboard?session=TEST-2026-27`, {
    waitUntil: "domcontentloaded",
  });
  if (/\/auth\/login/i.test(page.url())) {
    throw new Error("The captured session did not remain authenticated.");
  }

  await context.storageState({ path: authPath });
  console.log(`Authenticated TEST readiness state saved to ${authPath}`);
  await context.close();
} finally {
  await browser.close();
}
