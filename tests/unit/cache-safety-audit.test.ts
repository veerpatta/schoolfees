import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function unstableCacheBlocks(source: string) {
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("unstable_cache(", cursor);
    if (start === -1) break;

    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }

    blocks.push(source.slice(start, end));
    cursor = end;
  }

  return blocks;
}

describe("unstable_cache cross-user safety audit", () => {
  it("does not key lib data caches by requesting user identity", () => {
    const files = [
      "lib/dashboard/data.ts",
      "lib/payments/data.ts",
      "lib/defaulters/data.ts",
    ];

    for (const file of files) {
      for (const block of unstableCacheBlocks(readRepoFile(file))) {
        expect(block, file).not.toMatch(/\b(userId|user_id|auth\.uid|currentUser|staffId|actorId)\b/i);
      }
    }
  });

  it("keeps Fee Setup collection loading outside unstable_cache because it uses request cookies", () => {
    const feePolicy = readRepoFile("lib/fees/policy.ts");

    expect(feePolicy).not.toMatch(/unstable_cache\(\s*loadFeeCollectionsUncached/);
    expect(feePolicy).toContain("loadFeeCollectionsUncached");
  });
});
