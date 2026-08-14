import {
  readerFromRecord,
  readerFromSearchParams,
  type SearchParamReader,
} from "@/lib/navigation/search-params";
import { parseSegments, serializeSegments } from "@/lib/segments/student-segments";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import { EMPTY_STUDENT_FILTERS, type StudentListFilters } from "@/lib/students/types";

/**
 * The single normalizer for Students list filters.
 *
 * There were two, near-identical, and they disagreed on the one thing that
 * matters: the page defaulted `status` to `"active"` while the API route
 * defaulted it to `""` (all). The server therefore rendered 509 students and the
 * client's first refetch silently widened to 537, with the header count
 * following along. Reading them side by side is the only way that was ever going
 * to be noticed, so there is now one of them.
 *
 * Takes a reader function rather than a params object so the Server Component
 * (plain object) and the Route Handler (URLSearchParams) can share it.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Re-exported so every existing `@/lib/students/filter-params` import keeps
// resolving; the definitions moved to lib/navigation so Receipts can share them
// without importing from lib/students.
export { readerFromRecord, readerFromSearchParams };
export type { SearchParamReader };

export function normalizeStudentFilters(read: SearchParamReader): StudentListFilters {
  const validStatuses = new Set<string>(
    STUDENT_STATUSES.map((statusOption) => statusOption.value),
  );

  const rawClassId = read("classId")?.trim() ?? "";
  const rawRouteId = read("transportRouteId")?.trim() ?? "";
  const rawStatus = read("status")?.trim() ?? "";
  const rawSessionLabel = (read("session") ?? read("sessionLabel"))?.trim() ?? "";

  return {
    query: read("query")?.trim() ?? EMPTY_STUDENT_FILTERS.query,
    sessionLabel: rawSessionLabel || EMPTY_STUDENT_FILTERS.sessionLabel,
    classId: UUID_PATTERN.test(rawClassId) ? rawClassId : EMPTY_STUDENT_FILTERS.classId,
    transportRouteId: UUID_PATTERN.test(rawRouteId)
      ? rawRouteId
      : EMPTY_STUDENT_FILTERS.transportRouteId,
    // "active" is the deliberate default on BOTH entry points. An office opening
    // Students wants the current roll, not every student who ever attended.
    status: validStatuses.has(rawStatus)
      ? (rawStatus as StudentListFilters["status"])
      : ("active" as StudentListFilters["status"]),
    segments: parseSegments(read("seg")),
    // "name" on both entry points, and the only other option is "class" — an
    // unknown value must not silently become an unordered query, because
    // PostgREST pagination over an unordered result can repeat or skip rows.
    sort: read("sort")?.trim() === "class" ? "class" : "name",
  };
}

/** The query-string form, omitting anything at its default. */
export function studentFiltersToParams(
  filters: StudentListFilters,
  extra?: { page?: number },
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query) params.set("query", filters.query);
  if (filters.sessionLabel) params.set("session", filters.sessionLabel);
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.transportRouteId) params.set("transportRouteId", filters.transportRouteId);
  if (filters.status) params.set("status", filters.status);
  if (filters.segments.length > 0) params.set("seg", serializeSegments(filters.segments));
  if (filters.sort && filters.sort !== "name") params.set("sort", filters.sort);
  if (extra?.page && extra.page > 1) params.set("page", String(extra.page));

  return params;
}
