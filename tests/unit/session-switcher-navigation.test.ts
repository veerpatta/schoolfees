import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/protected/dashboard",
  useRouter: () => ({ prefetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/protected/session/actions", () => ({
  listAvailableSessionsAction: vi.fn(async () => []),
  setViewSessionAction: vi.fn(async () => ({ success: true })),
}));

import {
  buildSessionSwitchHref,
  SESSION_SWITCHER_STALE_PARAM_NAMES,
} from "@/components/admin/session-pill";

describe("session switcher navigation", () => {
  it("switches by URL session param without carrying stale page filters", () => {
    const href = buildSessionSwitchHref(
      "/protected/students",
      new URLSearchParams(
        "session=2026-27&classId=old-class&routeId=old-route&status=active&fromDate=2026-04-01&toDate=2026-05-01&q=old",
      ),
      "TEST-2026-27",
    );

    expect(href).toBe("/protected/students?session=TEST-2026-27");
  });

  it("encodes normalized session labels in the target URL", () => {
    const href = buildSessionSwitchHref(
      "/protected/dashboard",
      new URLSearchParams("session=2026-27"),
      "UAT-2026-27",
    );

    expect(href).toBe("/protected/dashboard?session=UAT-2026-27");
  });

  it("documents the stale params cleared on every session switch", () => {
    expect(SESSION_SWITCHER_STALE_PARAM_NAMES).toEqual([
      "classId",
      "routeId",
      "studentId",
      "status",
      "fromDate",
      "toDate",
      "q",
      "search",
      "page",
    ]);
  });
});
