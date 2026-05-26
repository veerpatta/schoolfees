import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const reportRoot = path.resolve(process.cwd(), "docs/smoke-reports/2026-05");
const artifactRoot = path.join(reportRoot, "playwright-artifacts");

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
    ["html", { outputFolder: path.join(reportRoot, "playwright-html") }],
  ],
  use: {
    baseURL: "https://schoolfees-two.vercel.app",
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        channel: "chrome",
        headless: false,
        viewport: { width: 1440, height: 900 },
        trace: "on",
        screenshot: "on",
        video: "retain-on-failure",
        recordHar: {
          path: path.join(reportRoot, "har/setup.har"),
          mode: "full",
          content: "embed",
        },
      },
    },
    {
      name: "desktop-chrome",
      testMatch: /(deep-smoke|special-flows)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: false,
        viewport: { width: 1440, height: 900 },
        storageState: path.resolve(process.cwd(), "tests/smoke-2026-05/.auth/admin.json"),
        recordHar: {
          path: path.join(reportRoot, "har/desktop.har"),
          mode: "full",
          content: "embed",
        },
      },
    },
    {
      name: "mobile-chrome",
      testMatch: /deep-smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome",
        headless: false,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: path.resolve(process.cwd(), "tests/smoke-2026-05/.auth/admin.json"),
        recordHar: {
          path: path.join(reportRoot, "har/mobile.har"),
          mode: "full",
          content: "embed",
        },
      },
    },
    {
      name: "tablet-chrome",
      testMatch: /deep-smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome",
        headless: false,
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        storageState: path.resolve(process.cwd(), "tests/smoke-2026-05/.auth/admin.json"),
        recordHar: {
          path: path.join(reportRoot, "har/tablet.har"),
          mode: "full",
          content: "embed",
        },
      },
    },
  ],
});
