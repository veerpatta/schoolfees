import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { availableRoles, storageStatePath, SMOKE_BASE_URL } from "./roles";

const reportRoot = path.resolve(process.cwd(), "docs/smoke-reports/2026-05");
const artifactRoot = path.join(reportRoot, "playwright-artifacts");

// Headed and full-trace/HAR recording were the defaults. They are excellent for
// debugging one flow and unusable for a sweep of 44 routes x 3 viewports x 5
// roles: it needs a display, and embedded-content HAR runs to gigabytes. Both
// are now opt-in, matching how tests/smoke-readiness already works.
const headed = process.env.SMOKE_HEADED === "1";
const recordHar = process.env.SMOKE_RECORD_HAR === "1";

function harFor(name: string) {
  return recordHar
    ? {
        recordHar: {
          path: path.join(reportRoot, `har/${name}.har`),
          mode: "full" as const,
          content: "embed" as const,
        },
      }
    : {};
}

const roles = availableRoles();

export default defineConfig({
  testDir: path.resolve(process.cwd(), "tests/smoke-2026-05"),
  timeout: 3_600_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: artifactRoot,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(reportRoot, "playwright-html"), open: "never" }],
  ],
  use: {
    baseURL: SMOKE_BASE_URL,
    channel: "chrome",
    headless: !headed,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...harFor("setup") },
    },
    {
      name: "desktop-chrome",
      testMatch: /(deep-smoke|special-flows)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: !headed,
        viewport: { width: 1440, height: 900 },
        storageState: storageStatePath("admin"),
        ...harFor("desktop"),
      },
    },
    {
      name: "mobile-chrome",
      testMatch: /deep-smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome",
        headless: !headed,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: storageStatePath("admin"),
        ...harFor("mobile"),
      },
    },
    {
      name: "tablet-chrome",
      testMatch: /deep-smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome",
        headless: !headed,
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        storageState: storageStatePath("admin"),
        ...harFor("tablet"),
      },
    },
    // One project per role that has credentials. The RBAC spec reads its role
    // from the project name, so each run of the same file is a different staff
    // member looking at the same 44 routes.
    ...roles.map((role) => ({
      name: `rbac-${role.key}`,
      testMatch: /rbac\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome" as const,
        headless: !headed,
        viewport: { width: 1440, height: 900 },
        storageState: storageStatePath(role.key),
      },
    })),
  ],
});
