import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/master-data/data", () => ({
  getMasterDataOptions: vi.fn(),
}));

describe("student session defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to the active fee setup session and detects session mismatches", async () => {
    const getMasterDataOptions = (await import("@/lib/master-data/data")).getMasterDataOptions as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    getMasterDataOptions.mockResolvedValue({
      currentSessionLabel: "2026-27",
      classOptions: [{ id: "class-1", label: "Class 1", sessionLabel: "2026-27" }],
      routeOptions: [],
      feeHeads: [],
      paymentModes: [],
    });
    createClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { session_label: "2025-26" },
          error: null,
        }),
      })),
    });

    const { getStudentFormOptions } = await import("@/lib/students/data");
    const options = await getStudentFormOptions();

    expect(options.resolvedSessionLabel).toBe("2026-27");
    expect(options.policySessionLabel).toBe("2026-27");
    expect(options.sessionMismatch).toBe(true);
    expect(options.academicSessionsCurrentLabel).toBe("2025-26");
  });
});
