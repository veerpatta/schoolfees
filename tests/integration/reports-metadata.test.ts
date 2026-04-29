import { describe, expect, it } from "vitest";

import { reportDefinitions } from "@/lib/reports/types";

describe("report metadata", () => {
  it("keeps simplified office-facing report titles", () => {
    expect(reportDefinitions.outstanding.title).toBe("Outstanding Dues");
    expect(reportDefinitions["daily-collection"].title).toBe("Daily Collection");
    expect(reportDefinitions["receipt-register"].title).toBe("Receipt Register");
    expect(reportDefinitions["import-verification"].title).toBe("Import Review");
  });

  it("keeps receipt register and import review descriptions aligned with office work", () => {
    expect(reportDefinitions["receipt-register"].description).toContain("recheck work");
    expect(reportDefinitions["import-verification"].description).toContain("import results");
  });
});
