import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * SSR smoke tests for the topbar theme control. (The density toggle was
 * removed — density is now fixed to "cozy" everywhere. The unit test in
 * tests/unit/density-context.test.tsx still locks that contract.)
 */
describe("topbar theme control — SSR smoke", () => {
  it("ThemeToggle renders a placeholder with an accessible label", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toContain("aria-label=");
    expect(html.toLowerCase()).toContain("theme");
  });

  it("ThemeToggle labeled variant renders text content", () => {
    const html = renderToStaticMarkup(<ThemeToggle variant="labeled" />);
    expect(html).toContain("Theme");
  });
});
