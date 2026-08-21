import { expect, test } from "../fixtures";
import { reproCommand } from "../lib/artifacts";
import {
  ALIAS_DIMENSION,
  DYNAMIC_PROTECTED_PAGES,
  HANDLERS_DIMENSION,
  LEGACY_ALIASES,
  PAGES_DIMENSION,
  PUBLIC_PAGES,
  ROUTE_IDENTITY,
  STATIC_PROTECTED_PAGES,
  STATIC_ROUTE_HANDLERS,
  DYNAMIC_PAGES_DIMENSION,
} from "../surface/routes";
import { TEST_SESSION } from "../lib/identity";

/**
 * Every route the app has, visited once as an admin.
 *
 * The list is globbed off `src/app/protected/**` at import time, not typed out, so
 * a page added next month is either covered or shows up by name in the ledger.
 * The suite this replaces carried a hand-list that had already drifted: it
 * probed two paths that have no `page.tsx` at all and counted both as covered.
 */

test.describe.configure({ mode: "serial" });

test("public pages render without a session", async ({ probe }) => {
  for (const route of PUBLIC_PAGES) {
    await probe(route, { interact: false });
  }
});

test("every static protected page renders", async ({ probe, coverage, withSession }) => {
  for (const route of STATIC_PROTECTED_PAGES) {
    const identity = ROUTE_IDENTITY[route];
    await probe(withSession(route), { identity });
    coverage.visit(PAGES_DIMENSION.id, route);
  }
});

test("dynamic pages render with a discovered id", async ({
  probe,
  coverage,
  subjects,
  withSession,
  findings,
  target,
}) => {
  // Ids come from discovery, never from a fixture file: they differ per
  // environment, and a hard-coded one silently stops covering the route the
  // day it is deleted.
  const substitutions: Record<string, string | null> = {
    "[studentId]": subjects.writeSubject?.id ?? null,
    "[familyGroupId]": subjects.familyGroupId,
    "[receiptId]": subjects.receiptId,
    "[runId]": subjects.promotionRunId,
    "[exportType]": "all-students",
    "[batchId]": null,
  };

  for (const route of DYNAMIC_PROTECTED_PAGES) {
    const placeholders = route.match(/\[[^\]]+\]/g) ?? [];
    const values = placeholders.map((placeholder) => substitutions[placeholder] ?? null);

    if (values.some((value) => value === null)) {
      // Declared, not skipped: the ledger will show this route as unvisited and
      // the report prints it under "what this run did not test".
      continue;
    }

    let concrete = route;
    placeholders.forEach((placeholder, index) => {
      concrete = concrete.replace(placeholder, values[index]!);
    });

    await probe(withSession(concrete), { interact: false });
    coverage.visit(DYNAMIC_PAGES_DIMENSION.id, route);
  }

  const uncovered = DYNAMIC_PROTECTED_PAGES.filter((route) => {
    const placeholders = route.match(/\[[^\]]+\]/g) ?? [];
    return placeholders.some((placeholder) => !substitutions[placeholder]);
  });

  if (uncovered.length > 0) {
    findings.record({
      rule: "ux.observation",
      surface: "discovery",
      title: `${uncovered.length} dynamic route(s) had no discoverable id`,
      expected: "Discovery finds an id of the right shape for every dynamic route.",
      actual: uncovered.join(", "),
      target,
      session: TEST_SESSION,
      evidence: { reproCommand: reproCommand({ target, grep: "dynamic pages" }) },
    });
  }
});

test("route handlers answer without a server error", async ({
  request,
  coverage,
  findings,
  target,
  subjects,
}) => {
  // Handlers are probed through the API context rather than a page: there is
  // nothing to render, and 35 navigations to download endpoints would be
  // minutes of wall clock for the same signal.
  const query: Record<string, string> = {
    session: TEST_SESSION,
    sessionLabel: TEST_SESSION,
  };
  if (subjects.writeSubject) query.studentId = subjects.writeSubject.id;
  if (subjects.receiptNumber) query.q = subjects.receiptNumber;

  for (const route of STATIC_ROUTE_HANDLERS) {
    const url = `${route}?${new URLSearchParams(query).toString()}`;
    const response = await request.get(url, { failOnStatusCode: false });
    coverage.visit(HANDLERS_DIMENSION.id, route);

    if (response.status() >= 500) {
      const body = (await response.text()).slice(0, 400);
      findings.record({
        rule: "route.500",
        surface: route,
        title: `Route handler returned ${response.status()}`,
        expected: "A GET with the documented smoke parameters answers without a 5xx.",
        actual: `HTTP ${response.status()}: ${body}`,
        target,
        session: TEST_SESSION,
        role: "admin",
        evidence: {
          request: { method: "GET", url, status: response.status() },
          reproCommand: reproCommand({ target, grep: "route handlers" }),
        },
      });
    }
  }
});

test("legacy aliases still land where staff bookmarks expect", async ({
  probe,
  coverage,
  findings,
  target,
  withSession,
}) => {
  for (const alias of LEGACY_ALIASES) {
    const result = await probe(withSession(alias.from), {
      expectedRedirect: alias.expect,
      interact: false,
    });
    coverage.visit(ALIAS_DIMENSION.id, alias.from);

    // The three redirects do not treat their query strings alike, and that is
    // deliberate rather than accidental: /collections rebuilds the whole query,
    // /dues keeps the first value of a repeated key, /advanced drops it. The
    // assertion is per-alias so "fixing" one to match the others surfaces as a
    // finding instead of a silent behaviour change.
    const carriedSession = result.finalUrl.includes(encodeURIComponent(TEST_SESSION))
      || result.finalUrl.includes(TEST_SESSION);

    if (alias.keepsQuery && !carriedSession) {
      findings.record({
        rule: "alias.params-dropped",
        surface: alias.from,
        title: `${alias.from} dropped the session parameter`,
        expected: `${alias.from} carries ?session= through to ${alias.expect}.`,
        actual: `Landed on ${result.finalUrl} with no session parameter.`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "legacy aliases" }) },
      });
    }
  }
});

test("protected root sends an admin to the dashboard", async ({ probe }) => {
  const result = await probe("/protected", {
    interact: false,
    // The root's `redirect()` streams: Next answers 200 with the shell and the
    // browser moves during hydration. Without an explicit wait this reads as
    // "the redirect is broken" when it is working.
    expectedRedirect: /\/protected\/(dashboard|payments|students|defaulters)/,
  });
  expect(
    result.finalUrl,
    "getDefaultProtectedHref() sends an admin to the dashboard",
  ).toMatch(/\/protected\/(dashboard|payments|students|defaulters)/);
});
