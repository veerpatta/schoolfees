import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A student never leaves the roll owing money via promotion.
 *
 * Graduation sets `status = 'graduated'` and the next ledger regeneration
 * cancels every clean unpaid installment of a non-active student
 * (lib/fees/generator.ts) — so an unguarded year-end rollover was a silent,
 * bulk write-off from Admin Tools. School rule since 2026-08-18: a leaver
 * never rolls over, and a debtor is settled or explicitly written off first.
 *
 * Source assertions, because the builder needs a live Supabase session. They
 * pin the three load-bearing pieces: the preview marks debtors as skip, the
 * apply path re-checks LIVE numbers (decisions are editable in between), and
 * the dues read fails closed.
 */

const data = readFileSync(join(process.cwd(), "src/modules/promotion/data/queries.ts"), "utf8");

describe("promotion dues guard", () => {
  it("the preview marks a debtor leaving the roll as skip, with the amount in the reason", () => {
    expect(data).toContain("const duesBlocked = wouldLeaveRoll && owesMoney;");
    expect(data).toContain('? "skip"');
    expect(data).toMatch(/Still owes \$\{formatDuesForReason\(owed\)\}/);
  });

  it("graduation AND carrying a non-active student both count as leaving the roll", () => {
    expect(data).toContain(
      'const wouldLeaveRoll = entry.graduates || entry.student.status !== "active";',
    );
    expect(data).toContain(
      'entry.decision === "graduate" || entry.previousStatus !== "active"',
    );
  });

  it("apply re-checks with live numbers and refuses by name", () => {
    // The preview's skip can be flipped back to graduate by an editable
    // decision, so the apply-side check is the one that actually holds.
    expect(data).toContain("re-checked against LIVE numbers at apply time");
    expect(data).toContain("cannot leave the roll while they still owe");
    // And it points at the two legitimate exits rather than a dead end.
    expect(data).toContain("Collect the dues, or write them off");
  });

  it("the dues read fails closed", () => {
    // A guard that degrades to "no dues found" on a read error waves the
    // write-off through.
    expect(data).toContain(
      "Unable to load outstanding dues for the promotion guard",
    );
  });

  it("the guard's exit actually exists: the recovery queue can write off", () => {
    // The apply error points at "Admin Tools -> Clear dues". That queue is the
    // recovery page, and its rows must carry the write-off action (reusing the
    // audited close-as-discount sheet), gated on finance:write.
    const page = readFileSync(
      join(process.cwd(), "src/app/protected/admin-tools/recovery/page.tsx"),
      "utf8",
    );
    expect(page).toContain("RecoveryWriteOffButton");
    expect(page).toContain('hasRolePermission(staff.appRole, "finance:write")');
    // Both renderings — the phone cards and the desk table.
    expect(page.match(/<RecoveryWriteOffButton/g) ?? []).toHaveLength(2);

    const button = readFileSync(
      join(process.cwd(), "src/modules/students/ui/recovery-write-off-button.tsx"),
      "utf8",
    );
    // Reuses the existing money path; does not post anything itself.
    expect(button).toContain("CloseDueAsDiscountSheet");
    expect(button).not.toContain("supabase");
  });

  it("late fee alone still blocks, because cancellation would erase it too", () => {
    // A late-fee-only debtor is NOT a defaulter (hard rule 8), but their
    // unpaid installment rows still carry the late fee — cancelling the rows
    // on graduation erases the debt without a decision. Both figures gate.
    expect(data).toContain("owed.feesPending > 0 || owed.lateFeePending > 0");
  });
});
