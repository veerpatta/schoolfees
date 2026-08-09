import "server-only";

import { applySegmentFilters } from "@/lib/segments/apply";
import {
  EMPTY_SEGMENT_COUNTS,
  statusesForSegments,
  type SegmentCounts,
  type SegmentId,
} from "@/lib/segments/student-segments";
import { getCacheSafeClient } from "@/lib/supabase/cache-safe";

/**
 * Reads of `public.v_student_directory`, the one relation Students and
 * Transactions both filter against.
 *
 * The point of routing both modules through here is that a predicate and its
 * COUNT come from the same query. Students used to pick a page of identities and
 * only then look up money, so a dues filter could only ever narrow the page
 * while the header kept reporting the unfiltered total.
 */

export type StudentDirectoryFilters = {
  sessionLabel: string;
  classId?: string;
  transportRouteId?: string;
  query?: string;
  segments?: readonly SegmentId[];
  /** Defaults to true; Transactions exports occasionally want archived classes. */
  activeClassesOnly?: boolean;
};

type DirectoryQuery = {
  eq: (column: string, value: unknown) => DirectoryQuery;
  or: (filters: string) => DirectoryQuery;
  like: (column: string, pattern: string) => DirectoryQuery;
  order: (column: string, options: { ascending: boolean }) => DirectoryQuery;
  range: (from: number, to: number) => DirectoryQuery;
};

function applyDirectoryFilters(
  query: DirectoryQuery,
  filters: StudentDirectoryFilters,
): DirectoryQuery {
  let next = query.eq("session_label", filters.sessionLabel);

  if (filters.activeClassesOnly !== false) {
    next = next.eq("class_status", "active");
  }
  if (filters.classId) {
    next = next.eq("class_id", filters.classId);
  }
  if (filters.transportRouteId) {
    next = next.eq("transport_route_id", filters.transportRouteId);
  }

  const search = filters.query?.trim().toLowerCase();
  if (search) {
    // One predicate against the precomputed haystack. The old server query
    // matched full_name only — which is precisely why it disagreed with the
    // client-side pass and with the placeholder's own promise of "name, SR no,
    // or phone". Escape the LIKE metacharacters so a SR number containing % or _
    // cannot turn into a wildcard.
    const escaped = search.replace(/[\\%_]/g, (match) => `\\${match}`);
    next = next.like("search_text", `%${escaped}%`);
  }

  return applySegmentFilters(next, filters.segments ?? []);
}

export type StudentDirectoryRow = {
  student_id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  class_label: string;
  record_status: string;
  transport_route_id: string | null;
  status_label: string;
  outstanding_amount: number;
  old_balance_amount: number;
  overdue_base_amount: number;
  pending_late_fee_amount: number;
  conventional_discount_labels: string | null;
  seg_dues_not_prepared: boolean;
  seg_duplicate_sr: boolean;
  seg_missing_dob: boolean;
  has_fee_profile: boolean;
  seg_fee_exception: boolean;
  seg_late_fee_waived: boolean;
};

/** Ids only — enough to scope a second, richer query, and cheap to page. */
export async function getStudentDirectoryIds(
  filters: StudentDirectoryFilters,
  options?: { page?: number; pageSize?: number },
): Promise<{ studentIds: string[]; totalCount: number }> {
  const supabase = await getCacheSafeClient();
  const pageSize = Math.min(500, Math.max(1, options?.pageSize ?? 40));
  const page = Math.max(1, options?.page ?? 1);
  const from = (page - 1) * pageSize;

  const base = supabase
    .from("v_student_directory")
    .select("student_id", { count: "exact" });

  const { data, error, count } = await applyDirectoryFilters(
    base as unknown as DirectoryQuery,
    filters,
  )
    .order("full_name", { ascending: true })
    .range(from, from + pageSize - 1) as unknown as {
    data: Array<{ student_id: string }> | null;
    error: { message: string } | null;
    count: number | null;
  };

  if (error) {
    throw new Error(`Unable to load student directory: ${error.message}`);
  }

  return {
    studentIds: (data ?? []).map((row) => row.student_id),
    totalCount: count ?? 0,
  };
}

/**
 * Every chip's number in one round trip.
 *
 * Note what is NOT passed: the attribute segments. Counts are scoped by the
 * structural filters and the enrolment family only, because the money buckets
 * are mutually exclusive — scope them by each other and every unselected chip
 * reads zero, which is the classic broken-facet bug.
 */
export async function getStudentSegmentCounts(
  filters: StudentDirectoryFilters,
): Promise<SegmentCounts> {
  const supabase = await getCacheSafeClient();

  const { data, error } = await supabase.rpc("get_student_segment_counts", {
    p_session_label: filters.sessionLabel,
    p_class_id: filters.classId || null,
    p_route_id: filters.transportRouteId || null,
    p_query: filters.query?.trim() || null,
    p_statuses: statusesForSegments(filters.segments ?? []),
    p_active_classes_only: filters.activeClassesOnly !== false,
  });

  if (error || !data) {
    // Chips degrade to unlabelled rather than taking the page down with them.
    console.warn("[segment-counts] failed:", error?.message);
    return EMPTY_SEGMENT_COUNTS;
  }

  const payload = data as Partial<SegmentCounts>;
  return {
    scopeTotal: payload.scopeTotal ?? 0,
    populationTotal: payload.populationTotal ?? 0,
    enrolment: payload.enrolment ?? {},
    counts: payload.counts ?? {},
  };
}

export type StudentDirectorySummary = {
  studentCount: number;
  expectedFees: number;
  totalPaid: number;
  totalOutstanding: number;
  oldBalanceOutstanding: number;
  lateFeeOutstanding: number;
  totalDiscount: number;
  transportStudentCount: number;
};

/** Totals across the whole filtered set, not just the page on screen. */
export async function getStudentDirectorySummary(
  filters: StudentDirectoryFilters,
): Promise<StudentDirectorySummary | null> {
  const supabase = await getCacheSafeClient();

  const { data, error } = await supabase.rpc("get_student_directory_summary", {
    p_session_label: filters.sessionLabel,
    p_class_id: filters.classId || null,
    p_route_id: filters.transportRouteId || null,
    p_query: filters.query?.trim() || null,
    p_statuses: statusesForSegments(filters.segments ?? []),
    p_active_classes_only: filters.activeClassesOnly !== false,
  });

  if (error || !data) {
    console.warn("[directory-summary] failed:", error?.message);
    return null;
  }

  return data as StudentDirectorySummary;
}
