import "server-only";

import {
  SEGMENT_BY_ID,
  SEGMENT_FAMILIES,
  type SegmentFamily,
  type SegmentId,
} from "@/lib/segments/student-segments";

/**
 * Turn selected segments into PostgREST predicates over `v_student_directory`.
 *
 * **OR within a family, AND across families.** Picking "Overdue" and "Fully
 * paid" has to mean "either", because those two buckets are mutually exclusive —
 * AND them and the list is empty and the filter looks broken. Picking "Overdue"
 * and "On transport" has to mean "both", because they are different questions.
 *
 * Chaining `.or()` twice is how PostgREST expresses that: each call is its own
 * parenthesised group, and groups are ANDed together.
 */

type Filterable<T> = {
  or: (filters: string) => T;
  eq: (column: string, value: unknown) => T;
};

export function applySegmentFilters<T extends Filterable<T>>(
  query: T,
  segments: readonly SegmentId[],
): T {
  if (segments.length === 0) return query;

  let next = query;

  for (const family of SEGMENT_FAMILIES) {
    const columns = segments
      .map((id) => SEGMENT_BY_ID[id])
      .filter((segment) => segment?.family === family)
      .map((segment) => segment.column);

    if (columns.length === 0) continue;

    if (columns.length === 1) {
      // A single column is an equality rather than a one-armed or(), which keeps
      // the generated URL readable when debugging a filter.
      next = next.eq(columns[0], true);
      continue;
    }

    next = next.or(columns.map((column) => `${column}.is.true`).join(","));
  }

  return next;
}

/** The families actually represented in a selection — used for the UI summary. */
export function familiesInSelection(segments: readonly SegmentId[]): SegmentFamily[] {
  const families = new Set<SegmentFamily>();
  for (const id of segments) {
    const def = SEGMENT_BY_ID[id];
    if (def) families.add(def.family);
  }
  return SEGMENT_FAMILIES.filter((family) => families.has(family));
}
