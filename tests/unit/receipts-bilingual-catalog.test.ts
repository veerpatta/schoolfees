import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `messages/receipts-bilingual.json` is a compact slice of the `Receipts`
 * namespace (en + hi) imported by the client receipt preview so it doesn't
 * pull the full ~190 KB dictionaries into the browser bundle. This test keeps
 * the slice byte-for-byte in sync with the source dictionaries — edit a
 * Receipts string in en.json/hi.json and you must regenerate the slice.
 */
function read(file: string) {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", file), "utf-8"));
}

describe("receipts-bilingual.json slice", () => {
  const slice = read("receipts-bilingual.json");
  const en = read("en.json").Receipts;
  const hi = read("hi.json").Receipts;

  it("matches the English Receipts namespace exactly", () => {
    expect(slice.en).toEqual(en);
  });

  it("matches the Hindi Receipts namespace exactly", () => {
    expect(slice.hi).toEqual(hi);
  });
});
