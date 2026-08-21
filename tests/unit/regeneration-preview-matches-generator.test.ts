import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Fee Setup preview and the engine that applies it must resolve policy from
 * the same inputs.
 *
 * `src/lib/fees/regeneration.ts` computes what the office is shown; the plan it
 * approves is then applied by `src/lib/fees/generator.ts`. They call the same
 * resolver, but the preview omitted `conventionalDiscountAssignments` — so for
 * every RTE, Staff Child and 3rd Child student the screen showed a tuition the
 * apply step never wrote. A preview that does not predict the apply is worse
 * than no preview: it is an approval given for numbers that never existed.
 *
 * Source assertions rather than behaviour because the failure is an omitted
 * argument, not a wrong branch — there is no input that makes a missing
 * parameter appear.
 */

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolverCall(source: string) {
  const start = source.indexOf("resolveStudentPolicyBreakdown({");
  expect(start, "resolveStudentPolicyBreakdown({ ... }) call not found").toBeGreaterThan(-1);

  const end = source.indexOf("});", start);
  expect(end, "could not find the end of the resolver call").toBeGreaterThan(-1);

  return source.slice(start, end);
}

describe("the Fee Setup preview resolves policy the same way the apply does", () => {
  it("both pass conventionalDiscountAssignments to the resolver", () => {
    for (const file of ["src/lib/fees/regeneration.ts", "src/lib/fees/generator.ts"]) {
      expect(resolverCall(read(file)), `${file} must pass conventional discounts`).toContain(
        "conventionalDiscountAssignments",
      );
    }
  });

  it("both read the same four policy inputs", () => {
    const preview = resolverCall(read("src/lib/fees/regeneration.ts"));
    const apply = resolverCall(read("src/lib/fees/generator.ts"));

    for (const input of [
      "policy:",
      "schoolDefault:",
      "classDefault",
      "routeDefault",
      "studentOverride",
      "hasTransportRoute",
    ]) {
      expect(preview, `preview is missing ${input}`).toContain(input);
      expect(apply, `apply is missing ${input}`).toContain(input);
    }
  });

  it("the preview allows a rise on an unsettled row, exactly as the generator does", () => {
    // classifyInstallmentLock returns `safe_increase` when
    // `appliedAmount < existing.amount_due`. The preview mirrors that with
    // `appliedAmount < amountDue` inside its own safe-move test. If one side
    // relaxes and the other does not, the office is shown "held for review" for
    // a row that then silently changes, or the reverse.
    const preview = read("src/lib/fees/regeneration.ts");

    expect(preview).toContain("appliedAmount < amountDue");
    expect(preview).toContain("charge_rise_on_unsettled");
    expect(read("src/lib/fees/generator.ts")).toContain('kind: "safe_increase"');
  });
});
