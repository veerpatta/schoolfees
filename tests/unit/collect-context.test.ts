import { describe, expect, it } from "vitest";

import { COLLECT_SAFE_DEFAULT } from "@/lib/payments/collect-context";

/**
 * Locks the inert "no provider mounted" contract that `useCollect()`
 * returns. We assert against the exported constant directly — calling
 * `useCollect()` here would be an invalid React hook call (it relies on
 * `useContext`, which requires a component render context).
 *
 * The hook's runtime guarantee is `useContext(CollectContext) ?? COLLECT_SAFE_DEFAULT`,
 * so the constant IS the contract.
 */
describe("COLLECT_SAFE_DEFAULT — useCollect outside provider", () => {
  it("starts with a null intent", () => {
    expect(COLLECT_SAFE_DEFAULT.intent).toBeNull();
  });

  it("exposes no-op mutators that do not throw", () => {
    expect(() =>
      COLLECT_SAFE_DEFAULT.open({
        studentId: "00000000-0000-4000-8000-000000000000",
      }),
    ).not.toThrow();
    expect(() => COLLECT_SAFE_DEFAULT.close()).not.toThrow();
    // The contract is inert — intent stays null regardless of mutator calls.
    expect(COLLECT_SAFE_DEFAULT.intent).toBeNull();
  });

  it("is frozen so consumers cannot mutate the shared default", () => {
    expect(Object.isFrozen(COLLECT_SAFE_DEFAULT)).toBe(true);
  });
});
