import { expect, test, type Page } from "@playwright/test";

import { SMOKE_SESSION_LABEL } from "./roles";

/**
 * Click through the app and check that no raw translation key reaches a screen.
 *
 * This exists because of a regression that shipped to production. The message
 * catalogue was split so each route carried only the namespaces it renders, and
 * every check passed — because every check used `page.goto()`. A full page load
 * re-runs the root layout, so each route got exactly the namespaces it asked
 * for and everything resolved.
 *
 * **Be honest about what this does and does not prove.** It was written to
 * catch that regression and, run against a local build of the exact broken
 * commit, it did NOT: neither direct loads nor sidebar clicks reproduced the
 * raw keys, at desktop or mobile widths, even though staff devices showed them
 * plainly on the same build. Whatever the trigger was — device state, an
 * already-installed service worker, a cached RSC payload — none of it survives
 * a fresh Playwright context.
 *
 * So this is a general guard against raw keys reaching a screen, not proof that
 * a catalogue change is safe. The reliable guard is
 * `tests/unit/message-catalog-is-whole.test.ts`, which fails on the shape of
 * the change rather than on its symptom.
 *
 * Two things it must still do, or it passes while the app is broken — the first
 * version of it did exactly that:
 *
 *  1. **Actually navigate.** A click that quietly does nothing leaves you on
 *     the page you already checked. Every hop asserts the URL changed.
 *  2. **Stay client-side.** A full page load re-runs the root layout, so a hop
 *     that reloads the document is not testing what it claims to.
 */

const NAMESPACES = [
  "Common", "Locale", "Toasts", "Roles", "Navigation", "Activity", "Segments",
  "MobileApp", "Dashboard", "Students", "Payments", "Receipts", "Transactions",
  "Defaulters", "FeeSetup", "Exports", "AdminTools",
];

/** e.g. `Students.title`, `DEFAULTERS.DRAWERCALLNUMBER` (uppercased by CSS). */
const RAW_KEY = new RegExp(
  `\\b(${NAMESPACES.join("|")})\\.[a-zA-Z][a-zA-Z0-9_.]*`,
  "gi",
);

/** Sidebar destinations, in the order a staffer would work through them. */
const HOPS = [
  { label: "Students", path: "/protected/students" },
  { label: "Fee Setup", path: "/protected/fee-setup" },
  { label: "Payment Desk", path: "/protected/payments" },
  { label: "Transactions", path: "/protected/transactions" },
  { label: "Defaulters", path: "/protected/defaulters" },
  { label: "Exports", path: "/protected/exports" },
  { label: "Admin Tools", path: "/protected/admin-tools" },
  { label: "Dashboard", path: "/protected/dashboard" },
];

async function rawKeysOnScreen(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return [...new Set(text.match(RAW_KEY) ?? [])];
}

test("no raw translation keys when moving between workspaces by clicking", async ({
  page,
}) => {
  let documentLoads = 0;
  page.on("load", () => {
    documentLoads += 1;
  });

  // One full load to start, exactly as a staff member's morning begins.
  await page.goto(`/protected/dashboard?session=${encodeURIComponent(SMOKE_SESSION_LABEL)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle").catch(() => {});

  expect(await rawKeysOnScreen(page), "raw keys on the first page load").toEqual([]);

  // The sidebar, not the mobile tab bar — both are in the DOM at every width,
  // and matching by name alone picks up whichever comes first.
  const sidebar = page.locator('aside[aria-label="Workspace sidebar"]');
  await expect(sidebar, "workspace sidebar should be present at this width").toBeVisible();

  const failures: string[] = [];

  for (const hop of HOPS) {
    const loadsBefore = documentLoads;

    await sidebar.getByRole("link", { name: hop.label, exact: false }).first().click();

    // A click that navigated nowhere would otherwise leave us re-checking the
    // previous screen and calling it a pass.
    await page.waitForURL(new RegExp(hop.path.replace(/\//g, "\\/")), { timeout: 20_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    if (documentLoads > loadsBefore) {
      failures.push(
        `${hop.label}: the browser reloaded the document instead of navigating client-side, ` +
          "so this hop cannot detect the bug it exists to catch",
      );
      continue;
    }

    const keys = await rawKeysOnScreen(page);
    if (keys.length > 0) {
      failures.push(`${hop.label} (${new URL(page.url()).pathname}): ${keys.slice(0, 6).join(", ")}`);
    }
  }

  expect(
    failures,
    "Raw translation keys appeared after client-side navigation. The catalogue " +
      "the browser holds does not cover the screen it is rendering — usually " +
      "because something above the router decided which namespaces to ship.",
  ).toEqual([]);
});
