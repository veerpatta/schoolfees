import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Payment Desk readiness fail-safe (audit 1.11)", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/payments/data.ts"),
    "utf8",
  );

  it("the readiness catch returns canPostPayments: false (never leaves it open on a DB hiccup)", () => {
    // Find the catch block immediately after getPaymentDeskReadiness's try.
    const fnIdx = source.indexOf("export async function getPaymentDeskReadiness");
    expect(fnIdx).toBeGreaterThan(0);
    const fn = source.slice(fnIdx, source.indexOf("\nexport ", fnIdx + 1));

    // The catch block must close the desk, not open it.
    expect(fn).toMatch(/} catch \(error\) \{/);
    expect(fn).toContain("canPostPayments: false");
    expect(fn).not.toMatch(/canPostPayments: payload\.canWritePayments,\s*\n\s*blockingReason: null/);
  });

  it("the readiness catch surfaces a generic blockingReason so the UI explains the failure", () => {
    const fnIdx = source.indexOf("export async function getPaymentDeskReadiness");
    const fn = source.slice(fnIdx, source.indexOf("\nexport ", fnIdx + 1));
    expect(fn).toMatch(/title: "Readiness check failed"/);
    expect(fn).toContain("Could not confirm the Payment Desk is ready");
    expect(fn).toMatch(/actionLabel: "Retry"/);
  });

  it("uses the observability logger instead of bare console.warn", () => {
    const fnIdx = source.indexOf("export async function getPaymentDeskReadiness");
    const fn = source.slice(fnIdx, source.indexOf("\nexport ", fnIdx + 1));
    expect(fn).toContain('logWarn("payments.readiness.check_failed"');
    expect(fn).not.toContain('console.warn("Payment Desk readiness check failed.');
  });
});

describe("Financial-state catch surfaces errors (audit 1.12)", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/payments/data.ts"),
    "utf8",
  );

  it("getStudentFinancialState logs errors instead of swallowing them silently", () => {
    const fnIdx = source.indexOf("async function getStudentFinancialState");
    expect(fnIdx).toBeGreaterThan(0);
    const fn = source.slice(fnIdx, source.indexOf("\nasync function", fnIdx + 1));
    expect(fn).toContain('logError("payments.financial_state.lookup_failed"');
    expect(fn).toContain('logError("payments.financial_state.threw"');
    // No more silent bare catch.
    expect(fn).not.toMatch(/\} catch \{\s*\n\s*return null;\s*\n\s*\}\s*\n\}/);
  });

  it("getConventionalDiscountForStudent logs the error before returning the zero default", () => {
    const fnIdx = source.indexOf("async function getConventionalDiscountForStudent");
    expect(fnIdx).toBeGreaterThan(0);
    const fn = source.slice(fnIdx, source.indexOf("\nasync function", fnIdx + 1));
    expect(fn).toContain('logError("payments.conventional_discount.lookup_failed"');
  });
});
