import { test } from "../fixtures";
import { reproCommand, screenshot } from "../lib/artifacts";
import { roleByKey, TEST_SESSION } from "../lib/identity";
import {
  IN_PAGE_GATES,
  IN_PAGE_GATE_DIMENSION,
  roleHolds,
  type StaffRoleName,
} from "../surface/permissions";
import { PERMISSION_GATED_SEGMENTS } from "../surface/params";

/**
 * The permission gates that live inside a page.
 *
 * Route-level RBAC is the cheap half, and spec 03 covers it exhaustively. These
 * are the ones where the page renders for everybody and only the *controls*
 * differ — a "Read only access" badge where a Collect button should be. A
 * missing in-page gate is invisible to a route sweep, and it is the half that
 * lets somebody post money.
 *
 * Only roles that discriminate are visited, which is why this is about two
 * dozen cases rather than eight gates x five roles.
 */

test.describe("in-page permission gates", () => {
  for (const gate of IN_PAGE_GATES) {
    test(`${gate.id}`, async ({ page, role, findings, target, coverage }) => {
      const smokeRole = roleByKey(role);
      const roleName = smokeRole.role as StaffRoleName;
      const shouldSee = gate.presentFor.includes(roleName);
      const holdsPermission = roleHolds(roleName, gate.permission);

      await page.goto(`${gate.route}?session=${encodeURIComponent(TEST_SESSION)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      const landedOn = new URL(page.url()).pathname;
      if (landedOn !== gate.route) {
        // The route guard turned this role away before the in-page gate could
        // matter. Spec 03 owns that assertion; nothing to check here.
        coverage.visit(IN_PAGE_GATE_DIMENSION.id, gate.id);
        return;
      }

      const present = (await page.locator(gate.locator).count().catch(() => 0)) > 0;
      coverage.visit(IN_PAGE_GATE_DIMENSION.id, gate.id);

      if (!shouldSee && present) {
        findings.record({
          rule: "rbac.guard-missing",
          surface: `${gate.route} · ${gate.id}`,
          title: `${roleName} can see a control gated on ${gate.permission}`,
          expected: `${gate.note} ${roleName} does not hold ${gate.permission}.`,
          actual: `Control matching \`${gate.locator}\` is present and visible.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `gate-${gate.id}-${role}`),
            reproCommand: reproCommand({ target, grep: gate.id, project: `rbac-${role}` }),
          },
        });
      }

      if (shouldSee && !present) {
        findings.record({
          rule: "rbac.false-denial",
          surface: `${gate.route} · ${gate.id}`,
          title: `${roleName} cannot see a control they hold ${gate.permission} for`,
          expected: `${gate.note} ${roleName} holds ${gate.permission} (${holdsPermission}).`,
          actual: `No element matched \`${gate.locator}\`.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `gate-${gate.id}-${role}-missing`),
            reproCommand: reproCommand({ target, grep: gate.id, project: `rbac-${role}` }),
          },
        });
      }
    });
  }
});

test("permission-gated segment chips are hidden, not shown as zero", async ({
  page,
  role,
  findings,
  target,
}) => {
  const smokeRole = roleByKey(role);
  const roleName = smokeRole.role as StaffRoleName;

  await page.goto(`/protected/students?session=${encodeURIComponent(TEST_SESSION)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  for (const segment of PERMISSION_GATED_SEGMENTS) {
    const holds = roleHolds(roleName, segment.permission);
    // The chip is hidden rather than rendered as a zero count, because a zero a
    // role is not allowed to compute is a lie, not a filter.
    const chip = page.locator(`[data-segment="${segment.id}"], a[href*="seg=${segment.id}"]`);
    const present = (await chip.count().catch(() => 0)) > 0;

    if (!holds && present) {
      findings.record({
        rule: "rbac.guard-missing",
        surface: `/protected/students · seg=${segment.id}`,
        title: `${roleName} sees the "${segment.id}" chip without ${segment.permission}`,
        expected: `The chip is hidden from a role lacking ${segment.permission}.`,
        actual: "The chip is rendered.",
        target,
        session: TEST_SESSION,
        role,
        evidence: {
          reproCommand: reproCommand({
            target,
            grep: "permission-gated segment",
            project: `rbac-${role}`,
          }),
        },
      });
    }
  }
});
