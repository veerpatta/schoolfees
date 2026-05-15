import { describe, expect, it } from "vitest";

import { vi } from "vitest";
import { mergeRequiredOfficeSessions } from "@/lib/session/available-sessions";

vi.mock("server-only", () => ({}));

describe("session actions", () => {
  it("always includes required office sessions in the switcher list", () => {
    const rows = mergeRequiredOfficeSessions(
      [
        {
          id: "live",
          session_label: "2026-27",
          status: "active",
        },
      ],
      "2026-27",
    );

    expect(rows.map((row) => row.session_label)).toEqual(
      expect.arrayContaining(["2025-26", "2026-27", "TEST-2026-27"]),
    );
    expect(rows.find((row) => row.session_label === "TEST-2026-27")?.id).toBe(
      "required:TEST-2026-27",
    );
    expect(rows.find((row) => row.session_label === "2026-27")?.is_current).toBe(true);
  });

  it("preserves real database rows when required sessions already exist", () => {
    const rows = mergeRequiredOfficeSessions(
      [
        {
          id: "test-db",
          session_label: "TEST-2026-27",
          status: "active",
        },
      ],
      "2026-27",
    );

    expect(rows.find((row) => row.session_label === "TEST-2026-27")?.id).toBe("test-db");
  });
});
