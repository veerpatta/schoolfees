import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getActiveSessionLabel = vi.fn(async () => "2026-27");

vi.mock("@/lib/session/active", () => ({
  getActiveSessionLabel,
}));

describe("resolveViewSession", () => {
  it("marks production sessions editable and collectable", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    const session = await resolveViewSession({ searchParamSession: "2025-26" });

    expect(session).toMatchObject({
      sessionLabel: "2025-26",
      source: "url",
      isTest: false,
      isProduction: true,
      isEditable: true,
      isCollectable: true,
    });
  });

  it("marks test sessions editable and collectable but not production", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    const session = await resolveViewSession({
      searchParamSession: "TEST-2026-27",
    });

    expect(session).toMatchObject({
      sessionLabel: "TEST-2026-27",
      source: "url",
      isTest: true,
      isProduction: false,
      isEditable: true,
      isCollectable: true,
    });
  });

  it("falls back to default active session when URL and cookie are invalid", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    const session = await resolveViewSession({
      searchParamSession: "2026-26",
      cookieSession: "wrong",
    });

    expect(session).toMatchObject({
      sessionLabel: "2026-27",
      source: "default",
      isProduction: true,
    });
  });
});
