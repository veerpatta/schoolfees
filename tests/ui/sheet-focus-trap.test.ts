import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Sheet focus trap (audit 1.16)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/ui/sheet.tsx"),
    "utf8",
  );

  it("captures and restores focus on open/close", () => {
    expect(source).toContain("previouslyFocusedRef");
    expect(source).toMatch(/previous\.focus\(\)/);
  });

  it("moves initial focus into the panel when opened", () => {
    expect(source).toMatch(/focusables\[0\]\.focus\(\)/);
    expect(source).toMatch(/panel\.setAttribute\("tabindex"/);
  });

  it("traps Tab and Shift+Tab between the first and last focusable elements", () => {
    expect(source).toMatch(/event\.key !== "Tab"/);
    expect(source).toMatch(/event\.shiftKey/);
    expect(source).toMatch(/last\.focus\(\)/);
    expect(source).toMatch(/first\.focus\(\)/);
  });

  it("queries the standard focusable-elements selector list", () => {
    expect(source).toContain('a[href], button:not([disabled])');
    expect(source).toContain('input:not([disabled])');
    expect(source).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
