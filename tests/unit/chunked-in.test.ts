import { describe, expect, it } from "vitest";

import { chunkArray, fetchInChunks } from "@/lib/helpers/chunk";

describe("chunkArray", () => {
  it("returns no chunks for an empty list", () => {
    expect(chunkArray([], 200)).toEqual([]);
  });

  it("splits an exact multiple into equal chunks", () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("puts the remainder into a final short chunk", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => chunkArray([1], 0)).toThrow();
    expect(() => chunkArray([1], -1)).toThrow();
  });
});

describe("fetchInChunks", () => {
  it("concatenates rows across chunks in order", async () => {
    const seenChunks: string[][] = [];
    const result = await fetchInChunks(["a", "b", "c"], 2, async (chunk) => {
      seenChunks.push(chunk);
      return { data: chunk.map((id) => `row-${id}`), error: null };
    });

    expect(seenChunks).toEqual([["a", "b"], ["c"]]);
    expect(result).toEqual({ data: ["row-a", "row-b", "row-c"], error: null });
  });

  it("returns an empty result without calling the fetcher for no ids", async () => {
    let calls = 0;
    const result = await fetchInChunks([], 2, async () => {
      calls += 1;
      return { data: [], error: null };
    });

    expect(calls).toBe(0);
    expect(result).toEqual({ data: [], error: null });
  });

  it("stops at the first chunk error and surfaces it", async () => {
    let calls = 0;
    const result = await fetchInChunks(["a", "b", "c", "d"], 2, async () => {
      calls += 1;
      return calls === 1
        ? { data: ["ok"], error: null }
        : { data: null, error: { message: "boom" } };
    });

    expect(calls).toBe(2);
    expect(result.error).toEqual({ message: "boom" });
  });

  it("treats null chunk data as empty", async () => {
    const result = await fetchInChunks(["a"], 5, async () => ({ data: null, error: null }));
    expect(result).toEqual({ data: [], error: null });
  });
});
