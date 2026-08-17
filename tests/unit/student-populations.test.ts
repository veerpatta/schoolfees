import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeStudentFilters,
  readerFromRecord,
  studentFiltersToParams,
} from "@/lib/students/filter-params";
import { segmentsImplyEnrolment } from "@/lib/segments/student-segments";
import { EMPTY_STUDENT_FILTERS } from "@/lib/students/types";

/**
 * Left means left — findable when asked for, never counted as active.
 *
 * Two halves. The round-trip half guards the sentinel bug: the client
 * serialized "every status" as NO status param, the server normalized a
 * missing param back to "active", and the "All students" / "Left but owing"
 * views silently narrowed to the roll while the chip counts (built on another
 * path) kept saying "Left 28".
 *
 * The source half guards the vocabulary: five status predicates were in use
 * inline and unnamed. They now live in lib/students/populations.ts, and a NEW
 * inline spelling outside that module fails here — a population worth querying
 * is worth naming and documenting.
 */

describe("the status sentinel survives the round trip", () => {
  it('serializes "" (every status) as an explicit status=all', () => {
    const params = studentFiltersToParams({ ...EMPTY_STUDENT_FILTERS, status: "" });
    expect(params.get("status")).toBe("all");
  });

  it('normalizes status=all back to "" so nothing narrows the query', () => {
    const filters = normalizeStudentFilters(readerFromRecord({ status: "all" }));
    expect(filters.status).toBe("");
  });

  it('still defaults a MISSING status to "active" — the roll is the default view', () => {
    const filters = normalizeStudentFilters(readerFromRecord({}));
    expect(filters.status).toBe("active");
  });

  it("round-trips every real status unchanged", () => {
    for (const status of ["active", "left", "graduated", "inactive"] as const) {
      const params = studentFiltersToParams({ ...EMPTY_STUDENT_FILTERS, status });
      const read = normalizeStudentFilters(
        readerFromRecord(Object.fromEntries(params.entries())),
      );
      expect(read.status, `status "${status}" did not survive the round trip`).toBe(status);
    }
  });
});

describe("an enrolment chip wins over the status dropdown", () => {
  it("knows which chips state an enrolment population", () => {
    expect(segmentsImplyEnrolment(["left"])).toBe(true);
    expect(segmentsImplyEnrolment(["leftOwing"])).toBe(true);
    expect(segmentsImplyEnrolment(["graduated"])).toBe(true);
    expect(segmentsImplyEnrolment(["active"])).toBe(true);
    // Despite the name, newThisYear reads the fee tier, not enrollment.
    expect(segmentsImplyEnrolment(["newThisYear"])).toBe(false);
    expect(segmentsImplyEnrolment(["overdue", "onTransport"])).toBe(false);
    expect(segmentsImplyEnrolment([])).toBe(false);
  });

  it("the data layer defers to the chip", () => {
    // Source assertion: both student list queries must gate their status
    // narrowing on the chip check, or chip AND default-"active" is the empty
    // set again.
    const data = readFileSync(join(process.cwd(), "lib/students/data.ts"), "utf8");
    const gated = data.match(/filters\.status && !segmentsImplyEnrolment\(filters\.segments\)/g);
    expect(gated, "both list queries gate status on the enrolment chips").toHaveLength(2);
  });
});

describe("student populations are named, not re-spelled", () => {
  const repoRoot = process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no inline student-population predicate exists outside lib/students/populations.ts", () => {
    // What this CAN police: a literal `.in("status", [...])` whose list is
    // made entirely of student statuses, and a literal `.eq("status", ...)`
    // naming an unambiguous student status. What it deliberately cannot:
    // `.eq("status", "active")` — classes, sessions and refund requests all
    // carry a status column, and a context-free regex cannot tell whose row it
    // is. The named-constant form (.in("status", [...SOME_NAME])) matches
    // neither pattern, which is the point.
    const STUDENT_STATUSES = ["active", "left", "graduated", "inactive"];
    const inlineList = /\.in\(\s*["']status["']\s*,\s*\[([^\]]*)\]/g;
    const inlineEq = /\.eq\(\s*["']status["']\s*,\s*["'](left|graduated|inactive)["']\s*\)/;

    const offenders: string[] = [];
    for (const file of [...walk(join(repoRoot, "lib")), ...walk(join(repoRoot, "app"))]) {
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (rel === "lib/students/populations.ts") continue;
      const source = readFileSync(file, "utf8");

      if (inlineEq.test(source)) {
        offenders.push(`${rel} (.eq form)`);
        continue;
      }

      for (const match of source.matchAll(inlineList)) {
        const values = [...match[1].matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);
        // A list is a student population when every value is a student status.
        // Import-batch lists ("uploaded", "validated") and refund lists
        // ("pending_approval") fail that test and are none of our business.
        if (values.length > 0 && values.every((value) => STUDENT_STATUSES.includes(value))) {
          offenders.push(`${rel} (.in ${JSON.stringify(values)})`);
          break;
        }
      }
    }

    expect(
      offenders,
      `inline student-population predicates found — name them in lib/students/populations.ts instead: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
