import { describe, expect, it } from "vitest";

import { DENSITY_SAFE_DEFAULT } from "@/lib/design/density-context";

/**
 * Locks the inert "no provider mounted" contract that `useDensity()`
 * returns. We assert against the exported constant directly — calling
 * `useDensity()` here would be an invalid React hook call (it relies on
 * `useContext`, which requires a component render context).
 *
 * The hook's runtime guarantee is `useContext(DensityContext) ?? DENSITY_SAFE_DEFAULT`,
 * so the constant IS the contract.
 */
describe("DENSITY_SAFE_DEFAULT — useDensity outside provider", () => {
  it("defaults to cozy density", () => {
    expect(DENSITY_SAFE_DEFAULT.density).toBe("cozy");
  });

  it("exposes no-op mutators that do not throw", () => {
    expect(() => DENSITY_SAFE_DEFAULT.setDensity("compact")).not.toThrow();
    expect(() => DENSITY_SAFE_DEFAULT.toggleDensity()).not.toThrow();
    // The contract is inert — density stays cozy regardless of mutator calls.
    expect(DENSITY_SAFE_DEFAULT.density).toBe("cozy");
  });

  it("is frozen so consumers cannot mutate the shared default", () => {
    expect(Object.isFrozen(DENSITY_SAFE_DEFAULT)).toBe(true);
  });
});
