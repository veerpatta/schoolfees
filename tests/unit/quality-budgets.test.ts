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
    expect(qualityBudgets.performance.officeWorkflow.paymentDeskSearchToSelectionMs).toBeLessThanOrEqual(
      6000,
    );
    expect(qualityBudgets.performance.officeWorkflow.studentSelectedToReceiptMs).toBeLessThanOrEqual(
      30000,
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
        "/protected/payments?session=TEST-2026-27",
        "/protected/reports?session=TEST-2026-27",
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
