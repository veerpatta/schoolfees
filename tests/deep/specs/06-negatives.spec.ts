import { test } from "../fixtures";
import { reproCommand } from "../lib/artifacts";
import { TEST_SESSION } from "../lib/identity";
import {
  NEGATIVE_DIMENSION,
  NEGATIVE_ROUTE_CASES,
  PUBLIC_VERIFY_CASES,
} from "../surface/negatives";

/**
 * Inputs the app should refuse gracefully.
 *
 * The distinction that runs through all of it is **404 versus 500**. A junk id
 * is a missing record, not a broken server: `src/platform/helpers/uuid.ts` exists
 * because a non-UUID path segment used to reach Postgres and come back as
 * `invalid input syntax for type uuid`, which is a 500 for what is plainly a
 * typo in a URL.
 *
 * A 500 here is recorded as `route.500-on-bad-uuid` rather than `route.500`, so
 * the report can tell "this page is broken" apart from "this page is broken
 * only when you feed it nonsense".
 */

test.describe.configure({ mode: "serial" });

test("malformed routes and parameters answer without a server error", async ({
  probe,
  coverage,
  findings,
  target,
  withSession,
}) => {
  for (const negative of NEGATIVE_ROUTE_CASES) {
    const url = negative.url.startsWith("/protected")
      ? withSession(negative.url)
      : negative.url;

    const result = await probe(url, {
      allow404: true,
      allowClientError: true,
      // Deliberately NOT a status assertion. `notFound()` in this app streams
      // the shell and answers 200, carrying the not-found UI in the RSC
      // payload — so "did it 404?" is a question about what rendered.
      expectNotFound: negative.expect === "404",
      interact: false,
    });
    coverage.visit(NEGATIVE_DIMENSION.id, negative.id);

    if (result.status !== null && result.status >= 500) {
      findings.record({
        rule: "route.500-on-bad-uuid",
        surface: url,
        title: `Malformed input produced HTTP ${result.status}: ${negative.id}`,
        expected: negative.note,
        actual: `HTTP ${result.status} at ${result.finalUrl}`,
        target,
        session: TEST_SESSION,
        evidence: {
          request: { method: "GET", url, status: result.status },
          reproCommand: reproCommand({ target, grep: "malformed routes" }),
        },
      });
      continue;
    }
  }
});

test("public receipt verification refuses junk without touching the database", async ({
  probe,
  coverage,
  findings,
  target,
}) => {
  for (const negative of PUBLIC_VERIFY_CASES) {
    const result = await probe(negative.url, {
      allowClientError: true,
      allow404: true,
      interact: false,
    });
    coverage.visit(NEGATIVE_DIMENSION.id, negative.id);

    if (result.status !== null && result.status >= 500) {
      findings.record({
        rule: "route.500-on-bad-uuid",
        surface: negative.url,
        title: `Public verification returned HTTP ${result.status}: ${negative.id}`,
        expected: negative.note,
        actual: `HTTP ${result.status}`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "public receipt verification" }) },
      });
    }

    // Minimal disclosure is the whole design of this page: receipt number,
    // date, amount, reversed-or-not. No student, no class, no balance.
    const leaked = /class\s*\d|father|mother|balance|pending|admission/i.test(
      result.health.bodyText,
    );
    if (leaked) {
      findings.record({
        rule: "ux.observation",
        surface: negative.url,
        title: "Public receipt verification page mentions student detail",
        expected:
          "The public page discloses only receipt number, date, amount and " +
          "reversal state — never student identity, class or balance.",
        actual: result.health.bodyText.slice(0, 300),
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "public receipt verification" }) },
      });
    }
  }
});

test("a hostile search string finds nothing and breaks nothing", async ({
  probe,
  withSession,
}) => {
  // Quote, paren, SQL comment, emoji and RTL text in one string, across every
  // surface that takes a free-text query.
  const hostile = encodeURIComponent("'); -- O'Brien 😀 اختبار");
  for (const url of [
    `/protected/students?query=${hostile}`,
    `/protected/defaulters?query=${hostile}`,
    `/protected/receipts?query=${hostile}`,
    `/protected/ledger?query=${hostile}`,
  ]) {
    await probe(withSession(url), { interact: false });
  }
});
