import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const artifactRoot = process.env.SCHOOLFEES_READINESS_ARTIFACT_DIR
  ? path.resolve(process.env.SCHOOLFEES_READINESS_ARTIFACT_DIR)
  : path.join(os.tmpdir(), "schoolfees-readiness-smoke");

const storageState = [
  process.env.SCHOOLFEES_READINESS_STORAGE_STATE,
  path.resolve(process.cwd(), "tests/smoke-readiness/.auth/admin.json"),
  path.resolve(process.cwd(), "tests/smoke-2026-05/.auth/admin.json"),
].find((candidate) => candidate && existsSync(candidate));

const sharedUse = {
  baseURL: process.env.SCHOOLFEES_READINESS_BASE_URL ?? "https://schoolfees-two.vercel.app",
  channel: process.env.SCHOOLFEES_READINESS_BROWSER_CHANNEL ?? "chrome",
  headless: process.env.SCHOOLFEES_READINESS_HEADED !== "1",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "retain-on-failure",
  acceptDownloads: true,
  actionTimeout: 10_000,
  navigationTimeout: 45_000,
  ...(storageState ? { storageState } : {}),
} as const;

export default defineConfig({
  testDir: path.resolve(process.cwd(), "tests/smoke-readiness"),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(artifactRoot, "playwright"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(artifactRoot, "html"), open: "never" }],
    ["json", { outputFile: path.join(artifactRoot, "results.json") }],
  ],
  use: sharedUse,
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...sharedUse,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        ...sharedUse,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
