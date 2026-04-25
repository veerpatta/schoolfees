import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SEARCH_DIRS = ["app", "components", "lib", "tests"];
const EXTENSIONS = new Set([".ts", ".tsx", ".sql"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") {
        return [];
      }

      return walk(fullPath);
    }

    return EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf("."))) ? [fullPath] : [];
  });
}

describe("class active filters", () => {
  it("does not query classes.is_active", () => {
    const offenders = SEARCH_DIRS.flatMap((dir) => walk(join(ROOT, dir))).flatMap((file) => {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      const expectsClassIsActive = lines.some((line, index) => {
        if (!line.includes('.from("classes")') && !line.includes(".from('classes')")) {
          return false;
        }

        const queryLines = lines.slice(index, index + 12);
        const nextUnrelatedQuery = queryLines.findIndex(
          (candidate, offset) =>
            offset > 0 &&
            (candidate.trim().startsWith("supabase") || candidate.trim().endsWith(";")),
        );
        const scopedLines =
          nextUnrelatedQuery === -1 ? queryLines : queryLines.slice(0, nextUnrelatedQuery);
        const scopedText = scopedLines.join("\n");

        return (
          scopedText.includes('.eq("is_active", true)') ||
          scopedText.includes(".eq('is_active', true)")
        );
      });

      return expectsClassIsActive ? [file.replace(`${ROOT}\\`, "")] : [];
    });

    expect(offenders).toEqual([]);
  });
});
