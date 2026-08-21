import { expect, test } from "../fixtures";
import { reproCommand, runId, screenshot } from "../lib/artifacts";
import { baseUrlFor, TEST_SESSION } from "../lib/identity";
import { writeLedgerEntry } from "../lib/stream";
import {
  assertWritable,
  clientRequestIdFor,
  pinSessionCookie,
  WriteRefused,
} from "../lib/writes";
import {
  PAYMENT_CASES,
  PAYMENT_CASE_DIMENSION,
  POSTING_CASES,
  PREVIEW_ONLY_CASES,
} from "../surface/payment-cases";

/**
 * The write half, and why it is safe to run against a live deployment.
 *
 * Every posting here goes through the Payment Desk — the only sanctioned
 * posting surface — and every one is gated four ways before a click:
 * a `TEST-` admission number, an allowlisted host, the `vpps_view_session`
 * cookie the *layout* reads, and what the page actually rendered. A refusal is
 * recorded as a P0 `write.gate-refused` rather than swallowed, because a
 * harness that cannot prove it is safe must say so loudly.
 *
 * The receipts this leaves behind are permanent. They are append-only by
 * design — a correction is a `payment_adjustment`, never a delete — so the
 * suite bounds its footprint instead of cleaning up: six receipts per run, and
 * `scripts/verify-deep-test-footprint.mjs` fails if it ever finds more.
 */

test.describe.configure({ mode: "serial" });

const writesEnabled = process.env.DEEP_ALLOW_WRITES === "1";

test.beforeEach(async ({ context, target }) => {
  await pinSessionCookie(context, baseUrlFor(target), TEST_SESSION);
});

test("@write the desk previews every allocation shape without posting", async ({
  page,
  context,
  subjects,
  findings,
  target,
  coverage,
  withSession,
}) => {
  for (const paymentCase of PREVIEW_ONLY_CASES) {
    const subject = subjects.scenarios[paymentCase.subject];
    coverage.visit(PAYMENT_CASE_DIMENSION.id, paymentCase.id);

    if (!subject) {
      findings.record({
        rule: "ux.observation",
        surface: `payment-case:${paymentCase.id}`,
        title: `Scenario student ${paymentCase.subject} was not found in ${TEST_SESSION}`,
        expected: `docs/qa/smoke-test-data.md lists this student: ${paymentCase.note}`,
        actual: "Discovery did not return a student with that admission number.",
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "previews every allocation" }) },
      });
      continue;
    }

    const paymentDate = new Date();
    paymentDate.setDate(paymentDate.getDate() + paymentCase.dateOffsetDays);
    const isoDate = paymentDate.toISOString().slice(0, 10);

    await page.goto(withSession(`/protected/payments?studentId=${subject.id}`), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

    try {
      await assertWritable({ page, context, subject, baseURL: baseUrlFor(target) });
    } catch (error) {
      if (error instanceof WriteRefused) {
        findings.record({
          rule: "write.gate-refused",
          surface: `payment-case:${paymentCase.id}`,
          title: `Write gate "${error.lock}" refused before a preview`,
          expected: "The harness can prove it is looking at the test ledger.",
          actual: error.message,
          target,
          session: TEST_SESSION,
          evidence: {
            screenshot: await screenshot(page, `write-refused-${paymentCase.id}`),
            reproCommand: reproCommand({ target, grep: "previews every allocation" }),
          },
        });
        continue;
      }
      throw error;
    }

    // The preview is a read model with `Cache-Control: no-store` for a reason:
    // a 60-second cache once showed pre-payment dues and invited a cashier to
    // over-collect. Asking for it directly is the cheapest way to exercise the
    // date-aware late-fee pricing across the three dates.
    const preview = await page.request.get(
      `/protected/payments/preview?studentId=${encodeURIComponent(subject.id)}&paymentDate=${isoDate}`,
      { failOnStatusCode: false },
    );

    if (preview.status() >= 500) {
      findings.record({
        rule: "route.500",
        surface: "/protected/payments/preview",
        title: `Allocation preview returned HTTP ${preview.status()} for ${paymentCase.id}`,
        expected: `${paymentCase.note} The preview answers or degrades to a 503 with a message.`,
        actual: `HTTP ${preview.status()}: ${(await preview.text()).slice(0, 300)}`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "previews every allocation" }) },
      });
      continue;
    }

    // The late-fee-only student is the case that proves posting allocates
    // against total_pending: fees are ₹0, so an allocation reading
    // pending_amount would offer nothing to collect.
    if (paymentCase.id === "preview-late-fee-only" && preview.ok()) {
      const body = await preview.text();
      const offersSomething = /"rows"\s*:\s*\[\s*\{/.test(body);
      if (!offersSomething) {
        findings.record({
          rule: "write.wrong-amount",
          surface: "/protected/payments/preview",
          title: "A student whose only debt is a late fee has nothing to collect",
          expected:
            "Posting allocates against total_pending (fees + late fee), so ₹1,000 " +
            "of late fee must be collectable even with ₹0 of fees.",
          actual: body.slice(0, 400),
          target,
          session: TEST_SESSION,
          suspectedFile: "src/lib/payments/allocation.ts",
          evidence: { reproCommand: reproCommand({ target, grep: "previews every allocation" }) },
        });
      }
    }
  }
});

test("@write the amount field refuses what is not a whole rupee amount", async ({
  page,
  context,
  subjects,
  findings,
  target,
  coverage,
  withSession,
}) => {
  const subject = subjects.scenarios.neverPaidFullInfo;
  test.skip(!subject, "No never-paid TEST student to work against.");

  await page.goto(withSession(`/protected/payments?studentId=${subject!.id}`), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
  await assertWritable({ page, context, subject: subject!, baseURL: baseUrlFor(target) });

  const amountField = page.getByLabel(/amount received/i).first();

  for (const paymentCase of PAYMENT_CASES.filter((entry) => entry.id.startsWith("amount-"))) {
    coverage.visit(PAYMENT_CASE_DIMENSION.id, paymentCase.id);

    await amountField.fill("").catch(() => null);
    await amountField.fill(paymentCase.amount).catch(() => null);

    // `parsePaymentAmount` demands a whole number greater than zero. The
    // affordance that opens the confirm sheet must stay disabled — if it does
    // not, the refusal has moved to the server and a cashier can reach a
    // confirm dialog for an amount that cannot be posted.
    const collect = page.getByRole("button", { name: /^collect\s/i }).first();
    const reachable =
      (await collect.count().catch(() => 0)) > 0 &&
      (await collect.isEnabled().catch(() => false));

    if (reachable) {
      findings.record({
        rule: "write.wrong-amount",
        surface: "/protected/payments",
        title: `The desk offered to collect "${paymentCase.amount}"`,
        expected: `${paymentCase.note} The collect action stays disabled.`,
        actual: `The collect button was enabled with the amount field set to "${paymentCase.amount}".`,
        target,
        session: TEST_SESSION,
        suspectedFile: "src/lib/payments/workflow.ts",
        evidence: {
          screenshot: await screenshot(page, `amount-${paymentCase.id}`),
          reproCommand: reproCommand({ target, grep: "amount field refuses" }),
        },
      });
    }
  }
});

test("@write posts the sanctioned test payments", async ({
  page,
  context,
  subjects,
  findings,
  target,
  coverage,
  withSession,
}) => {
  test.skip(
    !writesEnabled,
    "DEEP_ALLOW_WRITES=1 is required. Every posting here is permanent.",
  );

  const run = runId();
  const postedReceipts = new Map<string, string>();

  for (const paymentCase of POSTING_CASES) {
    const subject = subjects.scenarios[paymentCase.subject];
    coverage.visit(PAYMENT_CASE_DIMENSION.id, paymentCase.id);
    if (!subject) continue;

    // `post-idempotent-retry` deliberately reuses the first case's key: the
    // posting RPC must resolve it to the receipt that already exists.
    const keyCase =
      paymentCase.id === "post-idempotent-retry" ? "post-cash-partial" : paymentCase.id;
    const clientRequestId = clientRequestIdFor(run, keyCase);

    await page.goto(withSession(`/protected/payments?studentId=${subject.id}`), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

    try {
      await assertWritable({ page, context, subject, baseURL: baseUrlFor(target) });
    } catch (error) {
      if (error instanceof WriteRefused) {
        findings.record({
          rule: "write.gate-refused",
          surface: `payment-case:${paymentCase.id}`,
          title: `Write gate "${error.lock}" refused a posting`,
          expected: "All four locks agree before any money moves.",
          actual: error.message,
          target,
          session: TEST_SESSION,
          evidence: {
            screenshot: await screenshot(page, `post-refused-${paymentCase.id}`),
            reproCommand: reproCommand({ target, grep: "posts the sanctioned", project: "writes" }),
          },
        });
        continue;
      }
      throw error;
    }

    const before = await countReceipts(page, subject.admissionNo);

    await page.getByLabel(/amount received/i).first().fill(paymentCase.amount);
    await page
      .getByRole("button", { name: new RegExp(`^${paymentCase.mode.replace("_", " ")}$`, "i") })
      .first()
      .click()
      .catch(() => null);

    const collect = page.getByRole("button", { name: /^collect\s/i }).first();
    if (!(await collect.count().catch(() => 0))) {
      findings.record({
        rule: "ux.observation",
        surface: "/protected/payments",
        title: `Could not find the collect action for ${paymentCase.id}`,
        expected: 'The desk offers a "Collect ₹… · <mode>" button once an amount is entered.',
        actual: "No button matching /^collect / was present.",
        target,
        session: TEST_SESSION,
        evidence: {
          screenshot: await screenshot(page, `no-collect-${paymentCase.id}`),
          reproCommand: reproCommand({ target, grep: "posts the sanctioned", project: "writes" }),
        },
      });
      continue;
    }

    await collect.click();

    const confirm = page.getByRole("dialog", { name: /confirm and save payment/i });
    await confirm.waitFor({ state: "visible", timeout: 15_000 }).catch(() => null);

    // "Posted receipts stay in history. This action cannot be undone." — the
    // sheet says so, and the harness only gets here with all four locks green.
    await page.getByRole("button", { name: /^save payment$/i }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(2_000);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const receiptNumber = bodyText.match(/SVP[\w-]*/)?.[0] ?? null;
    const after = await countReceipts(page, subject.admissionNo);

    if (receiptNumber) postedReceipts.set(paymentCase.id, receiptNumber);

    writeLedgerEntry({
      table: "receipts",
      operation: paymentCase.id,
      identifier: receiptNumber ?? "(none surfaced)",
      caseId: paymentCase.id,
      session: TEST_SESSION,
      target,
      note: `${subject.admissionNo} · ₹${paymentCase.amount} · ${paymentCase.mode} · crid ${clientRequestId}`,
    });

    if (paymentCase.id === "post-idempotent-retry") {
      // The whole point: the same clientRequestId must resolve to the receipt
      // that already exists, not create a second one.
      if (after > before) {
        findings.record({
          rule: "write.idempotency-broken",
          surface: "/protected/payments",
          title: "A retry with the same clientRequestId created a second receipt",
          expected:
            "post_student_payment_with_adjustments dedupes on p_client_request_id " +
            "under a per-student advisory lock, so a retry resolves to the existing receipt.",
          actual: `Receipt count went from ${before} to ${after}.`,
          target,
          session: TEST_SESSION,
          suspectedFile: "src/app/protected/payments/actions.ts",
          evidence: {
            screenshot: await screenshot(page, "idempotency-broken"),
            reproCommand: reproCommand({ target, grep: "posts the sanctioned", project: "writes" }),
          },
        });
      }
      continue;
    }

    if (!receiptNumber) {
      findings.record({
        rule: "write.not-persisted",
        surface: "/protected/payments",
        title: `${paymentCase.id} did not surface a receipt number`,
        expected: "Posting shows an SVP receipt number the cashier can hand over.",
        actual: bodyText.slice(0, 600),
        target,
        session: TEST_SESSION,
        evidence: {
          screenshot: await screenshot(page, `no-receipt-${paymentCase.id}`),
          reproCommand: reproCommand({ target, grep: "posts the sanctioned", project: "writes" }),
        },
      });
    }

    if (after <= before) {
      findings.record({
        rule: "write.not-persisted",
        surface: "/protected/transactions",
        title: `${paymentCase.id} did not appear in transactions`,
        expected: "A posted payment reaches Transactions with no manual sync step.",
        actual: `Rows before ${before}, after ${after}.`,
        target,
        session: TEST_SESSION,
        evidence: {
          reproCommand: reproCommand({ target, grep: "posts the sanctioned", project: "writes" }),
        },
      });
    }
  }

  expect(postedReceipts.size, "at least one sanctioned payment posted").toBeGreaterThan(0);
});

test("@write a late-fee-only student is still not a defaulter after paying", async ({
  page,
  subjects,
  findings,
  target,
  withSession,
}) => {
  test.skip(!writesEnabled, "DEEP_ALLOW_WRITES=1 is required.");
  const subject = subjects.scenarios.lateFeeOnly;
  test.skip(!subject, "TEST-CL10-002 was not found.");

  // Hard safety rule 8: a late fee is never folded into a fees figure and never
  // makes a student a defaulter. This is the assertion after money has moved.
  await page.goto(withSession("/protected/defaulters"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

  const listed = await page
    .locator(`text=${subject!.admissionNo}`)
    .count()
    .catch(() => 0);

  if (listed > 0) {
    findings.record({
      rule: "write.wrong-amount",
      surface: "/protected/defaulters",
      title: `${subject!.admissionNo} appears in Defaulters with only a late fee owed`,
      expected:
        "A family whose only debt is a late fee is not a defaulter — pending_amount " +
        "never contains a late fee.",
      actual: "The student is listed on the Defaulters page.",
      target,
      session: TEST_SESSION,
      suspectedFile: "src/lib/defaulters",
      evidence: {
        screenshot: await screenshot(page, "late-fee-only-in-defaulters"),
        reproCommand: reproCommand({ target, grep: "not a defaulter", project: "writes" }),
      },
    });
  }
});

/** Receipt rows for one student, read through the app's own transactions API. */
async function countReceipts(page: import("@playwright/test").Page, admissionNo: string) {
  const response = await page.request.get(
    `/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}` +
      `&query=${encodeURIComponent(admissionNo)}`,
    { failOnStatusCode: false },
  );
  if (!response.ok()) return 0;
  const payload = (await response.json()) as { rows?: unknown[] };
  return Array.isArray(payload.rows) ? payload.rows.length : 0;
}
