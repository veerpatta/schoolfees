import { test } from "../fixtures";
import { reproCommand, screenshot } from "../lib/artifacts";
import { roleByKey, TEST_SESSION } from "../lib/identity";
import { roleHolds, type StaffRoleName } from "../surface/permissions";
import {
  INTERACTION_GATES,
  INTERACTION_GATE_DIMENSION,
  SEGMENT_ROLE_DIMENSION,
  type InteractionGate,
} from "../surface/interaction-gates";
import { SEGMENT_IDS } from "../surface/params";

/**
 * The gates spec 04 could not reach, and segment x role.
 *
 * Spec 04 asserts controls a page renders on load. Two gates were declared
 * uncovered because they only exist after a popover or a drawer is opened —
 * and the honest consequence was that `contacts:write` and the drawer's
 * `payments:view` redaction were checked by nothing at all.
 *
 * The rule this spec follows: an assertion it could not make is a finding, not
 * a silence. If the recipe cannot open the control, `harness.gate-unreachable`
 * fires and the run fails saying which permission went unasserted and why. A
 * green run whose green covers a permission nobody checked is the failure mode
 * the whole coverage ledger exists to prevent, and it would be a strange place
 * to reintroduce it.
 */

/**
 * Run a gate's `open` recipe.
 *
 * Each step takes the first *visible* candidate. Ordered candidates rather
 * than one locator because the control that opens a drawer is data-dependent:
 * a worklist with no rows has no row to click, and the shape of the row has
 * changed twice. Returns the step that failed, or null on success.
 */
async function driveOpen(
  page: import("@playwright/test").Page,
  gate: InteractionGate,
): Promise<string | null> {
  for (const step of gate.open) {
    let opened = false;

    for (const candidate of step.candidates) {
      const locator = page.locator(candidate).first();
      if (!(await locator.isVisible().catch(() => false))) continue;
      try {
        await locator.click({ timeout: 4000 });
        // The popover and the drawer both animate. Waiting on a settled DOM
        // rather than a fixed timeout, with a fixed timeout as the floor,
        // because an empty drawer settles instantly and a populated one does
        // not.
        await page.waitForTimeout(400);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        opened = true;
        break;
      } catch {
        // This candidate was visible but refused the click. Try the next.
      }
    }

    if (!opened) return step.describe;
  }

  return null;
}

test.describe("in-page gates behind an interaction", () => {
  for (const gate of INTERACTION_GATES) {
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
        // matter. Spec 03 owns that assertion.
        coverage.visit(INTERACTION_GATE_DIMENSION.id, gate.id);
        return;
      }

      const failedStep = await driveOpen(page, gate);

      if (failedStep) {
        // Visited, because the case ran and produced a result. The result is a
        // P1 that says the assertion did not happen — which is the difference
        // between a coverage gap and a lie.
        coverage.visit(INTERACTION_GATE_DIMENSION.id, gate.id);
        findings.record({
          rule: "harness.gate-unreachable",
          surface: `${gate.route} · ${gate.id}`,
          title: `${gate.permission} went unasserted for ${roleName}: could not open the control`,
          expected:
            `The recipe for ${gate.id} opens the control so the gate can be asserted. `
            + gate.note,
          actual:
            `Step "${failedStep}" matched no visible element, so the gate was not checked `
            + `for ${roleName}. Either the worklist had no rows in ${TEST_SESSION}, or the `
            + "control's markup moved and the candidate selectors in "
            + "tests/deep/surface/interaction-gates.ts are stale.",
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `interaction-${gate.id}-${role}-unreachable`),
            reproCommand: reproCommand({ target, grep: gate.id, project: `rbac-${role}` }),
          },
        });
        return;
      }

      const present = (await page.locator(gate.locator).count().catch(() => 0)) > 0;
      coverage.visit(INTERACTION_GATE_DIMENSION.id, gate.id);

      if (!shouldSee && present) {
        findings.record({
          rule: "rbac.guard-missing",
          surface: `${gate.route} · ${gate.id}`,
          title: `${roleName} reaches a control gated on ${gate.permission}`,
          expected: `${gate.note} ${roleName} does not hold ${gate.permission}.`,
          actual:
            `After opening the control, an element matching \`${gate.locator}\` is present.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `interaction-${gate.id}-${role}`),
            reproCommand: reproCommand({ target, grep: gate.id, project: `rbac-${role}` }),
          },
        });
      }

      if (shouldSee && !present) {
        findings.record({
          rule: "rbac.false-denial",
          surface: `${gate.route} · ${gate.id}`,
          title: `${roleName} cannot reach a control they hold ${gate.permission} for`,
          expected: `${gate.note} ${roleName} holds ${gate.permission} (${holdsPermission}).`,
          actual: `The control opened, but no element matched \`${gate.locator}\`.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `interaction-${gate.id}-${role}-missing`),
            reproCommand: reproCommand({ target, grep: gate.id, project: `rbac-${role}` }),
          },
        });
      }
    });
  }
});

/**
 * Every segment, as this role.
 *
 * Spec 04 asks whether a role can *see* a permission-gated chip. That is not
 * the same question as whether applying the filter works: a teacher opening a
 * bookmarked `?seg=…` link never touches the chip. This crosses all 27
 * segments with the running role and reports a segment that renders an error
 * for a role allowed to reach the page at all.
 */
test("every student segment renders for this role", async ({
  page,
  role,
  findings,
  target,
  coverage,
}) => {
  const roleName = roleByKey(role).role as StaffRoleName;

  for (const segment of SEGMENT_IDS) {
    const url =
      `/protected/students?seg=${encodeURIComponent(segment)}`
      + `&session=${encodeURIComponent(TEST_SESSION)}`;

    const response = await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch(() => null);

    coverage.pair(SEGMENT_ROLE_DIMENSION.id, segment, roleName);

    const status = response?.status() ?? 0;
    const landedOn = new URL(page.url()).pathname;

    // Redirected to access-denied is a correct answer, not a finding — spec 03
    // owns whether that redirect is the right one.
    if (landedOn.includes("access-denied") || landedOn.includes("/auth/login")) continue;

    if (status >= 500) {
      findings.record({
        rule: "route.500",
        surface: `/protected/students?seg=${segment}`,
        title: `Segment "${segment}" answers ${status} for ${roleName}`,
        expected:
          "Every segment in lib/segments/student-segments.ts renders for every role that "
          + "can reach /protected/students. A segment is a filter, not a permission.",
        actual: `HTTP ${status}.`,
        target,
        session: TEST_SESSION,
        role,
        evidence: {
          screenshot: await screenshot(page, `segment-${segment}-${role}`),
          reproCommand: reproCommand({
            target,
            grep: "every student segment",
            project: `rbac-${role}`,
          }),
        },
      });
    }
  }
});

/**
 * The student photo viewer's dismissal contract, in a real browser.
 *
 * This lives here rather than in tests/ui/interaction because the defect it
 * guards is unreachable from jsdom. The viewer pushes a history entry so the
 * Android back gesture closes the photo instead of leaving the students list,
 * and it pops that entry again on every other dismissal so the back button does
 * not go dead. Getting either half wrong is invisible to a render test: jsdom
 * does not deliver popstate from history.back(), so the broken implementation
 * passed all five unit tests.
 *
 * It broke twice while being written, both times only visible here. First the
 * viewer closed itself the frame it opened, because the history effect was
 * keyed on mount and StrictMode's remount turned its own teardown into what
 * looked like a back gesture. Then, once suppressed with a module flag, a stale
 * flag swallowed a real back and the whole page navigated away instead.
 */
test("the student photo viewer opens, and every dismissal leaves history balanced", async ({
  page,
  findings,
  target,
}) => {
  await page.goto(`/protected/students?session=${encodeURIComponent(TEST_SESSION)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  if (new URL(page.url()).pathname !== "/protected/students") return;

  // Both list shapes are in the DOM at once, one hidden by CSS at any width.
  const avatar = page.locator('button[aria-label$="photo"]:visible').first();
  if ((await avatar.count()) === 0) {
    // No student in this session carries a photo, so there is nothing to open.
    // Reported rather than passed silently: a green here would otherwise read
    // as "the viewer works" when nothing was exercised.
    findings.record({
      rule: "harness.gate-unreachable",
      surface: "/protected/students · photo-viewer",
      title: "The photo viewer went unasserted: no student in this session has a photo",
      expected: "At least one student carries photo_path so the viewer can be opened.",
      actual: `No visible avatar button on /protected/students in ${TEST_SESSION}.`,
      target,
      session: TEST_SESSION,
      evidence: { screenshot: await screenshot(page, "photo-viewer-unreachable") },
    });
    return;
  }

  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  const listUrl = page.url();

  for (const dismissal of ["escape", "backdrop", "back"] as const) {
    await avatar.click();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // Tapping the photo must not also open the student.
    if (page.url() !== listUrl) {
      findings.record({
        rule: "ui.photo-viewer-navigated",
        surface: "/protected/students · photo-viewer",
        title: "Tapping a student's photo opened the student instead of the photo",
        expected:
          "The avatar carries data-row-action, so the row's click handler ignores it.",
        actual: `The row navigated to ${new URL(page.url()).pathname}.`,
        target,
        session: TEST_SESSION,
        evidence: { screenshot: await screenshot(page, "photo-viewer-navigated") },
      });
      return;
    }

    if (dismissal === "escape") await page.keyboard.press("Escape");
    if (dismissal === "backdrop") await page.mouse.click(8, 8);
    if (dismissal === "back") await page.goBack();

    await dialog.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

    const stillOpen = (await dialog.count()) > 0;
    const leftTheList = new URL(page.url()).pathname !== "/protected/students";

    if (stillOpen || leftTheList) {
      findings.record({
        rule: "ui.photo-viewer-dismissal",
        surface: `/protected/students · photo-viewer · ${dismissal}`,
        title: `Dismissing the photo with ${dismissal} left the app in the wrong place`,
        expected:
          "Every dismissal closes the photo and leaves the browser on the students "
          + "list — the viewer pops the history entry it pushed.",
        actual: stillOpen
          ? "The viewer was still open afterwards."
          : `The browser left the list and landed on ${page.url()}.`,
        target,
        session: TEST_SESSION,
        evidence: { screenshot: await screenshot(page, `photo-viewer-${dismissal}`) },
      });
      return;
    }
  }
});
