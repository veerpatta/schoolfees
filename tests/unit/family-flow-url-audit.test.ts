import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("family flow URL audit", () => {
  it("does not leave the old query-string family payment route in source", () => {
    const files = [
      "components/students/family-panel.tsx",
      "app/protected/students/families/page.tsx",
      "components/payments/family-success-sheet.tsx",
    ];

    for (const file of files) {
      expect(readRepoFile(file), file).not.toContain("/protected/payments/family?group=");
    }
  });

  it("builds family-flow links through the shared session helper", () => {
    expect(readRepoFile("components/students/family-panel.tsx")).toContain("appendSessionParam");
    expect(readRepoFile("app/protected/students/families/page.tsx")).toContain("appendSessionParam");
    expect(readRepoFile("components/payments/family-success-sheet.tsx")).toContain("appendSessionParam");
  });
});
