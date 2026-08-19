import path from "node:path";

import { defineConfig } from "@playwright/test";

import {
  availableRoles,
  baseUrlFor,
  resolveTarget,
  serverCommandFor,
  storageStatePath,
} from "./lib/identity";
import { DEVICE_PROFILES } from "./surface/devices";

/**
 * One config, three targets.
 *
 * `DEEP_TARGET=local` runs `next dev` through Playwright's `webServer`, which
 * the two older suites never had — they both pointed at production by default,
 * so a local run meant starting a server by hand and remembering to set a base
 * URL. `local-prod` builds and serves the production bundle, and `production`
 * attaches to the deployment.
 *
 * The distinction is not cosmetic: `next dev` emits strict-mode double renders
 * and a hydration overlay that production never shows, so `probe.ts` downgrades
 * console errors to P3 on `local`. Comparing a dev console against a production
 * one would leave the local leg permanently red for reasons no user ever sees.
 */

const target = resolveTarget();
const baseURL = baseUrlFor(target);
const command = serverCommandFor(target);
const roles = availableRoles();

const headed = process.env.DEEP_HEADED === "1";
const artifactRoot = path.resolve(
  process.cwd(),
  "docs/smoke-reports/deep",
  process.env.DEEP_RUN_ID ?? "current",
);

const deviceProject = (id: "desktop" | "tablet" | "mobile") => {
  const profile = DEVICE_PROFILES.find((entry) => entry.id === id)!;
  return {
    channel: "chrome" as const,
    headless: !headed,
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    storageState: storageStatePath("admin", target),
  };
};

export default defineConfig({
  testDir: path.resolve(process.cwd(), "tests/deep/specs"),
  globalSetup: path.resolve(process.cwd(), "tests/deep/global-setup.ts"),
  globalTeardown: path.resolve(process.cwd(), "tests/deep/global-teardown.ts"),
  // Generous, because a single spec walks 40+ routes. The per-action timeouts
  // below are what actually keep a hung page from eating the budget.
  timeout: 30 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(artifactRoot, "playwright-artifacts"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(artifactRoot, "playwright-html"), open: "never" }],
    ["json", { outputFile: path.join(artifactRoot, "playwright-results.json") }],
  ],
  webServer: command
    ? {
        command,
        // `/auth/login` is the cheapest page that proves the server is serving:
        // `/` redirects, and a redirect satisfies a URL check without proving
        // the app compiled.
        url: `${baseURL}/auth/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
  use: {
    baseURL,
    channel: "chrome",
    headless: !headed,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /00-auth\.setup\.ts/,
    },

    // The admin sweep: every route, every param, every export, on a desk.
    {
      name: "desktop",
      testMatch: /(01-routes|02-params|06-negatives|08-exports-imports)\.spec\.ts/,
      dependencies: ["setup"],
      use: deviceProject("desktop"),
    },

    // Layout and navigation only — the device dimension is paired with route
    // families, not with individual routes.
    {
      name: "tablet",
      testMatch: /05-devices\.spec\.ts/,
      dependencies: ["setup"],
      use: deviceProject("tablet"),
    },
    {
      name: "mobile",
      testMatch: /05-devices\.spec\.ts/,
      dependencies: ["setup"],
      use: deviceProject("mobile"),
    },

    // Writes are their own project so `--project=writes` is the only way to run
    // them, on top of the @write tag and DEEP_ALLOW_WRITES.
    {
      name: "writes",
      testMatch: /07-writes\.spec\.ts/,
      dependencies: ["setup"],
      use: deviceProject("desktop"),
    },

    // Resilience runs as one role, on a desk, because the question it asks —
    // what does this page do when its data never arrives — has the same answer
    // for everybody. Making it a role matrix would multiply the slowest specs
    // in the suite (each one deliberately waits out a 6s abort and a 3s
    // throttle) by five for no new information.
    //
    // Its own project rather than a line in `desktop` so a network-injection
    // spec can be run, and skipped, on its own: `--project=resilience`.
    {
      name: "resilience",
      testMatch: /10-resilience\.spec\.ts/,
      dependencies: ["setup"],
      use: deviceProject("desktop"),
    },

    // One project per role that has credentials. The RBAC and in-page-gate
    // specs read their role from the project name, so each run of the same file
    // is a different staff member looking at the same screens.
    ...roles.map((role) => ({
      name: `rbac-${role.key}`,
      // 09 joins 03 and 04 here rather than in `desktop`: the gates it drives
      // only mean something as a particular staff member, and the spec reads
      // its role from the project name exactly as the other two do.
      testMatch: /(03-rbac-matrix|04-inpage-gates|09-interaction-gates)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        channel: "chrome" as const,
        headless: !headed,
        viewport: { width: 1440, height: 900 },
        storageState: storageStatePath(role.key, target),
      },
    })),
  ],
});
