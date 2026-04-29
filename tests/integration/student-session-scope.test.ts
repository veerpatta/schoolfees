import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("student session scope helpers", () => {
  it("filters class options by academic session", async () => {
    const { getClassOptionsForSession } = await import("@/lib/students/data");

    const filtered = getClassOptionsForSession(
      [
        { id: "class-prod-1", label: "Class 1", sessionLabel: "2026-27" },
        { id: "class-test-1", label: "Class 1", sessionLabel: "TEST-2026-27" },
      ],
      "TEST-2026-27",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      id: "class-test-1",
      sessionLabel: "TEST-2026-27",
    });
  });
});
