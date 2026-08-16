import { expect, test } from "../fixtures";
import { reproCommand } from "../lib/artifacts";
import { roleByKey, TEST_SESSION } from "../lib/identity";
import {
  GUARDED_ROUTES,
  GUARD_DIMENSION,
  ROLE_DIMENSION,
  shouldReach,
  type StaffRoleName,
} from "../surface/permissions";

/**
 * Every guarded route, seen by every role.
 *
 * This is the one pair worth covering exhaustively. A page whose permission
 * guard is missing or wrong renders perfectly — it looks like a working page,
 * and no amount of admin sweeping will ever show it. The only way to see it is
 * to visit as somebody who should have been turned away.
 *
 * The project name carries the role (`rbac-teacher`), so this file runs once per
 * staff login and each run is a different person looking at the same 29 routes.
 */

test.describe("permission matrix", () => {
  for (const guard of GUARDED_ROUTES) {
    test(`${guard.path}`, async ({ page, role, findings, target, coverage }) => {
      const smokeRole = roleByKey(role);
      const roleName = smokeRole.role as StaffRoleName;
      const expected = shouldReach(roleName, guard);

      const response = await page.goto(
        `${guard.path}?session=${encodeURIComponent(TEST_SESSION)}`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      // A denial is `redirect("/protected/access-denied?permission=…")` in a
      // Server Component, and this app streams — so Next answers 200 with the
      // shell and the browser moves during hydration, after networkidle.
      // Reading the URL at this point reported every correct denial as a
      // missing guard: 41 false P0s on the first run. Waiting for the URL to
      // settle resolves the moment a denied route redirects and costs the
      // timeout only on routes the role may actually reach.
      await page
        .waitForURL((candidate) => candidate.pathname !== guard.path, { timeout: 2_500 })
        .catch(() => {});

      const status = response?.status() ?? 0;
      const landedOn = new URL(page.url()).pathname;
      const allowed = landedOn === guard.path;
      const denied = landedOn.startsWith("/protected/access-denied");
      const bouncedToLogin = landedOn.startsWith("/auth/");

      coverage.pair(GUARD_DIMENSION.id, roleName, guard.path);
      coverage.visit(ROLE_DIMENSION.id, roleName);

      // A stored session that has expired invalidates the whole run, so say so
      // loudly rather than reporting 29 false denials.
      expect(
        bouncedToLogin,
        `${roleName} was signed out visiting ${guard.path} — re-run the setup project`,
      ).toBe(false);

      if (status >= 500) {
        findings.record({
          rule: "route.500",
          surface: guard.path,
          title: `${roleName} got HTTP ${status} on ${guard.path}`,
          expected: "A permission decision is a redirect, never a server error.",
          actual: `HTTP ${status}, landed on ${landedOn}`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            reproCommand: reproCommand({
              target,
              grep: guard.path,
              project: `rbac-${role}`,
            }),
          },
        });
      }

      if (expected && !allowed) {
        findings.record({
          rule: "rbac.false-denial",
          surface: guard.path,
          title: `${roleName} was denied a route they hold permission for`,
          expected: `${roleName} holds ${guard.anyOf.join(" or ") || "no requirement"} and should reach ${guard.path}.`,
          actual: `Landed on ${landedOn}${denied ? " (access-denied)" : ""}.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            reproCommand: reproCommand({ target, grep: guard.path, project: `rbac-${role}` }),
          },
        });
      }

      if (!expected && allowed) {
        // The bug this file exists to find. A missing guard renders a normal
        // screen, and on a route like /protected/payments/bulk that screen
        // posts real receipts.
        findings.record({
          rule: "rbac.guard-missing",
          surface: guard.path,
          title: `${roleName} rendered a route they must not reach`,
          expected: `${roleName} lacks ${guard.anyOf.join(" or ")} and should land on /protected/access-denied.`,
          actual: `Rendered ${guard.path} with HTTP ${status}.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            reproCommand: reproCommand({ target, grep: guard.path, project: `rbac-${role}` }),
          },
        });
      }

      // Assert too, so the Playwright report is useful on its own; the findings
      // above are what the merged report and the gate read.
      if (expected) {
        expect(allowed, `${roleName} should reach ${guard.path}, landed on ${landedOn}`).toBe(true);
      } else {
        expect(allowed, `${roleName} must not render ${guard.path}`).toBe(false);
      }
    });
  }
});

test("each role lands on its own default route", async ({ page, role, findings, target }) => {
  const smokeRole = roleByKey(role);
  await page.goto("/protected", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  // Same streaming redirect as above: /protected renders a shell and moves the
  // browser during hydration.
  await page
    .waitForURL((candidate) => candidate.pathname !== "/protected", { timeout: 8_000 })
    .catch(() => {});

  const landedOn = new URL(page.url()).pathname;
  if (!landedOn.startsWith(smokeRole.landing)) {
    findings.record({
      rule: "rbac.false-denial",
      surface: "/protected",
      title: `${smokeRole.role} landed on ${landedOn} instead of ${smokeRole.landing}`,
      expected: `getDefaultProtectedHref("${smokeRole.role}") returns ${smokeRole.landing}.`,
      actual: `Landed on ${landedOn}.`,
      target,
      session: TEST_SESSION,
      role,
      evidence: {
        reproCommand: reproCommand({ target, grep: "default route", project: `rbac-${role}` }),
      },
    });
  }

  expect(landedOn, `${smokeRole.role} default landing`).toContain(smokeRole.landing);
});
