import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("payment-desk-mobile error classification (audit 1.19)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
    "utf8",
  );

  it("defines a classifier that distinguishes transient from policy errors", () => {
    expect(source).toContain("function classifyPaymentSummaryError");
    // Transient hints come from TypeError + common message tokens.
    expect(source).toContain("error instanceof TypeError");
    expect(source).toMatch(/failed to fetch|network|timeout|connection|offline/);
  });

  it("transient errors invite retry", () => {
    expect(source).toMatch(/Tap Retry/);
  });

  it("policy errors point at admin / Fee Setup", () => {
    expect(source).toMatch(/Dues are not prepared/);
    expect(source).toContain("Fee Setup");
  });

  it("both summary and breakdown catch sites route through the classifier", () => {
    expect(source).toContain("setPreviewNotice(classifyPaymentSummaryError(error))");
    expect(source).toContain("setStudentSummaryNotice(classified)");
    // The old verbatim "Ask admin to check Fee Setup" hardcoded strings are
    // gone from the catch sites (they remain inside the classifier itself).
    const catchSiteCount = (source.match(/Unable to load (?:dues|installment breakdown)\. Ask admin/g) ?? [])
      .length;
    expect(catchSiteCount).toBe(0);
  });
});
