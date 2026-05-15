import { describe, expect, it } from "vitest";

import { appendSessionParam } from "@/lib/navigation/session-href";

describe("appendSessionParam", () => {
  it("adds the selected session to protected links", () => {
    expect(appendSessionParam("/protected/payments", "2025-26")).toBe(
      "/protected/payments?session=2025-26",
    );
  });

  it("preserves existing query values and hashes", () => {
    expect(
      appendSessionParam(
        "/protected/transactions?view=receipts#latest",
        "TEST-2026-27",
      ),
    ).toBe("/protected/transactions?view=receipts&session=TEST-2026-27#latest");
  });

  it("does not change non-protected links", () => {
    expect(appendSessionParam("/auth/login", "2025-26")).toBe("/auth/login");
  });
});
