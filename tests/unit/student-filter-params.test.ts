import { describe, expect, it } from "vitest";

import {
  normalizeStudentFilters,
  readerFromRecord,
  readerFromSearchParams,
  studentFiltersToParams,
} from "@/lib/students/filter-params";

/**
 * There used to be two of these, and they disagreed on the one thing that
 * matters. `app/protected/students/page.tsx` defaulted `status` to "active"
 * while `app/protected/students/index/route.ts` defaulted it to "" — so the
 * server rendered the 509-student active roll and the client's very first
 * refetch silently widened it to all 537, header count included.
 *
 * The test that would have caught it is the one that runs both entry points
 * over the same input and compares.
 */

const VALID_UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function bothEntryPoints(input: Record<string, string>) {
  const fromPage = normalizeStudentFilters(readerFromRecord(input));
  const fromRoute = normalizeStudentFilters(
    readerFromSearchParams(new URLSearchParams(input)),
  );
  return { fromPage, fromRoute };
}

describe("normalizeStudentFilters — one normalizer, two entry points", () => {
  it("agrees on an empty query string", () => {
    const { fromPage, fromRoute } = bothEntryPoints({});
    expect(fromPage).toEqual(fromRoute);
  });

  it("defaults status to active on BOTH entry points", () => {
    const { fromPage, fromRoute } = bothEntryPoints({});
    expect(fromPage.status).toBe("active");
    expect(fromRoute.status).toBe("active");
  });

  it("agrees on a fully populated query string", () => {
    const input = {
      query: "  ARIDAMAN  ",
      session: "TEST-2026-27",
      classId: VALID_UUID,
      transportRouteId: VALID_UUID,
      status: "left",
      seg: "overdue,onTransport",
    };
    const { fromPage, fromRoute } = bothEntryPoints(input);

    expect(fromPage).toEqual(fromRoute);
    expect(fromPage).toEqual({
      query: "ARIDAMAN",
      sessionLabel: "TEST-2026-27",
      classId: VALID_UUID,
      transportRouteId: VALID_UUID,
      status: "left",
      segments: ["overdue", "onTransport"],
    });
  });

  it("takes an array-valued search param's first entry", () => {
    // Next.js hands a Server Component `?status=left&status=active` as an array.
    const filters = normalizeStudentFilters(
      readerFromRecord({ status: ["left", "active"], query: undefined }),
    );
    expect(filters.status).toBe("left");
  });

  it("rejects a non-uuid class or route rather than passing it to Postgres", () => {
    const filters = normalizeStudentFilters(
      readerFromRecord({ classId: "5-A", transportRouteId: "'; drop table students; --" }),
    );
    expect(filters.classId).toBe("");
    expect(filters.transportRouteId).toBe("");
  });

  it("falls back to active for an unknown status", () => {
    expect(normalizeStudentFilters(readerFromRecord({ status: "expelled" })).status).toBe("active");
  });

  it('accepts an explicit status="" as "show every status"', () => {
    // The "All students" saved view relies on this: an empty string is a real
    // choice, not a missing value. It is not in STUDENT_STATUSES, so it lands on
    // the active default — which is the documented behaviour, and the reason the
    // view sets no status param at all rather than an empty one.
    expect(normalizeStudentFilters(readerFromRecord({ status: "" })).status).toBe("active");
  });

  it("reads either session or sessionLabel", () => {
    expect(normalizeStudentFilters(readerFromRecord({ session: "2026-27" })).sessionLabel).toBe(
      "2026-27",
    );
    expect(
      normalizeStudentFilters(readerFromRecord({ sessionLabel: "2026-27" })).sessionLabel,
    ).toBe("2026-27");
  });

  it("drops unknown segment ids", () => {
    expect(
      normalizeStudentFilters(readerFromRecord({ seg: "overdue,dragons,leftOwing" })).segments,
    ).toEqual(["overdue", "leftOwing"]);
  });
});

describe("studentFiltersToParams", () => {
  it("round-trips through the normalizer unchanged", () => {
    const filters = normalizeStudentFilters(
      readerFromRecord({
        query: "ARI",
        session: "TEST-2026-27",
        classId: VALID_UUID,
        status: "left",
        seg: "oldBalanceDue,overdue",
      }),
    );

    const params = studentFiltersToParams(filters);
    const reparsed = normalizeStudentFilters(readerFromSearchParams(params));

    expect(reparsed).toEqual(filters);
  });

  it("omits defaults and empty values", () => {
    const filters = normalizeStudentFilters(readerFromRecord({}));
    const params = studentFiltersToParams(filters);

    expect(params.get("query")).toBeNull();
    expect(params.get("classId")).toBeNull();
    expect(params.get("seg")).toBeNull();
    expect(params.get("page")).toBeNull();
  });

  it("only writes a page param past page one", () => {
    const filters = normalizeStudentFilters(readerFromRecord({}));
    expect(studentFiltersToParams(filters, { page: 1 }).get("page")).toBeNull();
    expect(studentFiltersToParams(filters, { page: 3 }).get("page")).toBe("3");
  });
});
