import {
  test as base,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
  type Response as PlaywrightResponse,
} from "@playwright/test";

import { markPair, markVisited } from "./lib/coverage";

// Register every dimension in every worker, not just the ones a given spec
// happens to import. `markVisited` throws on an unknown dimension — which is
// the right behaviour, and the reason the device recording below needs the
// registry populated regardless of which spec is running.
import "./surface/routes";
import "./surface/params";
import "./surface/permissions";
import "./surface/devices";
import "./surface/negatives";
import "./surface/payment-cases";
import { discoverSubjects, type DiscoveredSubjects } from "./lib/discovery";
import { FindingSink, type RecordInput } from "./lib/findings";
import {
  resolveTarget,
  TEST_SESSION,
  withSession,
  type DeepTarget,
  type SmokeRoleKey,
} from "./lib/identity";
import { probeUrl, type PageAudit, type ProbeOptions, type ProbeResult } from "./lib/probe";
import { writeCoverageEvent, writeFinding, writeTiming } from "./lib/stream";

/**
 * The fixtures the whole harness runs on.
 *
 * `auditedPage` is the one that earns its place. Every spec in the old suite
 * attached its own `console` / `pageerror` / `response` listener triple and
 * detached them at the end of the function body — not in a `finally` — so a
 * throw mid-route leaked a listener onto the shared page and the next route
 * inherited the previous one's errors. As a fixture the listeners are attached
 * on create and removed on dispose, and that class of bug stops being possible.
 *
 * `subjects` is worker-scoped: discovery costs four navigations, and running it
 * once per spec was most of the old suite's startup.
 */

export type DeviceId = "desktop" | "tablet" | "mobile";

export type DeepFixtures = {
  target: DeepTarget;
  session: string;
  device: DeviceId;
  role: SmokeRoleKey;
  audit: PageAudit;
  auditedPage: Page;
  findings: FindingSink;
  coverage: {
    visit(dimension: string, value: string): void;
    pair(dimension: string, a: string, b: string): void;
  };
  probe: (url: string, options?: ProbeOptions) => Promise<ProbeResult>;
  withSession: (route: string) => string;
};

export type DeepWorkerFixtures = {
  subjects: DiscoveredSubjects;
};

/**
 * Project names encode both the device and the role, so one spec file can run
 * as five different staff members without ever asking the app who it is.
 *   desktop | tablet | mobile      -> admin, that device
 *   rbac-<roleKey>                 -> that role, desktop
 *   writes                         -> admin, desktop, @write-tagged specs
 */
function deviceFromProject(project: string): DeviceId {
  if (project.startsWith("mobile")) return "mobile";
  if (project.startsWith("tablet")) return "tablet";
  return "desktop";
}

function roleFromProject(project: string): SmokeRoleKey {
  const match = project.match(/^rbac-(.+)$/);
  return (match ? match[1] : "admin") as SmokeRoleKey;
}

export const test = base.extend<DeepFixtures, DeepWorkerFixtures>({
  target: async ({}, use) => {
    await use(resolveTarget());
  },

  session: async ({}, use) => {
    await use(TEST_SESSION);
  },

  device: async ({}, use, testInfo) => {
    await use(deviceFromProject(testInfo.project.name));
  },

  role: async ({}, use, testInfo) => {
    await use(roleFromProject(testInfo.project.name));
  },

  audit: async ({ page }, use) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === "error" || /hydration|react.*key|act\(/i.test(message.text())) {
        consoleErrors.push(message.text());
      }
    };
    const onPageError = (error: Error) => consoleErrors.push(`pageerror: ${error.message}`);
    const onResponse = (response: PlaywrightResponse) => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    const audit: PageAudit = {
      consoleErrors,
      networkErrors,
      drain() {
        const drained = {
          consoleErrors: [...consoleErrors],
          networkErrors: [...networkErrors],
        };
        consoleErrors.length = 0;
        networkErrors.length = 0;
        return drained;
      },
    };

    try {
      await use(audit);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    }
  },

  auditedPage: async ({ page, audit }, use) => {
    // `audit` is requested here purely so its listeners are attached before any
    // navigation a spec makes. Depending on it is the whole point.
    void audit;
    await use(page);
  },

  findings: async ({}, use) => {
    const sink = new FindingSink();
    const original = sink.record.bind(sink);

    // Every recorded finding streams to disk immediately: workers are separate
    // processes, and globalTeardown — where the gate lives — cannot see this
    // object. Writing on record rather than on flush also means a worker that
    // crashes still leaves behind what it found.
    sink.record = (input: RecordInput) => {
      const finding = original(input);
      if (finding.seenCount === 1) writeFinding(finding);
      return finding;
    };

    await use(sink);
  },

  coverage: async ({}, use) => {
    await use({
      visit(dimension: string, value: string) {
        markVisited(dimension, value);
        writeCoverageEvent({ kind: "visit", dimension, value });
      },
      pair(dimension: string, a: string, b: string) {
        markPair(dimension, a, b);
        writeCoverageEvent({ kind: "pair", dimension, a, b });
      },
    });
  },

  withSession: async ({ session }, use) => {
    await use((route: string) => withSession(route, session));
  },

  probe: async (
    { auditedPage, audit, findings, target, session, role, device },
    use,
    testInfo,
  ) => {
    const isRbac = testInfo.project.name.startsWith("rbac-");

    await use(async (url: string, options: ProbeOptions = {}) => {
      // Every probe is evidence that this viewport ran, wherever it ran from.
      // Recording it only inside the device spec left `desktop` reading as
      // unvisited on a run that had swept 40+ routes on a desktop.
      markVisited("device.viewport", device);
      writeCoverageEvent({ kind: "visit", dimension: "device.viewport", value: device });

      const result = await probeUrl(
        {
          page: auditedPage,
          audit,
          findings,
          target,
          session,
          role: isRbac ? role : null,
          device,
          grep: testInfo.title,
          project: testInfo.project.name,
        },
        url,
        options,
      );

      writeTiming({ surface: url, device, target, loadMs: result.loadMs });
      return result;
    });
  },

  subjects: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const request: APIRequestContext = context.request;

      try {
        const subjects = await discoverSubjects(request, page);
        await use(subjects);
      } finally {
        await context.close();
      }
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
