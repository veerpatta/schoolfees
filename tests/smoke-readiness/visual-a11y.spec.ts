import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TEST_SESSION = "TEST-2026-27";
const workspaces = [
  "dashboard",
  "students",
  "fee-setup",
  "payments",
  "transactions",
  "defaulters",
  "exports",
  "admin-tools",
] as const;

type Finding = {
  workspace: string;
  url: string;
  navigationMs: number;
  consoleErrors: string[];
  serverErrors: string[];
  accessibilityViolations: Array<{ id: string; impact: string | null; nodes: number }>;
  focusVisible: boolean;
  horizontalOverflowPx: number;
};

async function requireAuthenticatedTestSession(page: Page) {
  await page.goto(`/protected/dashboard?session=${TEST_SESSION}`, { waitUntil: "domcontentloaded" });
  if (/\/auth\/login/i.test(page.url())) {
    throw new Error(
      "Authenticated visual QA is required. Run `npm run smoke:readiness:auth` once; the gitignored state must never be committed.",
    );
  }
}

test.describe.configure({ mode: "serial" });

test("capture daily-workspace visual, accessibility, focus, overflow, and timing evidence", async ({
  page,
}, testInfo) => {
  await requireAuthenticatedTestSession(page);
  const findings: Finding[] = [];

  for (const workspace of workspaces) {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    };
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    };
    page.on("console", onConsole);
    page.on("response", onResponse);

    const startedAt = Date.now();
    await page.goto(`/protected/${workspace}?session=${TEST_SESSION}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
    const navigationMs = Date.now() - startedAt;

    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      return active instanceof HTMLElement && active !== document.body && active.matches(":focus-visible");
    });
    const horizontalOverflowPx = await page.evaluate(
      () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    const axe = await new AxeBuilder({ page }).analyze();
    const seriousViolations = axe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );

    const screenshotPath = testInfo.outputPath(`${workspace}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`${workspace}-${testInfo.project.name}`, {
      path: screenshotPath,
      contentType: "image/png",
    });

    findings.push({
      workspace,
      url: page.url(),
      navigationMs,
      consoleErrors,
      serverErrors,
      accessibilityViolations: seriousViolations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
      focusVisible,
      horizontalOverflowPx,
    });
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  const reportPath = testInfo.outputPath("workspace-findings.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(findings, null, 2), "utf8");
  await testInfo.attach("workspace-findings", { path: reportPath, contentType: "application/json" });

  expect(findings.flatMap((finding) => finding.consoleErrors)).toEqual([]);
  expect(findings.flatMap((finding) => finding.serverErrors)).toEqual([]);
  expect(findings.filter((finding) => finding.horizontalOverflowPx > 1)).toEqual([]);
  expect(findings.filter((finding) => !finding.focusVisible)).toEqual([]);
  expect(findings.flatMap((finding) => finding.accessibilityViolations)).toEqual([]);
});
