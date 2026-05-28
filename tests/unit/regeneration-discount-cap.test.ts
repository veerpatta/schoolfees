import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Audit 1.9 — Regeneration discount cap must use the real annual total and
 * must not silently clamp a negative base to zero. A republish that pushes
 * baseAmount negative would otherwise zero out unpaid installments while
 * the migration's protect-paid-rows guard kept the already-paid rows intact
 * — a silent under-charge.
 */
describe("regeneration discount cap uses real annual total (audit 1.9)", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/fees/regeneration.ts"),
    "utf8",
  );

  it("cap check compares discount against resolved.breakdown.annualTotal, not a hand-rolled sum", () => {
    // The old (audited) code used the legacy `grossBaseBeforeDiscount` fallback
    // that summed coreHeads + customHeads but omitted books and custom-other
    // heads. The fix asserts the cap against the resolved annualTotal directly.
    const fnIdx = source.indexOf("async function loadPlan");
    expect(fnIdx).toBeGreaterThan(0);
    const fnEnd = source.indexOf("\nasync function", fnIdx + 1);
    const body = fnEnd > 0 ? source.slice(fnIdx, fnEnd) : source.slice(fnIdx);

    // The cap check must reference the resolved breakdown's annualTotal so
    // book fees and custom heads contribute to the gross.
    expect(body).toMatch(
      /resolved\.breakdown\.annualTotal\s*<\s*discountAmount|discountAmount\s*>\s*resolved\.breakdown\.annualTotal/,
    );
  });

  it("baseAmount is no longer Math.max(...,0)-clamped before splitAcrossInstallments", () => {
    const fnIdx = source.indexOf("async function loadPlan");
    const fnEnd = source.indexOf("\nasync function", fnIdx + 1);
    const body = fnEnd > 0 ? source.slice(fnIdx, fnEnd) : source.slice(fnIdx);

    // The legacy non-workbook path used:
    //   splitAcrossInstallments(Math.max(baseAmount, 0), ...);
    // which masked a negative baseAmount. Post-fix, baseAmount is validated
    // upstream so this clamp is gone (or replaced with a throw).
    expect(body).not.toMatch(/splitAcrossInstallments\(\s*Math\.max\(baseAmount,\s*0\)/);
  });
});
