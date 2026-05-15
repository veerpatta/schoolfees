import { beforeEach, describe, expect, it, vi } from "vitest";

const getFeePolicySummary = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

describe("resolveViewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "2026-27" });
  });

  it("uses a valid URL session before cookie or active policy", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    await expect(
      resolveViewSession({
        searchParamSession: "2025-26",
        cookieSession: "2024-25",
      }),
    ).resolves.toEqual({
      sessionLabel: "2025-26",
      source: "url",
      isTest: false,
    });

    expect(getFeePolicySummary).not.toHaveBeenCalled();
  });

  it("falls back from an invalid URL session to a valid cookie session", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    await expect(
      resolveViewSession({
        searchParamSession: "bad-session",
        cookieSession: "2024-25",
      }),
    ).resolves.toEqual({
      sessionLabel: "2024-25",
      source: "cookie",
      isTest: false,
    });
  });

  it("falls back from invalid URL and cookie sessions to the active policy", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    await expect(
      resolveViewSession({
        searchParamSession: "bad-session",
        cookieSession: "TEST",
      }),
    ).resolves.toEqual({
      sessionLabel: "2026-27",
      source: "policy",
      isTest: false,
    });

    expect(getFeePolicySummary).toHaveBeenCalledTimes(1);
  });

  it("marks resolved TEST/UAT/DEMO sessions as test sessions", async () => {
    const { resolveViewSession } = await import("@/lib/session/resolver");

    await expect(
      resolveViewSession({
        searchParamSession: "TEST-2026-27",
        cookieSession: "2026-27",
      }),
    ).resolves.toMatchObject({
      sessionLabel: "TEST-2026-27",
      source: "url",
      isTest: true,
    });
  });
});
