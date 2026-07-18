import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import qualityBudgets from "@/quality/office-quality-budgets.json";
import { officeDesignTokens } from "@/lib/design/office-tokens";

describe("Phase D/E quality budgets and design tokens", () => {
  it("sets explicit operational performance budgets", () => {
    expect(qualityBudgets.performance.webVitals).toMatchObject({
      lcpMs: 2500,
      inpMs: 200,
      cls: 0.1,
    });
    const workflow = qualityBudgets.performance.officeWorkflow;
    expect(workflow.paymentSearchWarmMs).toBeLessThanOrEqual(500);
    expect(workflow.paymentSearchColdMs).toBeLessThanOrEqual(1500);
    expect(workflow.studentSelectionToFeeSummaryColdMs).toBeLessThanOrEqual(2000);
    expect(workflow.paymentConfirmToReceiptP75Ms).toBeLessThanOrEqual(8000);
    expect(workflow.studentSelectedToReceiptP75Ms).toBeLessThanOrEqual(20000);
    expect(workflow.studentsFilterResponseP75Ms).toBeLessThanOrEqual(1000);
    expect(qualityBudgets.performance.sourceBudgets.paymentDeskInitialClientJsReductionPercent).toBe(
      20,
    );
  });

  it("defines visual regression smoke targets for the main office surfaces", () => {
    expect(qualityBudgets.visualRegression.viewports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "desktop-office", width: 1440, height: 900 }),
        expect.objectContaining({ name: "mobile-counter", width: 390, height: 844 }),
      ]),
    );
    expect(qualityBudgets.visualRegression.routes).toEqual(
      expect.arrayContaining([
        "/protected/dashboard?session=TEST-2026-27",
        "/protected/students?session=TEST-2026-27",
        "/protected/fee-setup?session=TEST-2026-27",
        "/protected/payments?session=TEST-2026-27",
        "/protected/transactions?session=TEST-2026-27",
        "/protected/defaulters?session=TEST-2026-27",
        "/protected/exports?session=TEST-2026-27",
        "/protected/admin-tools?session=TEST-2026-27",
      ]),
    );
  });

  it("maps formal design token names to real CSS variables", () => {
    const css = readFileSync("app/globals.css", "utf8");

    for (const token of Object.values(officeDesignTokens).flatMap(Object.values)) {
      expect(css).toContain(token.cssVariable);
    }
  });
});
