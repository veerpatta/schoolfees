import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/protected/dashboard",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/protected/session/actions", () => ({
  listAvailableSessionsAction: vi.fn(async () => []),
  setViewSessionAction: vi.fn(async () => ({ success: true })),
}));

describe("test session body visual", () => {
  it("sets the body marker when SessionPill receives isTest=true", async () => {
    const { syncTestSessionBodyAttribute } = await import("@/components/admin/session-pill");
    const body = { dataset: {} as Record<string, string> };

    const cleanup = syncTestSessionBodyAttribute(body, {
      isTest: true,
      displayLabel: "2026-27",
    });

    expect(body.dataset.vppsTestSession).toBe("true");

    cleanup();
    expect(body.dataset.vppsTestSession).toBeUndefined();
  });

  it("sets the body marker when the resolved display label is a TEST session", async () => {
    const { syncTestSessionBodyAttribute } = await import("@/components/admin/session-pill");
    const body = { dataset: {} as Record<string, string> };

    syncTestSessionBodyAttribute(body, {
      isTest: false,
      displayLabel: "TEST-2026-27",
    });

    expect(body.dataset.vppsTestSession).toBe("true");
  });

  it("removes the body marker when SessionPill resolves a production session", async () => {
    const { syncTestSessionBodyAttribute } = await import("@/components/admin/session-pill");
    const body = { dataset: { vppsTestSession: "true" } as Record<string, string> };

    syncTestSessionBodyAttribute(body, {
      isTest: false,
      displayLabel: "2026-27",
    });

    expect(body.dataset.vppsTestSession).toBeUndefined();
  });
});
