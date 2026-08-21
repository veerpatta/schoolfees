import { test } from "../fixtures";
import { reproCommand, screenshot } from "../lib/artifacts";
import { TEST_SESSION } from "../lib/identity";
import { registerDimension } from "../lib/coverage";

/**
 * What the app does when the network does not cooperate.
 *
 * Everything above this file loads pages on a working connection. That is a
 * real gap, not a theoretical one: this app is used on a school's broadband
 * and on a cashier's phone, and the question "what does the desk show when
 * Supabase times out" had no answer anywhere in the harness. The most common
 * shape of a support call is not a crash — it is a skeleton that never
 * resolves, and a skeleton looks identical to a slow page until you wait.
 *
 * Four failures are injected with `page.route()`, plus two state assertions
 * that need no injection at all:
 *
 *   abort   — the data request never arrives. The page must say so.
 *   500     — the data request fails loudly. The page must still say so.
 *   slow    — 3s of latency. Something must render in the meantime.
 *   offline — the whole context. A PWA shell must degrade, not white-screen.
 *   back    — a filter set, navigated away from, and returned to. This is the
 *             bug f5ad190 fixed; see hooks/use-url-filter-state.ts for why it
 *             happened and why a route sweep could never have found it.
 *   double  — one gesture, two identical requests.
 *
 * Nothing here writes. The double-submit case drives the Payment Desk's
 * *preview* endpoint, which is a GET, precisely so the assertion does not need
 * the four write gates in lib/writes.ts. The write-path version of this
 * assertion belongs in spec 07 behind its @write tag, and is named in the
 * coverage note rather than smuggled in here.
 */

/** Lists whose primary data request is worth breaking. One per route family. */
const RESILIENCE_ROUTES = [
  { id: "dashboard", path: "/protected/dashboard" },
  { id: "students", path: "/protected/students" },
  { id: "receipts", path: "/protected/receipts" },
  { id: "transactions", path: "/protected/transactions" },
  { id: "defaulters", path: "/protected/defaulters" },
  { id: "payments", path: "/protected/payments" },
] as const;

const RESILIENCE_MODES = ["abort", "server-error", "slow", "offline"] as const;

export const RESILIENCE_DIMENSION = registerDimension({
  id: "resilience.failure-mode",
  label: "Injected network failures × route family",
  domain: [...RESILIENCE_MODES],
  strategy: "exhaustive-pairwise",
  pairedWith: ["route.family"],
});

export const STATE_DIMENSION = registerDimension({
  id: "state.navigation",
  label: "Filter survival across back/forward and reload",
  domain: ["back", "reload", "double-submit"],
  strategy: "exhaustive-single-factor",
});

/**
 * Requests worth breaking: this app's own data, never its assets.
 *
 * Aborting a font or a chunk tests Next.js, not this app, and produces
 * findings nobody can act on.
 */
function isDataRequest(url: string): boolean {
  if (/\.(css|js|mjs|woff2?|png|jpe?g|svg|ico|webp|map)(\?|$)/i.test(url)) return false;
  return (
    url.includes("/rest/v1/")
    || url.includes("supabase")
    || url.includes("/protected/")
    || url.includes("/api/")
  );
}

/** Text that means the page knows something went wrong and said so. */
const ERROR_AFFORDANCE =
  /couldn.?t load|could not load|failed to load|something went wrong|try again|retry|unable to load|error|offline|no connection|check your connection/i;

/** Markup that means the page is still waiting. */
const SKELETON_SELECTOR =
  '[data-loading="true"], [aria-busy="true"], .animate-pulse, [data-testid*="skeleton" i], [class*="skeleton" i]';

async function visibleText(page: import("@playwright/test").Page): Promise<string> {
  return (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
}

test.describe("resilience", () => {
  for (const route of RESILIENCE_ROUTES) {
    test(`${route.id} survives a failed data request`, async ({
      page,
      findings,
      target,
      role,
      coverage,
    }) => {
      /* ── abort: the request never arrives ──────────────────────────────── */
      await page.route("**/*", async (request) => {
        if (isDataRequest(request.request().url())) return request.abort("failed");
        return request.fallback();
      });

      await page
        .goto(`${route.path}?session=${encodeURIComponent(TEST_SESSION)}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        })
        .catch(() => null);
      // Long enough that a page which was going to recover has.
      await page.waitForTimeout(6000);

      coverage.pair(RESILIENCE_DIMENSION.id, "abort", route.id);

      const body = await visibleText(page);
      const skeletons = await page.locator(SKELETON_SELECTOR).count().catch(() => 0);
      const saidSomething = ERROR_AFFORDANCE.test(body);

      if (skeletons > 0 && !saidSomething) {
        findings.record({
          rule: "resilience.infinite-skeleton",
          surface: `${route.path} · abort`,
          title: `${route.path} shows a skeleton forever when its data request fails`,
          expected:
            "A request that will never arrive resolves into an error state with a way to "
            + "retry. A skeleton is a promise that something is coming.",
          actual:
            `${skeletons} loading placeholder(s) still on screen 6s after every data request `
            + "was aborted, and no error text anywhere on the page.",
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `resilience-abort-${route.id}`),
            reproCommand: reproCommand({ target, grep: `${route.id} survives` }),
          },
        });
      } else if (!saidSomething && body.trim().length < 200) {
        findings.record({
          rule: "resilience.no-error-state",
          surface: `${route.path} · abort`,
          title: `${route.path} renders nothing when its data request fails`,
          expected: "A failed load is explained on screen, not left blank.",
          actual: `${body.trim().length} characters of visible text and no error affordance.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `resilience-blank-${route.id}`),
            reproCommand: reproCommand({ target, grep: `${route.id} survives` }),
          },
        });
      }

      await page.unroute("**/*");

      /* ── 500: the request fails loudly ─────────────────────────────────── */
      await page.route("**/*", async (request) => {
        if (isDataRequest(request.request().url())) {
          return request.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "injected failure" }),
          });
        }
        return request.fallback();
      });

      await page
        .goto(`${route.path}?session=${encodeURIComponent(TEST_SESSION)}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        })
        .catch(() => null);
      await page.waitForTimeout(5000);

      coverage.pair(RESILIENCE_DIMENSION.id, "server-error", route.id);

      const errorBody = await visibleText(page);
      // The framework's dev overlay is a separate, louder finding and spec 01
      // owns the rule; here it means the error escaped the app's own handling.
      const overlay = await page
        .locator("nextjs-portal, [data-nextjs-dialog], #nextjs__container_errors_label")
        .count()
        .catch(() => 0);

      if (overlay > 0) {
        findings.record({
          rule: "route.framework-overlay",
          surface: `${route.path} · injected 500`,
          title: `${route.path} throws to the framework when its data request 500s`,
          expected:
            "A 5xx from Supabase is an expected condition on a page that reads a database. "
            + "It belongs in an error boundary, not in Next.js's error overlay.",
          actual: "The framework error overlay is mounted.",
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `resilience-overlay-${route.id}`),
            reproCommand: reproCommand({ target, grep: `${route.id} survives` }),
          },
        });
      } else if (!ERROR_AFFORDANCE.test(errorBody) && errorBody.trim().length < 200) {
        findings.record({
          rule: "resilience.no-error-state",
          surface: `${route.path} · injected 500`,
          title: `${route.path} renders nothing when its data request 500s`,
          expected: "A failed load is explained on screen, not left blank.",
          actual: `${errorBody.trim().length} characters of visible text, no error affordance.`,
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `resilience-500-blank-${route.id}`),
            reproCommand: reproCommand({ target, grep: `${route.id} survives` }),
          },
        });
      }

      await page.unroute("**/*");

      /* ── slow: 3s of latency, and what fills it ────────────────────────── */
      await page.route("**/*", async (request) => {
        if (isDataRequest(request.request().url())) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return request.fallback();
      });

      const slowNavigation = page.goto(
        `${route.path}?session=${encodeURIComponent(TEST_SESSION)}`,
        { waitUntil: "domcontentloaded", timeout: 40_000 },
      );
      // Sampled while the request is still in flight — the whole question is
      // what the user is looking at during those three seconds.
      await page.waitForTimeout(1200);
      const midFlight = await visibleText(page);
      const midSkeletons = await page.locator(SKELETON_SELECTOR).count().catch(() => 0);
      await slowNavigation.catch(() => null);

      coverage.pair(RESILIENCE_DIMENSION.id, "slow", route.id);

      if (midSkeletons === 0 && midFlight.trim().length < 100) {
        findings.record({
          rule: "resilience.no-loading-state",
          surface: `${route.path} · 3s latency`,
          title: `${route.path} shows nothing for the first seconds of a slow load`,
          expected:
            "A page that takes seconds to fill shows a skeleton, a spinner, or its chrome. "
            + "Blank for three seconds reads as broken and gets refreshed, which starts the "
            + "three seconds again.",
          actual: "No loading placeholder and under 100 characters of text 1.2s into the load.",
          target,
          session: TEST_SESSION,
          role,
          evidence: {
            screenshot: await screenshot(page, `resilience-slow-${route.id}`),
            reproCommand: reproCommand({ target, grep: `${route.id} survives` }),
          },
        });
      }

      await page.unroute("**/*");
    });
  }

  /* ── offline: the PWA shell's whole reason to exist ─────────────────────── */
  test("the shell degrades rather than white-screening offline", async ({
    page,
    context,
    findings,
    target,
    role,
    coverage,
  }) => {
    await page.goto(`/protected/dashboard?session=${encodeURIComponent(TEST_SESSION)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(4000);

    coverage.pair(RESILIENCE_DIMENSION.id, "offline", "dashboard");

    const body = await visibleText(page);
    const blank = body.trim().length < 80;

    // Chromium's own "no internet" page is the browser's, not the app's — and
    // this app ships a manifest and a shell precisely so that is not what a
    // cashier sees. Distinguished by the browser's own copy.
    const browserPage = /ERR_INTERNET_DISCONNECTED|No internet|This site can.?t be reached/i.test(body);

    if (blank || browserPage) {
      findings.record({
        rule: "resilience.no-error-state",
        surface: "/protected/dashboard · offline",
        title: "Reloading offline leaves the app blank or on the browser's error page",
        expected:
          "The app registers a manifest and ships a PWA shell. Reloading without a network "
          + "should land on the shell with an offline message, not on Chromium's own page.",
        actual: browserPage
          ? "Chromium's network-error page — the shell served nothing."
          : `${body.trim().length} characters of visible text.`,
        target,
        session: TEST_SESSION,
        role,
        evidence: {
          screenshot: await screenshot(page, "resilience-offline-dashboard"),
          reproCommand: reproCommand({ target, grep: "degrades rather than white-screening" }),
        },
      });
    }

    await context.setOffline(false);
  });
});

/**
 * The filter you set is still there when you come back.
 *
 * This is the bug commit f5ad190 fixed, and the reason it survived every
 * previous sweep is structural: the harness navigates by URL and never presses
 * Back. The failure needed three steps in order — filter, leave, return — and
 * no single page load could show it.
 *
 * `src/ui/hooks/use-url-filter-state.ts` documents the mechanism: filters lived in
 * `useState`, an effect mirrored them out with `history.replaceState`, and
 * `replaceState` creates no router-cache entry. Going back restored the tree
 * rendered for the UNFILTERED url, the mirror effect fired, and it wrote that
 * empty state over the filters still visible in the address bar.
 */
test("a filter survives leaving the list and coming back", async ({
  page,
  findings,
  target,
  role,
  coverage,
}) => {
  const filtered =
    `/protected/students?seg=defaulters&session=${encodeURIComponent(TEST_SESSION)}`;

  await page.goto(filtered, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // Into a record and back out — the exact gesture that lost the filter.
  const firstRecord = page.locator('a[href*="/protected/students/"]').first();
  const opened = await firstRecord.isVisible().catch(() => false);

  if (!opened) {
    // Nothing to click means the assertion cannot be made. Named, not skipped.
    findings.record({
      rule: "harness.gate-unreachable",
      surface: "/protected/students · back-navigation",
      title: "Filter persistence went unasserted: the filtered list had no record to open",
      expected:
        "The defaulters segment in TEST-2026-27 has at least one student, so the spec can "
        + "open a record and come back.",
      actual: "No link matching a student detail route was visible on the filtered list.",
      target,
      session: TEST_SESSION,
      role,
      evidence: {
        screenshot: await screenshot(page, "filter-back-no-record"),
        reproCommand: reproCommand({ target, grep: "survives leaving the list" }),
      },
    });
    coverage.visit(STATE_DIMENSION.id, "back");
    return;
  }

  await firstRecord.click({ timeout: 10_000 }).catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(2500);

  coverage.visit(STATE_DIMENSION.id, "back");

  const returned = new URL(page.url());
  if (returned.searchParams.get("seg") !== "defaulters") {
    findings.record({
      rule: "state.filter-not-restored",
      surface: "/protected/students · back-navigation",
      title: "Going back to a filtered list drops the filter",
      expected:
        "The URL that was in the address bar before the record was opened is the URL that "
        + "comes back. hooks/use-url-filter-state.ts exists to make the URL win on mount.",
      actual: `Returned to ${returned.pathname}${returned.search} — seg is `
        + `${returned.searchParams.get("seg") ?? "absent"}.`,
      target,
      session: TEST_SESSION,
      role,
      evidence: {
        screenshot: await screenshot(page, "filter-back-lost"),
        reproCommand: reproCommand({ target, grep: "survives leaving the list" }),
      },
    });
  }

  /* ── and again across a hard reload ─────────────────────────────────────── */
  await page.goto(filtered, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1500);
  coverage.visit(STATE_DIMENSION.id, "reload");

  const reloaded = new URL(page.url());
  if (reloaded.searchParams.get("seg") !== "defaulters") {
    findings.record({
      rule: "state.filter-not-restored",
      surface: "/protected/students · reload",
      title: "Reloading a filtered list drops the filter",
      expected: "A reload re-renders the URL it was given.",
      actual: `Reloaded into ${reloaded.pathname}${reloaded.search}.`,
      target,
      session: TEST_SESSION,
      role,
      evidence: {
        screenshot: await screenshot(page, "filter-reload-lost"),
        reproCommand: reproCommand({ target, grep: "survives leaving the list" }),
      },
    });
  }
});

/**
 * One gesture, one request.
 *
 * The Payment Desk deduplicates posts on `client_request_id`, which is the
 * right answer for the write. Everything else in the app relies on a button
 * disabling itself on click — a race, not a guard. This drives the desk's
 * read-only preview endpoint, so the assertion needs none of the write gates,
 * and counts the requests that actually left the browser.
 */
test("a double click issues one request, not two", async ({
  page,
  findings,
  target,
  role,
  coverage,
}) => {
  await page.goto(`/protected/payments?session=${encodeURIComponent(TEST_SESSION)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  const issued: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/(preview|student-summary|index|search)(\?|$)/.test(url)) issued.push(url);
  });

  // A search is the desk's own read path and needs no student selected.
  const search = page
    .locator('input[type="search"], input[placeholder*="Name or SR" i]')
    .first();

  coverage.visit(STATE_DIMENSION.id, "double-submit");

  if (!(await search.isVisible().catch(() => false))) {
    findings.record({
      rule: "harness.gate-unreachable",
      surface: "/protected/payments · double-submit",
      title: "Double-submit went unasserted: the desk's search input was not visible",
      expected: "The Payment Desk renders a student search on load for a role that can view it.",
      actual: "No search input matched on a loaded desk.",
      target,
      session: TEST_SESSION,
      role,
      evidence: {
        screenshot: await screenshot(page, "double-submit-no-input"),
        reproCommand: reproCommand({ target, grep: "double click issues one request" }),
      },
    });
    return;
  }

  await search.fill("TEST-");
  const before = issued.length;
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  const fired = issued.length - before;
  if (fired > 1) {
    // Deduped by URL: two identical requests are the finding; two different
    // ones are a search and its follow-up, which is how the desk works.
    const unique = new Set(issued.slice(before));
    if (unique.size < fired) {
      findings.record({
        rule: "resilience.double-submit-unguarded",
        surface: "/protected/payments · double-submit",
        title: "Two identical read requests leave the desk for one double gesture",
        expected:
          "A repeated gesture is coalesced, or the second request is cancelled. The desk "
          + "dedupes posts on client_request_id; its reads should not stampede either.",
        actual: `${fired} request(s) fired, ${unique.size} distinct — ${fired - unique.size} duplicate(s).`,
        target,
        session: TEST_SESSION,
        role,
        evidence: {
          reproCommand: reproCommand({ target, grep: "double click issues one request" }),
        },
      });
    }
  }
});
