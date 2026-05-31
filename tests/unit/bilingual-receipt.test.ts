import { describe, expect, it } from "vitest";

import { createBilingualReceiptTranslator } from "@/lib/i18n/bilingual-receipt";

describe("createBilingualReceiptTranslator", () => {
  const t = createBilingualReceiptTranslator();

  it("resolves English and Devanagari Hindi for the same key", () => {
    expect(t.en("feeReceiptHeading")).toBe("Fee Receipt");
    expect(t.hi("feeReceiptHeading")).toBe("शुल्क रसीद");
  });

  it("interpolates ICU values in both languages", () => {
    expect(t.en("sessionLabelText", { session: "2026-27" })).toContain("2026-27");
    expect(t.hi("sessionLabelText", { session: "2026-27" })).toContain("2026-27");
    expect(t.en("amountDueStatus", { amount: "Rs. 500" })).toBe("Rs. 500 due");
    expect(t.hi("amountDueStatus", { amount: "Rs. 500" })).toBe("Rs. 500 बकाया");
  });

  it("both() stacks English over Hindi with a newline", () => {
    expect(t.both("paidStatus")).toBe("Paid\nजमा");
  });

  it("is locale-independent — does not read any request/cookie state", () => {
    // Constructing twice yields the same fixed bilingual output regardless of
    // any ambient UI locale.
    const t2 = createBilingualReceiptTranslator();
    expect(t2.hi("receiptNo")).toBe("रसीद संख्या");
    expect(t2.en("receiptNo")).toBe("Receipt No");
  });
});
