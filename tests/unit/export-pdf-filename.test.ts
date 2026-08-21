import { describe, expect, it } from "vitest";
import { readExportSurface } from "../helpers/export-surface";

describe("export PDF filename extension (audit 1.22)", () => {
  const source = readExportSurface();

  it("derives the extension from the format param", () => {
    expect(source).toContain('const extension = format === "pdf" ? "pdf" : "xlsx"');
    expect(source).toContain("formatExportName(filenameBase, extension)");
    expect(source).not.toContain('formatExportName(filenameBase, "xlsx")');
  });
});
