import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The reduced-motion block in globals.css silences animations by EXPLICIT
 * class name — new animation utilities are not covered automatically. Every
 * animating class must therefore be listed there, or a motion-sensitive user
 * gets the animation anyway. This test enforces that contract.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function reducedMotionBlock(): string {
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(start).toBeGreaterThan(-1);
  // Walk braces so the block boundary is exact rather than guessed.
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error("Unterminated reduced-motion block");
}

describe("reduced-motion contract", () => {
  const block = reducedMotionBlock();

  it("covers every animation utility class defined in globals.css", () => {
    // Collect classes whose rule body sets an `animation:` shorthand.
    const animatingClasses = new Set<string>();
    const rulePattern = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = rulePattern.exec(css)) !== null) {
      const [, className, body] = match;
      if (/\banimation:\s*[a-zA-Z]/.test(body)) {
        animatingClasses.add(className);
      }
    }

    expect(animatingClasses.size).toBeGreaterThan(5);

    const uncovered = [...animatingClasses].filter(
      (className) => !block.includes(`.${className}`),
    );
    expect(uncovered).toEqual([]);
  });

  it("renders the success check as already-complete when motion is reduced", () => {
    expect(block).toContain(".anim-check-draw");
    // Silencing the draw alone would leave an invisible (fully offset) stroke.
    expect(block).toMatch(/stroke-dashoffset:\s*0\s*!important/);
  });
});
