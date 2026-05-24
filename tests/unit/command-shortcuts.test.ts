import { describe, expect, it } from "vitest";

import { SHORTCUTS, groupShortcuts } from "@/lib/command/shortcuts";

describe("command/shortcuts", () => {
  it("registers the canonical global keys", () => {
    const combos = SHORTCUTS.map((s) => s.combo);
    expect(combos).toContain("Ctrl/Cmd + K");
    expect(combos).toContain("?");
    expect(combos).toContain("Esc");
  });

  it("groups shortcuts in display order and never returns empty buckets", () => {
    const grouped = groupShortcuts();
    expect(grouped.length).toBeGreaterThan(0);
    for (const bucket of grouped) {
      expect(bucket.items.length).toBeGreaterThan(0);
    }
    // Global must lead the list.
    expect(grouped[0].group).toBe("Global");
  });

  it("does not silently swallow duplicate combos", () => {
    const seen = new Set<string>();
    for (const s of SHORTCUTS) {
      expect(seen.has(s.combo)).toBe(false);
      seen.add(s.combo);
    }
  });
});
