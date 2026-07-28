import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression: the Calls screen scrolled sideways by 63px on a 375px phone.
 *
 * The workspace grid only declares columns at `lg:`, so below that it is a
 * single implicit track. Grid items default to `min-width: auto`, and the call
 * card's metric row has a min-content wider than a phone — so the track
 * resolved to 421px inside a 343px container and pushed the whole page out.
 *
 * `[&>*]:min-w-0` lets the items shrink. Measured live on a 375px viewport
 * before and after. Nothing in typecheck, lint or build sees this class of
 * bug, which is why it gets a targeted guard rather than a blanket lint rule —
 * most breakpoint-only grids are fine; only ones with wide children overflow.
 */
describe("defaulters workspace fits a phone", () => {
  const source = readFileSync(
    join(process.cwd(), "components/defaulters/defaulters-workspace.tsx"),
    "utf8",
  );

  it("lets the workspace grid's children shrink below their min-content", () => {
    // Match the grid by its column definition, then check the tokens on it —
    // asserting a fixed class ORDER made the guard fail the first time an
    // unrelated utility (an `order-*` for the phone's card-first layout) was
    // added, which says nothing about whether the screen still overflows.
    const grid =
      /className="([^"]*lg:grid-cols-\[minmax\(0,1fr\)_minmax\(360px,440px\)\][^"]*)"/.exec(
        source,
      );

    expect(
      grid,
      "the workspace grid class changed — re-measure it on a 375px viewport",
    ).not.toBeNull();
    expect(
      grid?.[1].split(/\s+/),
      "grid items need [&>*]:min-w-0 or the Calls screen scrolls sideways",
    ).toContain("[&>*]:min-w-0");
  });

  it("keeps the wide metric row's min-width behind a breakpoint", () => {
    // md:min-w-[440px] is safe: it only applies from 768px up. The same
    // utility without a breakpoint prefix would apply on a phone and undo
    // the fix above.
    expect(source).toContain("md:min-w-[440px]");

    const classAttributes = source.match(/className="[^"]*"/g) ?? [];
    const offenders = classAttributes.filter((attribute) =>
      // Split into tokens so `md:min-w-[440px]` never matches: a bare utility
      // is its own token, a prefixed one carries the `md:` with it.
      attribute
        .slice('className="'.length, -1)
        .split(/\s+/)
        .some((token) => /^min-w-\[4\d\dpx\]$/.test(token)),
    );

    expect(
      offenders,
      `unprefixed min-width forces the phone layout wide: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
