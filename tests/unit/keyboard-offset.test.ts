import { describe, expect, it } from "vitest";

import { computeKeyboardOffset } from "@/lib/system/keyboard-offset-store";

/**
 * How much of the layout viewport the on-screen keyboard covers.
 *
 * The `offsetTop` term is the part that is easy to drop and hard to notice.
 * iOS both shrinks the visual viewport AND shifts it down once the page is
 * scrolled with the keyboard up; ignoring the shift overstates the keyboard by
 * exactly that amount, so anything positioned against the offset drifts upward
 * as the user scrolls — which is what it did.
 */
describe("computeKeyboardOffset", () => {
  it("is the covered height when the keyboard is up (iPhone 14, 390x844)", () => {
    expect(computeKeyboardOffset(844, 508, 0)).toBe(336);
  });

  it("shrinks by however far iOS has shifted the visual viewport", () => {
    expect(computeKeyboardOffset(844, 508, 60)).toBe(276);
  });

  it("is zero with the keyboard down", () => {
    expect(computeKeyboardOffset(844, 844, 0)).toBe(0);
  });

  it("clamps instead of going negative", () => {
    // Reachable mid-gesture on Android, where the layout viewport resizes and
    // can momentarily report smaller than the visual one. A negative offset
    // would push panels off the bottom of the screen.
    expect(computeKeyboardOffset(600, 844, 0)).toBe(0);
    expect(computeKeyboardOffset(844, 508, 400)).toBe(0);
  });

  it("returns whole pixels", () => {
    // Fractional viewport heights are normal on Android at non-integer DPR.
    expect(computeKeyboardOffset(844.4, 508.2, 0)).toBe(336);
    expect(Number.isInteger(computeKeyboardOffset(844.6, 508.1, 0.3))).toBe(true);
  });
});
