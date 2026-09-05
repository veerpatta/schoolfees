import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Fee Setup preview and the engine that applies it must resolve policy from
 * the same inputs.
 *
 * `src/modules/fees/data/regeneration.ts` computes what the office is shown; the plan it
 * approves is then applied by `src/modules/fees/data/generator.ts`. They call the same
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
    for (const file of ["src/modules/fees/data/regeneration.ts", "src/modules/fees/data/generator.ts"]) {
      expect(resolverCall(read(file)), `${file} must pass conventional discounts`).toContain(
        "conventionalDiscountAssignments",
      );
    }
  });

  it("both read the same four policy inputs", () => {
    const preview = resolverCall(read("src/modules/fees/data/regeneration.ts"));
    const apply = resolverCall(read("src/modules/fees/data/generator.ts"));

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

  it("the preview holds exactly the two rows the generator holds, and nothing else", () => {
    // Money settles the installments oldest-first at read time, so a row
    // carrying a payment is repriced like any other. Only an active EMI plan
    // or a due date moving on paid money still holds a row -- and the preview
    // must say so for exactly the rows the apply step will hold, or the office
    // is shown "held for review" for a row that then silently changes, or the
    // reverse.
    const preview = read("src/modules/fees/data/regeneration.ts");
    const apply = read("src/modules/fees/data/generator.ts");

    for (const file of [preview, apply]) {
      expect(file).toContain("in_repayment_plan");
      expect(file).toContain("due_date_changed");
      expect(file).not.toContain("paid-floor-allocation");
      expect(file).toContain("student_repayment_plan_items");
    }
    expect(apply).toContain('kind: "write"');
    expect(preview).toContain("charge_rise_on_unsettled");
    expect(preview).toContain("discount_reduces_unpaid");
  });
});
