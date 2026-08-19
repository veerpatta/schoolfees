import { describe, expect, it } from "vitest";

import { safeReturnTo } from "@/lib/navigation/return-to";

const FALLBACK = "/protected/students";

describe("safeReturnTo", () => {
  it("keeps any path inside the workspace", () => {
    // The whole point of widening the old per-page checks: a child opened from
    // a filtered Transactions view has to be able to go back to it.
    expect(safeReturnTo("/protected/transactions?view=receipts&classId=c-10", FALLBACK)).toBe(
      "/protected/transactions?view=receipts&classId=c-10",
    );
    expect(safeReturnTo("/protected/students?query=meena", FALLBACK)).toBe(
      "/protected/students?query=meena",
    );
    expect(safeReturnTo("/protected/defaulters", FALLBACK)).toBe("/protected/defaulters");
  });

  it("falls back when there is nothing to go back to", () => {
    expect(safeReturnTo(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo(null, FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo("", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses to leave the app", () => {
    // An unchecked returnTo is an open redirect wearing a Back button, and
    // this one is reachable by anyone who can get a staff member to open a
    // link — which, for a school office, is anyone with the phone number.
    for (const hostile of [
      "//evil.example/steal",
      "https://evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "/\\evil.example",
      "/protected\\..\\..\\evil",
    ]) {
      expect(safeReturnTo(hostile, FALLBACK)).toBe(FALLBACK);
    }
  });

  it("refuses a path outside the workspace", () => {
    expect(safeReturnTo("/auth/login", FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo("/", FALLBACK)).toBe(FALLBACK);
    // "/protected" without the trailing slash is the redirect hop, not a page.
    expect(safeReturnTo("/protectedevil", FALLBACK)).toBe(FALLBACK);
  });
});
