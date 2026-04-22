import { describe, expect, it } from "vitest";

import {
  looksLikeReceiptQuery,
  normalizePaymentDeskQuery,
} from "@/lib/payments/search";

describe("payment desk search helpers", () => {
  it("normalizes free-text search for desk lookup", () => {
    expect(normalizePaymentDeskQuery("  SVP-001 / Ravi  ")).toBe("SVP-001 / Ravi");
  });

  it("recognizes receipt-like queries", () => {
    expect(looksLikeReceiptQuery("SVP-1024")).toBe(true);
    expect(looksLikeReceiptQuery("receipt 1024")).toBe(true);
  });

  it("does not treat short names as receipt lookups", () => {
    expect(looksLikeReceiptQuery("Aman")).toBe(false);
  });
});
