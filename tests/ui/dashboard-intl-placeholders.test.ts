import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * next-intl throws FORMATTING_ERROR at RENDER time when a message with a
 * placeholder is called without it — typecheck and build both pass, and the
 * page still 500s for the user. This walks every `t("key")` call in the
 * dashboard and fails if the matching message declares placeholders.
 *
 * Regression: `t("lateFeeSeparate")` shipped without its {amount}, throwing on
 * every dashboard render until it was caught in the server log.
 */
describe("dashboard intl placeholders", () => {
  it("never calls a placeholder message without its values", () => {
    const source = readRepoFile("app/protected/dashboard/page.tsx");
    const messages = JSON.parse(readRepoFile("messages/en.json")) as {
      Dashboard: Record<string, string>;
    };

    // `t("someKey")` with no second argument.
    const bareCalls = [...source.matchAll(/\bt\("([A-Za-z0-9_]+)"\s*\)/g)].map((m) => m[1]);
    const offenders = bareCalls.filter((key) => {
      const message = messages.Dashboard[key];
      return typeof message === "string" && /\{[A-Za-z0-9_]+\}/.test(message);
    });

    expect(offenders, `these need their placeholder values: ${offenders.join(", ")}`).toEqual([]);
  });
});
