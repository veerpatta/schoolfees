import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locks in the dark-mode token contract for "Ledger Calm at night".
 *
 * If anyone removes a `.dark { … }` block or drops one of these semantic
 * roles, contrast in dark mode silently regresses across the app. This
 * test catches that at CI time instead of in production.
 */
const REQUIRED_DARK_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--surface",
  "--surface-2",
  "--surface-3",
  "--muted-foreground",
  "--border",
  "--input",
  "--primary",
  "--accent",
  "--ring",
  "--success",
  "--warning",
  "--destructive",
  "--info",
  "--scrim",
];

describe("dark-mode tokens", () => {
  it("globals.css defines a .dark scope containing every semantic token", async () => {
    const css = await readFile(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );

    expect(css).toMatch(/\.dark\s*\{/);

    // Slice out the .dark { … } block by finding the opening brace and the
    // matching closing brace. Brittle vs nested rules — but Ledger Calm only
    // has one flat .dark { … } block today, and that's enforced by the test.
    const start = css.indexOf(".dark");
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const darkBlock = css.slice(open, close);

    for (const token of REQUIRED_DARK_TOKENS) {
      expect(darkBlock).toContain(token);
    }
  });
});
