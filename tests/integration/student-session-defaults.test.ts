import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();

vi.mock("@/platform/supabase/server", () => ({
  createClient,
}));

vi.mock("@/modules/master-data/data/queries", () => ({
  getMasterDataOptions: vi.fn(),
}));

vi.mock("@/modules/fees/domain/queries", () => ({
  getFeePolicySummary: vi.fn(async () => ({
    academicSessionLabel: "2026-27",
  })),
}));

describe("student session defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to the app active session without reading academic_sessions.is_current", async () => {
    const getMasterDataOptions = (await import("@/modules/master-data/data/queries")).getMasterDataOptions as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    getMasterDataOptions.mockResolvedValue({
      currentSessionLabel: "2026-27",
      classOptions: [{ id: "class-1", label: "Class 1", sessionLabel: "2026-27" }],
      routeOptions: [],
      feeHeads: [],
      paymentModes: [],
    });
    const from = vi.fn();
    createClient.mockResolvedValue({ from });

    const { getStudentFormOptions } = await import("@/modules/students/data/queries");
    const options = await getStudentFormOptions();

    expect(options.resolvedSessionLabel).toBe("2026-27");
    expect(options.policySessionLabel).toBe("2026-27");
    expect(options.sessionMismatch).toBe(false);
    expect(options.academicSessionsCurrentLabel).toBe("2026-27");
    expect(from).not.toHaveBeenCalledWith("academic_sessions");
  });
});
