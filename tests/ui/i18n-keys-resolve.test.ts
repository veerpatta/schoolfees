import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every `t("key")` must resolve in messages/en.json.
 *
 * next-intl throws at render time on a missing key, so a typo takes the whole
 * route down — and nothing in typecheck, lint or the build sees it. The phone
 * work added ~230 keys across five namespaces, which is exactly the kind of
 * change where one gets forgotten.
 *
 * Only the en catalogue is checked here; mobile-app-i18n.test.ts already
 * asserts hi and hi-en carry the same keys as en for the MobileApp namespace.
 */

const repoRoot = process.cwd();
const messages = JSON.parse(readFileSync(join(repoRoot, "src/messages/en.json"), "utf8"));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function hasKey(namespace: string, key: string): boolean {
  let node: unknown = messages;
  for (const part of namespace.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "object" && node !== null && key in node;
}

describe("translation keys resolve", () => {
  it("finds every t(...) key in the en catalogue", () => {
    const files = ["src"]
      .flatMap((root) => walk(join(repoRoot, root)))
      .filter((file) => /\.tsx?$/.test(file));

    const missing: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const bindings = [
        ...source.matchAll(
          /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g,
        ),
      ];
      if (bindings.length === 0) continue;

      for (const [, handle, namespace] of bindings) {
        const calls = source.matchAll(
          new RegExp(String.raw`\b${handle}\(\s*"([A-Za-z0-9_.]+)"`, "g"),
        );
        for (const call of calls) {
          if (!hasKey(namespace, call[1])) {
            missing.push(
              `${relative(repoRoot, file).split("\\").join("/")} — ${handle}("${call[1]}") in ${namespace}`,
            );
          }
        }
      }
    }

    expect(missing, `missing translation keys:\n${missing.join("\n")}`).toEqual([]);
  });
});
