import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("transactions bulk-print confirmation", () => {
  const source = readRepoFile("components/transactions/transactions-client-shell.tsx");

  it("uses the inverted guard so OK opens all and Cancel aborts (audit 1.1)", () => {
    // Before the fix the code read:
    //   const proceed = window.confirm(...split into batches?...);
    //   if (proceed) return;   <-- inverted; OK aborted, Cancel opened all
    // After the fix the prompt asks "Open all anyway?" and the guard is
    // `if (!proceed) return;` so OK opens all tabs and Cancel aborts.
    expect(source).not.toMatch(/Open them in smaller batches\?/);
    expect(source).toMatch(/Open all .* anyway\?/);
    expect(source).toContain("if (!proceed) return;");
    expect(source).not.toContain("if (proceed) return;");
  });

  it("still gates the confirm prompt on the per-tab cap", () => {
    expect(source).toContain("RECEIPT_BULK_PRINT_CAP");
    expect(source).toMatch(/if \(overCap\) \{/);
  });

  it("opens tabs via window.open after the guard passes", () => {
    expect(source).toMatch(/window\.open\(href, "_blank", "noopener"\)/);
  });
});
