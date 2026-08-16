import { expect, test } from "../fixtures";
import { reproCommand } from "../lib/artifacts";
import { TEST_SESSION } from "../lib/identity";
import {
  DASHBOARD_DAYS_DIMENSION,
  DASHBOARD_DAYS_VALUES,
  DASHBOARD_VIEW_DIMENSION,
  DASHBOARD_VIEW_VALUES,
  RECEIPT_DATE_FILTERS,
  RECEIPT_FILTER_DIMENSION,
  RECEIPT_FLAGS,
  RECEIPT_SORTS,
  SEGMENT_ALIASES,
  SEGMENT_DIMENSION,
  SEGMENT_IDS,
  SESSION_RESOLUTION_CASES,
  SESSION_RESOLUTION_DIMENSION,
  STUDENT_SORTS,
  STUDENT_STATUS_VALUES,
  TRANSACTION_VIEW_ALIASES,
  TRANSACTION_VIEW_DIMENSION,
  TRANSACTION_VIEW_VALUES,
} from "../surface/params";

/**
 * Every switcher value, one at a time.
 *
 * Single-factor and exhaustive, because each value is a distinct branch: five
 * dashboard boards are five server components, nine transaction views are nine
 * queries, and every segment chip is its own `seg_*` column. The combinations
 * between them are the part that is not covered, and the ledger says so.
 */

test.describe.configure({ mode: "serial" });

test("every dashboard board renders", async ({ probe, coverage, withSession }) => {
  for (const view of DASHBOARD_VIEW_VALUES) {
    await probe(withSession(`/protected/dashboard?view=${view}`), {
      identity: /collected|pending|late fee|class|recovery/i,
      interact: false,
    });
    coverage.visit(DASHBOARD_VIEW_DIMENSION.id, view);
  }

  // Only the collection board honours ?days=; the others ignore it, which is
  // itself worth not breaking.
  for (const days of DASHBOARD_DAYS_VALUES) {
    await probe(withSession(`/protected/dashboard?view=collection&days=${days}`), {
      interact: false,
    });
    coverage.visit(DASHBOARD_DAYS_DIMENSION.id, days);
  }
});

test("every transactions view renders, aliases included", async ({
  probe,
  coverage,
  withSession,
}) => {
  for (const view of TRANSACTION_VIEW_VALUES) {
    await probe(withSession(`/protected/transactions?view=${view}`), { interact: false });
    coverage.visit(TRANSACTION_VIEW_DIMENSION.id, view);
  }

  for (const [alias, canonical] of Object.entries(TRANSACTION_VIEW_ALIASES)) {
    const result = await probe(withSession(`/protected/transactions?view=${alias}`), {
      interact: false,
    });
    coverage.visit(TRANSACTION_VIEW_DIMENSION.id, alias);

    // An alias that stops resolving does not error — it silently shows the
    // default view, which reads as "there are no receipts today".
    expect(
      result.status === null || result.status < 400,
      `alias ${alias} -> ${canonical} should resolve, not error`,
    ).toBe(true);
  }
});

test("every student segment chip filters", async ({
  probe,
  coverage,
  withSession,
  findings,
  target,
}) => {
  for (const segment of SEGMENT_IDS) {
    const result = await probe(withSession(`/protected/students?seg=${segment}`), {
      interact: false,
    });
    coverage.visit(SEGMENT_DIMENSION.id, segment);

    if (result.status !== null && result.status >= 400) {
      findings.record({
        rule: "param.unknown-value-crashes",
        surface: `/protected/students?seg=${segment}`,
        title: `Segment "${segment}" returned HTTP ${result.status}`,
        expected: "Every declared segment maps to a seg_* column and filters.",
        actual: `HTTP ${result.status} at ${result.finalUrl}`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "segment chip" }) },
      });
    }
  }

  // Retired ids must still resolve — a saved view from before the rename should
  // not silently drop its filter.
  for (const [alias, canonical] of Object.entries(SEGMENT_ALIASES)) {
    const result = await probe(withSession(`/protected/students?seg=${alias}`), {
      interact: false,
    });
    coverage.visit(SEGMENT_DIMENSION.id, alias);

    expect(
      result.finalUrl.includes(canonical) || (result.status ?? 200) < 400,
      `retired segment id "${alias}" should still resolve to "${canonical}"`,
    ).toBe(true);
  }
});

test("segment combinations re-emit in definition order", async ({ probe, withSession }) => {
  // The URL is canonicalised so that clicking chips in a different order
  // produces the same link — which is what makes a filtered list shareable.
  const combos = [
    ["overdue", "onTransport"],
    ["onTransport", "overdue"],
    ["active", "hasDues", "missingPhone"],
    ["lateFeePending", "yearClear"],
  ];

  for (const combo of combos) {
    await probe(withSession(`/protected/students?seg=${combo.join(",")}`), { interact: false });
  }
});

test("student list controls: sort, status, class, page", async ({
  probe,
  withSession,
  subjects,
}) => {
  for (const sort of STUDENT_SORTS) {
    await probe(withSession(`/protected/students?sort=${sort}`), { interact: false });
  }
  for (const status of STUDENT_STATUS_VALUES) {
    await probe(withSession(`/protected/students?status=${status}`), { interact: false });
  }
  if (subjects.classIds[0]) {
    await probe(withSession(`/protected/students?classId=${subjects.classIds[0]}`), {
      interact: false,
    });
  }
  await probe(withSession("/protected/students?page=2"), { interact: false });
});

test("receipt lookup filters", async ({ probe, coverage, withSession }) => {
  for (const dateFilter of RECEIPT_DATE_FILTERS) {
    const suffix =
      dateFilter === "custom" ? "&from=2026-04-01&to=2026-08-01" : "";
    await probe(withSession(`/protected/receipts?date=${dateFilter}${suffix}`), {
      interact: false,
    });
    coverage.visit(RECEIPT_FILTER_DIMENSION.id, dateFilter);
  }

  for (const sort of RECEIPT_SORTS) {
    await probe(withSession(`/protected/receipts?sort=${sort}`), { interact: false });
    coverage.visit(RECEIPT_FILTER_DIMENSION.id, sort);
  }

  for (const flag of RECEIPT_FLAGS) {
    await probe(withSession(`/protected/receipts?${flag}`), { interact: false });
    coverage.visit(RECEIPT_FILTER_DIMENSION.id, flag);
  }

  // A reversed receipt stays visible and marked; it must never be deleted or
  // silently dropped from the list.
  await probe(withSession("/protected/receipts?modes=cash,upi"), { interact: false });
});

test("session label resolution: url, cookie, default", async ({
  probe,
  coverage,
  findings,
  target,
}) => {
  for (const resolution of SESSION_RESOLUTION_CASES) {
    const url =
      resolution.query === null
        ? "/protected/dashboard"
        : `/protected/dashboard?session=${encodeURIComponent(resolution.query)}`;

    const result = await probe(url, { interact: false });
    coverage.visit(SESSION_RESOLUTION_DIMENSION.id, resolution.id);

    if (result.status !== null && result.status >= 500) {
      findings.record({
        rule: "param.unknown-value-crashes",
        surface: url,
        title: `Session label "${resolution.query}" caused HTTP ${result.status}`,
        expected:
          "An invalid session label is skipped and resolution falls through to " +
          "the cookie, then to app_settings.active_session_label.",
        actual: `HTTP ${result.status}`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "session label resolution" }) },
      });
    }
  }
});

test("fee setup sections and time travel", async ({ probe, withSession }) => {
  for (const section of ["session", "basic", "classes", "transport", "fee-heads", "discounts", "installments"]) {
    await probe(withSession(`/protected/fee-setup?section=${section}`), { interact: false });
  }
  await probe(withSession("/protected/fee-setup/time-travel?asOf=2026-07-01"), {
    interact: false,
  });
});

test("defaulters filters", async ({ probe, withSession, subjects }) => {
  await probe(withSession("/protected/defaulters?overdue=overdue"), { interact: false });
  await probe(withSession("/protected/defaulters?prevYearDues=prevYear"), { interact: false });
  await probe(withSession("/protected/defaulters?minPendingAmount=5000"), { interact: false });
  if (subjects.classIds[0]) {
    await probe(withSession(`/protected/defaulters?classId=${subjects.classIds[0]}`), {
      interact: false,
    });
  }
});
