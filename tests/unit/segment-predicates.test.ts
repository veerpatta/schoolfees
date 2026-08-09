import { describe, expect, it, vi } from "vitest";

import { applySegmentFilters, familiesInSelection } from "@/lib/segments/apply";
import { SEGMENT_BY_ID, type SegmentId } from "@/lib/segments/student-segments";

vi.mock("server-only", () => ({}));

/**
 * OR within a family, AND across families.
 *
 * This is the rule that decides whether the filter bar feels usable or broken.
 * The money segments are mutually exclusive buckets — a student is overdue or
 * fully paid, never both — so ANDing two of them returns an empty list, and the
 * user reasonably concludes the feature does not work. Two segments from
 * different families are two different questions, and must both hold.
 */

type Call = { method: "or" | "eq"; args: unknown[] };

function recordingQuery() {
  const calls: Call[] = [];
  const query = {
    calls,
    or(filters: string) {
      calls.push({ method: "or", args: [filters] });
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", args: [column, value] });
      return query;
    },
  };
  return query;
}

function predicatesFor(segments: SegmentId[]) {
  const query = recordingQuery();
  applySegmentFilters(query, segments);
  return query.calls;
}

describe("applySegmentFilters", () => {
  it("touches nothing when no segment is selected", () => {
    expect(predicatesFor([])).toEqual([]);
  });

  it("uses a plain equality for a single segment", () => {
    expect(predicatesFor(["overdue"])).toEqual([
      { method: "eq", args: [SEGMENT_BY_ID.overdue.column, true] },
    ]);
  });

  it("ORs two segments from the same family into one group", () => {
    const calls = predicatesFor(["overdue", "fullyPaid"]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("or");
    expect(calls[0].args[0]).toBe(
      `${SEGMENT_BY_ID.overdue.column}.is.true,${SEGMENT_BY_ID.fullyPaid.column}.is.true`,
    );
  });

  it("ANDs across families by emitting one call per family", () => {
    // Two separate calls; PostgREST parenthesises each and ANDs the groups.
    const calls = predicatesFor(["overdue", "onTransport"]);

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.method === "eq")).toBe(true);
    expect(calls.map((call) => call.args[0])).toEqual([
      SEGMENT_BY_ID.overdue.column,
      SEGMENT_BY_ID.onTransport.column,
    ]);
  });

  it("mixes both rules: OR inside money, AND against fee profile", () => {
    const calls = predicatesFor(["overdue", "fullyPaid", "discountRte"]);

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("or");
    expect(calls[1]).toEqual({ method: "eq", args: [SEGMENT_BY_ID.discountRte.column, true] });
  });

  it("emits families in a fixed order regardless of selection order", () => {
    const forward = predicatesFor(["discountRte", "overdue"]);
    const reverse = predicatesFor(["overdue", "discountRte"]);
    expect(forward).toEqual(reverse);
  });

  it("never emits a raw segment id — only view columns", () => {
    const calls = predicatesFor(["overdue", "fullyPaid", "onTransport", "missingPhone"]);
    const emitted = calls.map((call) => String(call.args[0])).join(" ");

    for (const segment of ["overdue", "fullyPaid", "onTransport", "missingPhone"] as const) {
      expect(emitted).toContain(SEGMENT_BY_ID[segment].column);
    }
    expect(emitted).not.toMatch(/\bfullyPaid\b/);
  });
});

describe("familiesInSelection", () => {
  it("lists each represented family once, in definition order", () => {
    expect(familiesInSelection(["discountRte", "overdue", "fullyPaid"])).toEqual([
      "money",
      "feeProfile",
    ]);
  });

  it("is empty for an empty selection", () => {
    expect(familiesInSelection([])).toEqual([]);
  });
});
