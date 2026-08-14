import { describe, expect, it } from "vitest";

import {
  describeScope,
  ENROLLMENT_LABELS,
  resolveScope,
  rowInScope,
  SCOPE_NAMES,
  scopeParams,
  STUDENT_SCOPES,
} from "../../workers/schoolfees-mcp/src/scope.mjs";
import { getFinancialRows } from "../../workers/schoolfees-mcp/src/reads.mjs";

/**
 * The school has two rules for who counts, and merging them is what produced
 * every wrong figure this module exists to prevent:
 *
 *   headcount -> record_status = 'active'
 *   money     -> record_status = 'active' OR total_paid > 0
 *
 * These tests pin both, and pin the refusal to guess when a caller says nothing.
 */

const ACTIVE_PAYER = { record_status: "active", total_paid: 2500, outstanding_amount: 22000 };
const ACTIVE_NEVER_PAID = { record_status: "active", total_paid: 0, outstanding_amount: 24500 };
const LEFT_BUT_PAID = { record_status: "left", total_paid: 7375, outstanding_amount: 2000 };
const LEFT_NEVER_PAID = { record_status: "left", total_paid: 0, outstanding_amount: 0 };
const GRADUATED_OWING = { record_status: "graduated", total_paid: 5000, outstanding_amount: 1500 };
const INACTIVE_CLEAR = { record_status: "inactive", total_paid: 9000, outstanding_amount: 0 };

const EVERYONE = [
  ACTIVE_PAYER,
  ACTIVE_NEVER_PAID,
  LEFT_BUT_PAID,
  LEFT_NEVER_PAID,
  GRADUATED_OWING,
  INACTIVE_CLEAR,
];

function inScope(name: string) {
  return EVERYONE.filter((row) => rowInScope(row, name));
}

describe("student scopes", () => {
  it("counts only enrolled students for headcount", () => {
    expect(inScope("on_roll")).toEqual([ACTIVE_PAYER, ACTIVE_NEVER_PAID]);
  });

  it("counts a student who left owing money as still collectable", () => {
    // The live bug: three left-but-paid students dropped out of expected,
    // collected and pending, hiding Rs 17,250 the ledger was still holding.
    const collectable = inScope("collectable");

    expect(collectable).toContain(LEFT_BUT_PAID);
    expect(collectable).toContain(GRADUATED_OWING);
    expect(collectable).toContain(INACTIVE_CLEAR);
    // A leaver who never paid has had their unpaid installments cancelled, so
    // they carry nothing and this rule adds nobody spurious.
    expect(collectable).not.toContain(LEFT_NEVER_PAID);
  });

  it("treats left_owing as the non-active complement, across all three statuses", () => {
    expect(inScope("left_owing")).toEqual([LEFT_BUT_PAID, GRADUATED_OWING]);
  });

  it("keeps headcount and money deliberately different", () => {
    // Two on the roll; five in financial scope — the two enrolled plus the
    // three who have gone but paid something along the way.
    expect(inScope("on_roll")).toHaveLength(2);
    expect(inScope("collectable")).toHaveLength(5);
    expect(inScope("everyone")).toHaveLength(EVERYONE.length);
  });

  it("expresses each rule as PostgREST filters the database will honour", () => {
    expect(scopeParams("on_roll")).toEqual({ record_status: "eq.active" });
    expect(scopeParams("collectable")).toEqual({
      or: "(record_status.eq.active,total_paid.gt.0)",
    });
    expect(scopeParams("left_owing")).toEqual({
      record_status: "neq.active",
      outstanding_amount: "gt.0",
    });
    expect(scopeParams("everyone")).toEqual({});
  });

  it("refuses to guess when no scope is named", () => {
    // A default is how the old server ended up with money tools quietly reading
    // active-only. There is no default now, and an unnamed scope fails loudly.
    expect(() => resolveScope(undefined)).toThrow(/Every read must name one of/);
    expect(() => resolveScope("active_only")).toThrow(/Unknown student scope/);
    expect(() => scopeParams(null)).toThrow(/Unknown student scope/);
  });

  it("refuses a financial read that does not name a scope", async () => {
    await expect(
      getFinancialRows({}, { sessionLabel: "TEST-2026-27" } as never),
    ).rejects.toThrow(/Every read must name one of/);

    await expect(
      getFinancialRows({}, { scope: "collectable" } as never),
    ).rejects.toThrow(/requires a sessionLabel/);
  });

  it("describes itself so two differing answers can be compared", () => {
    const described = describeScope("collectable", [ACTIVE_PAYER, LEFT_BUT_PAID]);

    expect(described).toMatchObject({
      name: "collectable",
      rule: "record_status = 'active' OR total_paid > 0",
      counted: 2,
      onRoll: 1,
      includedNotOnRoll: 1,
    });
    expect(described.why).toContain("still owes it");
  });

  it("names every enrollment status a student can hold", () => {
    expect(Object.keys(ENROLLMENT_LABELS).sort()).toEqual([
      "active",
      "graduated",
      "inactive",
      "left",
    ]);
    expect(SCOPE_NAMES).toEqual(Object.keys(STUDENT_SCOPES));
  });
});
