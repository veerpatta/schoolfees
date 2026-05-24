import { describe, expect, it } from "vitest";

import { actionsProvider } from "@/components/command/providers/actions";

/**
 * Static providers should be deterministic — given the same query they
 * always return the same items in the same order. We rely on that to
 * keep palette result ordering stable across re-renders.
 */
describe("command/providers/actions", () => {
  it("returns the full action list for an empty query", async () => {
    const items = await actionsProvider.fetch("", new AbortController().signal);
    expect(items.length).toBeGreaterThan(0);
    const ids = items.map((item) => item.id);
    expect(ids).toContain("action:post-payment");
    expect(ids).toContain("action:open-defaulters");
    expect(ids).toContain("action:keyboard-shortcuts");
  });

  it("filters by label, hint, and keyword", async () => {
    const labelMatch = await actionsProvider.fetch("payment", new AbortController().signal);
    expect(labelMatch.some((item) => item.id === "action:post-payment")).toBe(true);

    const keywordMatch = await actionsProvider.fetch("xlsx", new AbortController().signal);
    expect(keywordMatch.some((item) => item.id === "action:export-collections")).toBe(true);

    const hintMatch = await actionsProvider.fetch("dark", new AbortController().signal);
    expect(hintMatch.length).toBeGreaterThan(0);
  });

  it("returns an empty list for queries no item matches", async () => {
    const items = await actionsProvider.fetch("zzzzz-no-match", new AbortController().signal);
    expect(items).toEqual([]);
  });
});
