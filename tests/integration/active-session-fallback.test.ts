import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

function makeMaybeSingleQuery<T>(result: { data: T | null; error?: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data,
      error: result.error ?? null,
    }),
  };
}

describe("getActiveSessionLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads active_session_label from app_settings", async () => {
    const appSettingsQuery = makeMaybeSingleQuery({
      data: { value: "TEST-2026-27" },
    });
    const policyQuery = makeMaybeSingleQuery({
      data: { academic_session_label: "2026-27" },
    });

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") return appSettingsQuery;
        if (table === "fee_policy_configs") return policyQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { getActiveSessionLabel } = await import("@/lib/session/active");

    await expect(getActiveSessionLabel()).resolves.toBe("TEST-2026-27");
    expect(appSettingsQuery.eq).toHaveBeenCalledWith("key", "active_session_label");
    expect(policyQuery.maybeSingle).not.toHaveBeenCalled();
  });

  it("falls back to the legacy active fee policy when app_settings is empty", async () => {
    const appSettingsQuery = makeMaybeSingleQuery({
      data: null,
    });
    const policyQuery = makeMaybeSingleQuery({
      data: { academic_session_label: "2026-27" },
    });

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") return appSettingsQuery;
        if (table === "fee_policy_configs") return policyQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { getActiveSessionLabel } = await import("@/lib/session/active");

    await expect(getActiveSessionLabel()).resolves.toBe("2026-27");
    expect(policyQuery.eq).toHaveBeenCalledWith("is_active", true);
  });
});
