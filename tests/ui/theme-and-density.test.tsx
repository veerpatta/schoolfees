import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DensityToggle } from "@/components/ui/density-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * SSR smoke tests for the Phase 0 chrome controls.
 *
 * Both toggles are client components but the project's test setup runs in
 * the `node` environment, so we assert the pre-mount placeholder render
 * path — the same path that ships in the HTML payload before hydration.
 * What we care about here:
 *   - Neither toggle throws during SSR.
 *   - Both render an accessible label so screen readers see them.
 */
describe("Phase 0 chrome controls — SSR smoke", () => {
  it("ThemeToggle renders a placeholder with an accessible label", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toContain("aria-label=");
    expect(html.toLowerCase()).toContain("theme");
  });

  it("DensityToggle renders an accessible label and defaults to cozy", () => {
    const html = renderToStaticMarkup(<DensityToggle />);
    expect(html).toContain("aria-label=");
    // Outside a provider the default density is cozy, so the title hints at
    // switching to compact.
    expect(html.toLowerCase()).toContain("compact");
  });

  it("ThemeToggle labeled variant renders text content", () => {
    const html = renderToStaticMarkup(<ThemeToggle variant="labeled" />);
    expect(html).toContain("Theme");
  });
});
