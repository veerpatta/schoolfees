import { test } from "../fixtures";
import { reproCommand, screenshot } from "../lib/artifacts";
import { TEST_SESSION } from "../lib/identity";
import { DEVICE_DIMENSION } from "../surface/devices";
import { FAMILY_DIMENSION, ROUTE_FAMILIES } from "../surface/routes";

/**
 * The same screens on a tablet and a phone.
 *
 * Paired with route *families* rather than routes: a layout break belongs to a
 * component family, not a URL — the students list and the defaulters list share
 * their table shell, so visiting both on three devices buys almost nothing over
 * visiting one. 14 families is 28 loads across the two non-desktop projects;
 * 44 pages would be 88 for the same signal.
 *
 * The phone is not a narrower desktop here. It has its own screens, its own
 * bottom nav, and takeover routes that hide the tab bar, so the checks below
 * are about those rather than about CSS.
 */

test.describe.configure({ mode: "serial" });

test("route families render without overflow on this device", async ({
  probe,
  coverage,
  subjects,
  device,
  withSession,
}) => {
  for (const [family, route] of Object.entries(ROUTE_FAMILIES)) {
    const concrete = route.includes(":id")
      ? subjects.writeSubject
        ? route.replace(":id", subjects.writeSubject.id)
        : null
      : route;

    if (!concrete) continue;

    await probe(withSession(concrete), { axe: device === "desktop" });
    coverage.visit(FAMILY_DIMENSION.id, family);
    coverage.pair(FAMILY_DIMENSION.id, device, family);
    coverage.visit(DEVICE_DIMENSION.id, device);
  }
});

test("phone and tablet keep their primary navigation", async ({
  page,
  device,
  findings,
  target,
}) => {
  test.skip(device === "desktop", "The bottom nav is a phone and tablet affordance.");

  await page.goto(`/protected/dashboard?session=${encodeURIComponent(TEST_SESSION)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  const nav = await page
    .locator("nav")
    .filter({ hasText: /home|students|collect|transactions|calls/i })
    .count()
    .catch(() => 0);

  if (nav === 0) {
    findings.record({
      rule: "ux.observation",
      surface: `/protected/dashboard (${device})`,
      title: `No primary navigation detected on ${device}`,
      expected: "A phone or tablet keeps a reachable bottom navigation.",
      actual: "No nav element containing the expected mobile labels was found.",
      target,
      session: TEST_SESSION,
      device,
      suspectedFile: "src/ui/shell/mobile-bottom-nav.tsx",
      evidence: {
        screenshot: await screenshot(page, `no-bottom-nav-${device}`),
        reproCommand: reproCommand({ target, grep: "primary navigation", project: device }),
      },
    });
  }
});

test("a takeover route hides the tab bar and offers a way back", async ({
  page,
  device,
  subjects,
  findings,
  target,
}) => {
  test.skip(device !== "mobile", "Takeover behaviour is phone-specific.");
  test.skip(!subjects.writeSubject, "No discovered student to open.");

  const route = `/protected/students/${subjects.writeSubject!.id}?session=${encodeURIComponent(TEST_SESSION)}`;
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // isMobileTakeoverRoute() matches /protected/students/, so the tab bar is
  // replaced by a back affordance. Losing the back arrow strands a phone user
  // on a record with no way out but the browser chrome.
  const back = await page
    .locator('a[aria-label*="back" i], button[aria-label*="back" i], a:has-text("Back")')
    .count()
    .catch(() => 0);

  if (back === 0) {
    findings.record({
      rule: "ux.observation",
      surface: route,
      title: "Phone takeover route has no visible way back",
      expected: "A takeover route replaces the tab bar with a back affordance.",
      actual: "No back link or button was found.",
      target,
      session: TEST_SESSION,
      device,
      evidence: {
        screenshot: await screenshot(page, "no-back-on-takeover"),
        reproCommand: reproCommand({ target, grep: "takeover route", project: "mobile" }),
      },
    });
  }
});
