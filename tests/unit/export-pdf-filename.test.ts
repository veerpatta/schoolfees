import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("export PDF filename extension (audit 1.22)", () => {
  const source = readFileSync(
    join(process.cwd(), "app/protected/exports/[exportType]/route.ts"),
    "utf8",
  );

  it("derives the extension from the format param", () => {
    expect(source).toContain('const extension = format === "pdf" ? "pdf" : "xlsx"');
    expect(source).toContain("formatExportName(filenameBase, extension)");
    expect(source).not.toContain('formatExportName(filenameBase, "xlsx")');
  });
});
