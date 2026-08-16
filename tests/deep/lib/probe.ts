import type { Page } from "@playwright/test";

import { screenshot, reproCommand } from "./artifacts";
import type { FindingSink, RuleId, Severity } from "./findings";
import type { DeepTarget, SmokeRoleKey } from "./identity";
import { collectAxeViolations, collectPageHealth, EMPTY_HEALTH, hasVisibleFocus, type PageHealth } from "./health";
import { exerciseSafeInteractions } from "./interactions";

/**
 * One route, one verdict.
 *
 * This is the function the whole sweep is built on, and the reason it exists
 * once rather than three times: `deep-smoke.spec.ts` and `special-flows.spec.ts`
 * each carried their own copy, and the copies had already drifted.
 *
 * Two behaviours worth naming:
 *
 *  - The console/pageerror/response listeners are attached by the `auditedPage`
 *    fixture, not here, and drained per probe. The old `auditRoute` attached
 *    them itself and detached them at the end of the function body — not in a
 *    `finally` — so any throw leaked a listener onto the shared page and the
 *    next route inherited the previous one's errors.
 *  - `confirmRuns` re-probes before a heuristic rule is allowed to gate. A cold
 *    Vercel lambda answering in 6 seconds once is not a performance bug.
 */

export type PageAudit = {
  /** Console errors + page errors observed since the last drain. */
  consoleErrors: string[];
  networkErrors: string[];
  drain(): { consoleErrors: string[]; networkErrors: string[] };
};

export type ProbeContext = {
  page: Page;
  audit: PageAudit;
  findings: FindingSink;
  target: DeepTarget;
  session: string;
  role: SmokeRoleKey | null;
  device: string;
  /** Test-title fragment used to build the repro command. */
  grep: string;
  project?: string;
};

export type ProbeOptions = {
  /** A route that legitimately 404s (a deliberately bad id, for instance). */
  allow404?: boolean;
  /** Assert the not-found treatment RENDERED, since the status will be 200. */
  expectNotFound?: boolean;
  /** A 4xx that is the expected answer — permission denials, mostly. */
  allowClientError?: boolean;
  expectedRedirect?: RegExp;
  /** Text that must appear for the route to count as rendered. */
  identity?: RegExp;
  /** Skip the click-around pass; used for negative and API-shaped probes. */
  interact?: boolean;
  /** Run axe. Off by default — it is the slowest check by an order of magnitude. */
  axe?: boolean;
  /** Re-probe before letting a heuristic rule gate. */
  confirmRuns?: number;
  /** Extra note recorded with the coverage row. */
  label?: string;
};

export type ProbeResult = {
  url: string;
  finalUrl: string;
  status: number | null;
  loadMs: number;
  health: PageHealth;
  consoleErrors: string[];
  networkErrors: string[];
  interactions: number;
  bouncedToLogin: boolean;
  ok: boolean;
  notes: string;
};

const SLOW_RENDER_MS = 5_000;

/** How this app words a record that is not there. */
const NOT_FOUND_TEXT =
  /not found|could not be found|no such|does not exist|404|we couldn't find/i;

export async function probeUrl(
  ctx: ProbeContext,
  url: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const { page, audit, findings } = ctx;
  audit.drain();

  const startedAt = Date.now();
  let status: number | null = null;
  let ok = true;
  let notes = "";

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {
      notes = "networkidle timed out; DOM was still captured";
    });

    // A server `redirect()` in this app does NOT arrive as an HTTP 3xx. Next
    // streams the shell, answers 200, and carries the redirect in the RSC
    // payload, so the browser moves after hydration — which is after
    // `networkidle`. Sampling `page.url()` once at this point reported all four
    // legacy aliases and the `/protected` root as broken when every one of them
    // works. Waiting for the destination is the only honest way to ask.
    if (options.expectedRedirect) {
      await page
        .waitForURL(options.expectedRedirect, { timeout: 15_000 })
        .catch(() => {
          notes = `${notes} did not reach ${options.expectedRedirect} within 15s`.trim();
        });
    }
  } catch (error) {
    ok = false;
    notes = error instanceof Error ? error.message : String(error);
  }

  const loadMs = Date.now() - startedAt;
  const finalUrl = page.url();
  const bouncedToLogin = /\/auth\/(login|confirm)/.test(finalUrl) && !url.includes("/auth/");
  const health = await collectPageHealth(page).catch(() => ({ ...EMPTY_HEALTH }));
  const interactions = options.interact === false
    ? 0
    : (await exerciseSafeInteractions(page).catch(() => ({ clicked: 0, searched: 0, labels: [] })))
        .clicked;

  const drained = audit.drain();

  const record = (
    rule: RuleId,
    title: string,
    expected: string,
    actual: string,
    extra: { severity?: Severity; suspectedFile?: string; shot?: string } = {},
  ) =>
    findings.record({
      rule,
      severity: extra.severity,
      surface: url,
      title,
      expected,
      actual,
      target: ctx.target,
      session: ctx.session,
      role: ctx.role,
      device: ctx.device,
      suspectedFile: extra.suspectedFile,
      evidence: {
        screenshot: extra.shot,
        consoleTail: drained.consoleErrors.slice(0, 6),
        networkTail: drained.networkErrors.slice(0, 6),
        request: status === null ? undefined : { method: "GET", url, status },
        reproCommand: reproCommand({ target: ctx.target, grep: ctx.grep, project: ctx.project }),
      },
    });

  // A screenshot is only taken when there is something to show. Capturing one
  // per route across three devices was most of the old suite's wall clock.
  const needsShot =
    (status !== null && status >= 500) ||
    health.hasFrameworkOverlay ||
    bouncedToLogin ||
    (options.expectedRedirect && !options.expectedRedirect.test(finalUrl)) ||
    (options.identity && !options.identity.test(health.bodyText));

  const shot = needsShot ? await screenshot(page, `${ctx.device}-${url}`) : undefined;

  if (status !== null && status >= 500) {
    record(
      "route.500",
      `Server error on ${url}`,
      "A protected route renders without a 500.",
      `HTTP ${status}. Final URL ${finalUrl}.`,
      { shot },
    );
  }

  if (health.hasFrameworkOverlay) {
    record(
      "route.framework-overlay",
      `Framework error overlay on ${url}`,
      "The route renders the app, not a framework error surface.",
      health.bodyText.slice(0, 600),
      { shot },
    );
  }

  if (options.expectedRedirect && !options.expectedRedirect.test(finalUrl)) {
    record(
      "alias.no-redirect",
      `Legacy alias did not redirect: ${url}`,
      `Final URL should match ${options.expectedRedirect}.`,
      `Landed on ${finalUrl}.`,
      { shot },
    );
  }

  if (options.identity && !options.identity.test(health.bodyText) && !bouncedToLogin) {
    record(
      "route.404-expected-200",
      `Route did not render its own content: ${url}`,
      `Body should match ${options.identity}.`,
      `Body began: ${health.bodyText.slice(0, 240)}`,
      { shot },
    );
  }

  if (!options.allow404 && !options.allowClientError && status === 404) {
    record(
      "route.404-expected-200",
      `Unexpected 404 on ${url}`,
      "A route listed in the surface inventory should exist.",
      `HTTP 404 at ${finalUrl}.`,
      { shot },
    );
  }

  // `notFound()` does not produce an HTTP 404 here either — same streaming
  // reason as the redirect above. So "this id does not exist" is a question
  // about what rendered, not about a status code.
  //
  // What it finds in practice is not a wrong status but an empty one: a stale
  // link renders the workspace chrome and nothing else — no message, no "no
  // such student", no way back. To an office clerk that is indistinguishable
  // from a broken page, which is why it is recorded rather than shrugged at.
  if (options.expectNotFound && !NOT_FOUND_TEXT.test(health.bodyText)) {
    const chromeOnly = health.bodyText.replace(/\s+/g, " ").trim().length < 400;
    record(
      "ux.observation",
      chromeOnly
        ? `A missing record renders an empty workspace: ${url}`
        : `A junk identifier rendered a page: ${url}`,
      "An id that cannot exist says so — a not-found message, not a blank content area.",
      chromeOnly
        ? `Only the navigation chrome rendered (${health.bodyText.trim().length} chars of text, ` +
          `no message). Body: ${health.bodyText.slice(0, 200)}`
        : `Body began: ${health.bodyText.slice(0, 240)}`,
      { shot },
    );
  }

  // Pulled out of the console-error bucket before it is counted, because these
  // two are not observations — they are a server throw and a broken render, and
  // in a production build both arrive wearing the same anonymous console
  // wrapper as a stray warning.
  const serverErrors = drained.consoleErrors.filter((message) =>
    /error occurred in the Server Components render/i.test(message),
  );
  const hydrationErrors = drained.consoleErrors.filter((message) =>
    /Minified React error #(418|419|423|425)|Hydration failed|did not match/i.test(message),
  );
  const otherConsoleErrors = drained.consoleErrors.filter(
    (message) => !serverErrors.includes(message) && !hydrationErrors.includes(message),
  );

  if (serverErrors.length > 0) {
    record(
      "route.server-component-error",
      `A Server Component threw on ${url}`,
      "A malformed parameter is handled — skipped, defaulted, or shown as an " +
        "error — never allowed to throw out of a Server Component.",
      serverErrors.slice(0, 3).join("\n"),
      { shot: shot ?? (await screenshot(page, `server-error-${url}`)) },
    );
  }

  if (hydrationErrors.length > 0) {
    record(
      "route.hydration-mismatch",
      `Hydration failed on ${url}`,
      "The server-rendered HTML matches what the client renders.",
      hydrationErrors.slice(0, 3).join("\n"),
      { shot },
    );
  }

  if (otherConsoleErrors.length > 0) {
    // `next dev` emits strict-mode double renders and hydration diagnostics
    // that production never shows. Comparing the two would make the local leg
    // permanently red for reasons that do not reach a user.
    const severity: Severity | undefined = ctx.target === "local" ? "P3" : undefined;
    record(
      "route.console-error",
      `Console or runtime errors on ${url}`,
      "No console errors, page errors, or hydration warnings.",
      otherConsoleErrors.slice(0, 6).join("\n"),
      { severity, shot },
    );
  }

  if (health.brokenImages > 0) {
    record(
      "asset.broken-image",
      `Broken image assets on ${url}`,
      "Every image asset loads.",
      `${health.brokenImages} broken image(s).`,
      { shot },
    );
  }

  if (health.buttonsWithoutNames > 0) {
    record(
      "a11y.button-no-name",
      `Icon buttons without accessible names on ${url}`,
      "Every visible button has text, a title, or an aria-label.",
      `${health.buttonsWithoutNames} visible button(s) had no accessible name.`,
      { shot },
    );
  }

  if (health.horizontalOverflow && ctx.device !== "desktop") {
    record(
      "layout.horizontal-overflow",
      `Horizontal overflow on ${ctx.device}: ${url}`,
      "No horizontal scrolling on a phone or tablet.",
      `scrollWidth ${health.scrollWidth}, clientWidth ${health.clientWidth}.`,
      { shot, suspectedFile: "components/admin/mobile-bottom-nav.tsx" },
    );
  }

  if (loadMs > SLOW_RENDER_MS && ctx.target !== "production") {
    // Ungated on production: a cold lambda is not a code finding, and the
    // report carries render time as a trend instead.
    record(
      "perf.slow-render",
      `Slow initial render on ${url}`,
      `Initial render under ${SLOW_RENDER_MS}ms.`,
      `${loadMs}ms to DOM/network-idle capture.`,
    );
  }

  if (options.axe) {
    const violations = await collectAxeViolations(page);
    for (const violation of violations) {
      record(
        violation.impact === "critical" ? "a11y.critical" : "a11y.serious",
        `${violation.impact} accessibility violation on ${url}: ${violation.id}`,
        "No serious or critical axe violations.",
        `${violation.help} (${violation.nodes} node(s), first: ${violation.target})`,
        { shot },
      );
    }

    if (!(await hasVisibleFocus(page))) {
      record(
        "a11y.focus-not-visible",
        `No visible focus ring after Tab on ${url}`,
        "The first Tab from page load moves focus to a control with a visible ring.",
        "document.activeElement did not match :focus-visible.",
      );
    }
  }

  return {
    url,
    finalUrl,
    status,
    loadMs,
    health,
    consoleErrors: drained.consoleErrors,
    networkErrors: drained.networkErrors,
    interactions,
    bouncedToLogin,
    ok,
    notes,
  };
}
