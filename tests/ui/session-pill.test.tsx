import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/protected/dashboard",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/protected/session/actions", () => ({
  listAvailableSessionsAction: vi.fn(async () => []),
  setViewSessionAction: vi.fn(async () => ({ success: true })),
}));

describe("SessionPill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a production session without the TEST tag", async () => {
    const { SessionPill } = await import("@/components/admin/session-pill");

    const html = renderToStaticMarkup(
      <SessionPill
        currentLabel="2026-27"
        isTest={false}
        initialSessions={[
          { id: "current", session_label: "2026-27", status: "active", is_current: true },
          { id: "archived", session_label: "2025-26", status: "archived", is_current: false },
          { id: "test", session_label: "TEST-2026-27", status: "active", is_current: false },
        ]}
      />,
    );

    expect(html).toContain("2026-27");
    expect(html).not.toContain("border-fuchsia-500");
    expect(html).toContain("Active");
  });

  it("renders an archived production session as Other production", async () => {
    const { SessionPill } = await import("@/components/admin/session-pill");

    const html = renderToStaticMarkup(
      <SessionPill
        currentLabel="2025-26"
        isTest={false}
        initialSessions={[
          { id: "current", session_label: "2026-27", status: "active", is_current: true },
          { id: "archived", session_label: "2025-26", status: "archived", is_current: false },
        ]}
      />,
    );

    expect(html).toContain("2025-26");
    expect(html).toContain("Other production");
    expect(html).not.toContain("border-fuchsia");
  });

  it("renders TEST sessions with a magenta border and tag", async () => {
    const { SessionPill } = await import("@/components/admin/session-pill");

    const html = renderToStaticMarkup(
      <SessionPill
        currentLabel="TEST-2026-27"
        isTest
        initialSessions={[
          { id: "current", session_label: "2026-27", status: "active", is_current: true },
          { id: "test", session_label: "TEST-2026-27", status: "active", is_current: false },
        ]}
      />,
    );

    expect(html).toContain("TEST-2026-27");
    expect(html).toContain("TEST");
    expect(html).toContain("border-fuchsia");
    expect(html).toContain("Test / UAT / DEMO");
  });
});
