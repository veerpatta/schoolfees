import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Response as PlaywrightResponse,
  type TestInfo,
} from "@playwright/test";

const TEST_SESSION = "TEST-2026-27";

type RouteCheck = {
  route: string;
  identity: RegExp;
};

type RouteResult = {
  route: string;
  finalUrl: string;
  status: number | null;
  bodyLength: number;
  safeInteractions: number;
  consoleErrors: string[];
  serverErrors: string[];
  hasIdentity: boolean;
  hasFrameworkError: boolean;
};

const dailyWorkspaces: RouteCheck[] = [
  { route: "/protected/dashboard", identity: /Dashboard|Today|Pending/i },
  { route: "/protected/students", identity: /Students|Student/i },
  { route: "/protected/fee-setup", identity: /Fee Setup|Fee Policy|Installment/i },
  { route: "/protected/payments", identity: /Payment Desk|Collect|Receipt/i },
  { route: "/protected/transactions", identity: /Transactions|Receipts|Ledger/i },
  { route: "/protected/defaulters", identity: /Defaulters|Follow/i },
  { route: "/protected/exports", identity: /Exports|Download|XLSX/i },
  { route: "/protected/admin-tools", identity: /Admin Tools|Rare setup|Recovery/i },
];

const legacyRedirects = [
  { route: "/protected/dues", expected: /\/protected\/transactions/ },
  { route: "/protected/advanced", expected: /\/protected\/admin-tools/ },
  { route: "/protected/setup", expected: /\/protected\/admin-tools/ },
] as const;

const legacyShims: RouteCheck[] = [
  { route: "/protected/collections", identity: /Payment Desk|Collect|Receipt/i },
  { route: "/protected/fee-structure", identity: /Fee Setup|Fee Policy|Installment/i },
  { route: "/protected/receipts", identity: /Receipts|Transactions|Receipt/i },
  { route: "/protected/ledger", identity: /Ledger|Transactions|Receipt/i },
];

function withSession(route: string) {
  if (!route.startsWith("/protected")) {
    return route;
  }

  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}session=${encodeURIComponent(TEST_SESSION)}`;
}

function slug(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90);
}

async function writeReport(testInfo: TestInfo, title: string, rows: RouteResult[], notes: string[] = []) {
  const reportPath = testInfo.outputPath(`${slug(title)}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });

  const lines = [
    `# ${title}`,
    "",
    `Session: ${TEST_SESSION}`,
    `Project: ${testInfo.project.name}`,
    "",
    "| Route | Final URL | Status | Identity | Console errors | Server errors | Safe interactions |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: |",
    ...rows.map((row) => {
      return [
        row.route,
        row.finalUrl,
        String(row.status ?? ""),
        row.hasIdentity ? "yes" : "no",
        String(row.consoleErrors.length),
        String(row.serverErrors.length),
        String(row.safeInteractions),
      ].join(" | ");
    }),
    "",
    ...notes,
  ];

  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
  await testInfo.attach(title, { path: reportPath, contentType: "text/markdown" });
}

async function requireAuthenticatedWorkspace(page: Page) {
  await page.goto(withSession("/protected"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

  if (/\/auth\/login/i.test(page.url())) {
    throw new Error(
      [
        "Readiness smoke needs an authenticated staff browser state.",
        "Sign in through the Browser QA path or set SCHOOLFEES_READINESS_STORAGE_STATE to a local Playwright storage-state file.",
        "This smoke did not mutate data.",
      ].join(" "),
    );
  }

  expect(page.url()).toMatch(/\/protected\/(dashboard|payments|students|defaulters)/);
}

async function exerciseSafeSurface(page: Page) {
  let count = 0;
  await page.keyboard.press("Tab");
  count += 1;

  const searchInput = page
    .locator('input[type="search"], input[name*="search" i], input[placeholder*="search" i]')
    .first();

  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill("NO-SUCH-STUDENT-READINESS");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await searchInput.fill("");
    count += 1;
  }

  const tab = page.locator('[role="tab"]').first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    count += 1;
  }

  return count;
}

async function auditRoute(page: Page, check: RouteCheck) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  };
  const onResponse = (response: PlaywrightResponse) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on("console", onConsole);
  page.on("response", onResponse);

  let status: number | null = null;
  try {
    const response = await page.goto(withSession(check.route), { waitUntil: "domcontentloaded" });
    status = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
  } finally {
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const safeInteractions = await exerciseSafeSurface(page).catch(() => 0);
  const hasFrameworkError = /Unhandled Runtime Error|Application error|Hydration failed/i.test(bodyText);

  return {
    route: check.route,
    finalUrl: page.url(),
    status,
    bodyLength: bodyText.length,
    safeInteractions,
    consoleErrors,
    serverErrors,
    hasIdentity: check.identity.test(bodyText),
    hasFrameworkError,
  } satisfies RouteResult;
}

test.describe.configure({ mode: "serial" });

test("authenticated TEST session is available", async ({ page }) => {
  await requireAuthenticatedWorkspace(page);
  await expect(page.locator("body")).toContainText(/Dashboard|Payment Desk|Students|Defaulters/);
});

test("daily workspaces render on desktop and mobile", async ({ page }, testInfo) => {
  await requireAuthenticatedWorkspace(page);

  const rows: RouteResult[] = [];
  for (const route of dailyWorkspaces) {
    rows.push(await auditRoute(page, route));
  }

  await writeReport(testInfo, "Daily Workspace Readiness", rows);

  expect(rows.filter((row) => /\/auth\/login/i.test(row.finalUrl))).toEqual([]);
  expect(rows.filter((row) => row.status && row.status >= 500)).toEqual([]);
  expect(rows.filter((row) => row.bodyLength < 200)).toEqual([]);
  expect(rows.filter((row) => !row.hasIdentity)).toEqual([]);
  expect(rows.filter((row) => row.hasFrameworkError)).toEqual([]);
  expect(rows.filter((row) => row.consoleErrors.length > 0)).toEqual([]);
  expect(rows.filter((row) => row.serverErrors.length > 0)).toEqual([]);
  expect(rows.filter((row) => row.safeInteractions === 0)).toEqual([]);
});

test("legacy staff bookmarks remain compatible", async ({ page }, testInfo) => {
  await requireAuthenticatedWorkspace(page);

  const rows: RouteResult[] = [];
  for (const redirect of legacyRedirects) {
    const row = await auditRoute(page, { route: redirect.route, identity: /Admin Tools|Transactions|Receipts|Ledger/i });
    rows.push(row);
    expect(row.finalUrl).toMatch(redirect.expected);
  }

  for (const shim of legacyShims) {
    rows.push(await auditRoute(page, shim));
  }

  await writeReport(testInfo, "Legacy Route Compatibility", rows);

  expect(rows.filter((row) => /\/auth\/login/i.test(row.finalUrl))).toEqual([]);
  expect(rows.filter((row) => row.status && row.status >= 500)).toEqual([]);
  expect(rows.filter((row) => !row.hasIdentity)).toEqual([]);
  expect(rows.filter((row) => row.hasFrameworkError)).toEqual([]);
});

test("protected entry redirects to the current role landing", async ({ page }, testInfo) => {
  await requireAuthenticatedWorkspace(page);

  const row = await auditRoute(page, {
    route: "/protected",
    identity: /Dashboard|Payment Desk|Students|Defaulters/i,
  });

  await writeReport(testInfo, "Protected Landing", [row]);

  expect(row.finalUrl).not.toMatch(/\/protected$/);
  expect(row.finalUrl).toMatch(/\/protected\/(dashboard|payments|students|defaulters)/);
  expect(row.hasFrameworkError).toBe(false);
});

test("exports expose representative workbook links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop-only export link smoke.");

  await requireAuthenticatedWorkspace(page);
  const row = await auditRoute(page, { route: "/protected/exports", identity: /Exports|XLSX|Download/i });

  const exportLinks = page.locator('a[href*="/protected/exports/"][href*="session="]');
  const linkCount = await exportLinks.count();

  if (process.env.SCHOOLFEES_READINESS_DOWNLOAD_EXPORTS === "1" && linkCount > 0) {
    const downloadPromise = page.waitForEvent("download");
    await exportLinks.first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  }

  await writeReport(testInfo, "Export Link Readiness", [row], [
    "",
    `Workbook links found: ${linkCount}`,
  ]);

  expect(linkCount).toBeGreaterThanOrEqual(3);
  expect(row.hasFrameworkError).toBe(false);
});
