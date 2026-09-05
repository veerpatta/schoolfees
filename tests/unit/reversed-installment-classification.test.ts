import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A fully reversed installment is not "partially paid".
 *
 * `classifyCancelLock` used to branch on gross `paidAmount > 0`, so an
 * installment whose payment was fully reversed (paid +5000, adjustment −5000,
 * net 0) was reported to staff in Session Health as "Partially paid
 * installment" — a blocker message describing money that is not there. It now
 * classifies on the net and falls through to `adjustment_posted`, which is
 * both true and still locked: the ledger history is real and worth a human
 * look before cancellation.
 *
 * The runtime half of this guarantee lives in
 * scripts/verify-live-fee-health.mjs — the installment ↔ ledger invariant,
 * zero tolerance across every session.
 */

describe("reversed installments are classified on the net", () => {
  const generator = readFileSync(join(process.cwd(), "src/modules/fees/data/generator.ts"), "utf8");

  it("the paid branch requires net applied money, not just gross payments", () => {
    // One classifier still carries the paid/partial vocabulary: the withdrawal
    // path (classifyCancelLock). The regeneration path used to as well, until
    // 20260905064847 made money settle oldest-first at read time and a row
    // carrying a payment stopped being a frozen bill -- it no longer classes
    // rows as paid or partial at all.
    const netted = generator.match(/if \(paidAmount > 0 && appliedAmount > 0\) \{/g);
    expect(netted).toHaveLength(1);
    // The gross-only form must not come back in either.
    expect(generator).not.toMatch(/if \(paidAmount > 0\) \{\s*\n\s*return appliedAmount >=/);
  });

  it("the fee-health script carries the ledger invariant", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/verify-live-fee-health.mjs"),
      "utf8",
    );
    expect(script).toContain("Installment ↔ Ledger Invariant");
    expect(script).toContain("INVARIANT FAILURE");
    // It must fail the process, not just report.
    expect(script).toContain("process.exit(1);");
  });
});
