import { describe, expect, it } from "vitest";

import { resolveReceiptSessionLabel } from "@/lib/receipts/session-label";

describe("resolveReceiptSessionLabel", () => {
  it("prints the payment installment session for backdated payments", () => {
    expect(
      resolveReceiptSessionLabel({
        paymentSessionLabels: ["2025-26"],
        studentSessionLabel: "2026-27",
      }),
    ).toBe("2025-26");
  });

  it("falls back to the current student class only when payment session is unavailable", () => {
    expect(
      resolveReceiptSessionLabel({
        paymentSessionLabels: [null, ""],
        studentSessionLabel: "2026-27",
      }),
    ).toBe("2026-27");
  });
});
