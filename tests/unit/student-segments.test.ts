import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EMPTY_SEGMENT_COUNTS,
  SEGMENT_BY_ID,
  SEGMENT_FAMILIES,
  STUDENT_SEGMENTS,
  parseSegments,
  populationSegments,
  segmentCount,
  segmentsEqual,
  segmentsInFamily,
  serializeSegments,
  statusesForSegments,
} from "@/lib/segments/student-segments";

/**
 * The anti-drift guard.
 *
 * A segment is three things that live apart: a boolean column in
 * `v_student_directory`, a key in the `get_student_segment_counts` payload, and
 * a label in three locale files. Nothing in the type system ties them together,
 * so a chip can render, count zero, and filter nothing while every layer looks
 * fine on its own. This test is the tie.
 */

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

// Every migration that touches the directory, discovered rather than listed.
// A hardcoded list goes stale the moment a segment is redefined, and then the
// guard fails for the wrong reason -- which is exactly what happened when
// seg_fully_paid became seg_year_clear.
const MIGRATION_SQL = readdirSync(join(repoRoot, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readRepoFile(`supabase/migrations/${file}`))
  .filter(
    (sql) =>
      sql.includes("v_student_directory") || sql.includes("get_student_segment_counts"),
  )
  .join("\n");

const LOCALES = ["en", "hi", "hi-en"] as const;

describe("student segment definitions", () => {
  it("every segment column exists in the directory view", () => {
    for (const segment of STUDENT_SEGMENTS) {
      expect(
        MIGRATION_SQL.includes(`as ${segment.column}`),
        `${segment.id} declares column "${segment.column}", which no migration defines`,
      ).toBe(true);
    }
  });

  it("every segment count key is produced by the counts RPC", () => {
    for (const segment of STUDENT_SEGMENTS) {
      expect(
        MIGRATION_SQL.includes(`'${segment.countKey}'`),
        `${segment.id} reads count key "${segment.countKey}", which the RPC never emits`,
      ).toBe(true);
    }
  });

  it("every segment label resolves in all three locales", () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(readRepoFile(`messages/${locale}.json`)) as {
        Segments?: Record<string, unknown>;
      };
      const segments = messages.Segments;
      expect(segments, `messages/${locale}.json has no Segments namespace`).toBeTruthy();

      for (const segment of STUDENT_SEGMENTS) {
        expect(
          typeof segments?.[segment.i18nKey],
          `${locale}: Segments.${segment.i18nKey} is missing`,
        ).toBe("string");
      }

      const families = segments?.family as Record<string, unknown> | undefined;
      for (const family of SEGMENT_FAMILIES) {
        expect(typeof families?.[family], `${locale}: Segments.family.${family} is missing`).toBe(
          "string",
        );
      }
    }
  });

  it("ids, columns and count keys are each unique", () => {
    const ids = STUDENT_SEGMENTS.map((segment) => segment.id);
    const columns = STUDENT_SEGMENTS.map((segment) => segment.column);
    const countKeys = STUDENT_SEGMENTS.map((segment) => segment.countKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(columns).size).toBe(columns.length);
    expect(new Set(countKeys).size).toBe(countKeys.length);
  });

  it("every family holds at least one segment and every segment a known family", () => {
    for (const family of SEGMENT_FAMILIES) {
      expect(segmentsInFamily(family).length).toBeGreaterThan(0);
    }
    for (const segment of STUDENT_SEGMENTS) {
      expect(SEGMENT_FAMILIES).toContain(segment.family);
      expect(SEGMENT_BY_ID[segment.id]).toBe(segment);
    }
  });
});

describe("segment URL round-trip", () => {
  it("parses, drops junk, and de-duplicates", () => {
    expect(parseSegments("overdue,onTransport")).toEqual(["overdue", "onTransport"]);
    expect(parseSegments("overdue,notASegment,overdue")).toEqual(["overdue"]);
    expect(parseSegments("")).toEqual([]);
    expect(parseSegments(undefined)).toEqual([]);
    expect(parseSegments(null)).toEqual([]);
  });

  it("emits in definition order so the same selection is always the same URL", () => {
    const forward = parseSegments("overdue,oldBalanceDue");
    const reverse = parseSegments("oldBalanceDue,overdue");
    expect(serializeSegments(forward)).toBe(serializeSegments(reverse));
  });

  it("survives a full round-trip for every defined segment", () => {
    const all = STUDENT_SEGMENTS.map((segment) => segment.id);
    expect(parseSegments(serializeSegments(all))).toEqual(all);
  });

  it("compares selections by membership, not by order", () => {
    expect(segmentsEqual(["overdue", "left"], ["left", "overdue"])).toBe(true);
    expect(segmentsEqual(["overdue"], ["overdue", "left"])).toBe(false);
    expect(segmentsEqual([], [])).toBe(true);
  });
});

describe("enrolment segments drive the status scope", () => {
  it("returns null when no enrolment segment is selected", () => {
    // null means "do not narrow by status" — the caller's own status filter wins.
    expect(statusesForSegments([])).toBeNull();
    expect(statusesForSegments(["overdue", "onTransport"])).toBeNull();
  });

  it("maps the population segments onto record statuses", () => {
    expect(statusesForSegments(["active"])).toEqual(["active"]);
    expect(statusesForSegments(["left"])).toEqual(["left"]);
    expect(statusesForSegments(["active", "left"])?.sort()).toEqual(["active", "left"]);
  });

  it("only counts segments flagged as population as population", () => {
    const flagged = STUDENT_SEGMENTS.filter((segment) => segment.isPopulation).map((s) => s.id);
    expect(populationSegments(flagged).map((segment) => segment.id)).toEqual(flagged);
    expect(populationSegments(["overdue"])).toEqual([]);
  });
});

describe("segmentCount", () => {
  it("reads null while counts are unavailable rather than showing a false zero", () => {
    expect(segmentCount(null, "overdue")).toBeNull();
    expect(segmentCount(EMPTY_SEGMENT_COUNTS, "overdue")).toBeNull();
  });

  it("reads the RPC payload by count key", () => {
    const counts = {
      ...EMPTY_SEGMENT_COUNTS,
      counts: { [SEGMENT_BY_ID.overdue.countKey]: 420 },
    };
    expect(segmentCount(counts, "overdue")).toBe(420);
  });

  it("reads enrolment counts from their own un-scoped bucket", () => {
    // Enrolment is the population axis: "420 of the 509 active" only reads
    // right if the 509 is not itself narrowed by the money filters.
    const counts = {
      ...EMPTY_SEGMENT_COUNTS,
      enrolment: { [SEGMENT_BY_ID.active.countKey]: 509 },
      counts: { [SEGMENT_BY_ID.active.countKey]: 3 },
    };
    expect(segmentCount(counts, "active")).toBe(509);
  });
});
