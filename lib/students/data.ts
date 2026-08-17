import { getStudentDirectoryIds } from "@/lib/segments/directory";
import { segmentsImplyEnrolment } from "@/lib/segments/student-segments";
import "server-only";

import { cache } from "react";

import {
  getFeePolicySummary,
  getFeeSetupPageData,
  upsertStudentFeeOverride,
} from "@/lib/fees/data";
import {
  getConventionalDiscountPolicies,
  getStudentConventionalDiscountAssignments,
  saveStudentConventionalDiscountAssignments,
} from "@/lib/fees/conventional-discounts";
import { getMasterDataOptions } from "@/lib/master-data/data";
import {
  calculateOverdueBaseAmount,
  calculatePendingLateFeeAmount,
} from "@/lib/fees/due-amounts";
import { buildTransportRouteLabel, isSentinelNoTransportRoute } from "@/lib/transport/label";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { getStudentDeletePolicy } from "@/lib/students/delete-policy";
import {
  STUDENT_INFO_SELECT_COLUMNS,
  mapStudentInfoRow,
  toStudentInfoColumns,
} from "@/lib/students/info-fields";
import type {
  StudentInfoFields,
  StudentInfoRow,
} from "@/lib/students/info-fields";
import type {
  StudentClassOption,
  StudentDetail,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
  StudentSessionOption,
  StudentSiblingPill,
  StudentDeletionSafety,
  StudentEmiPlanBadge,
  StudentValidatedInput,
} from "@/lib/students/types";

type StudentJoinClass = {
  id: string;
  session_label: string;
  status: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentJoinRoute = {
  id: string;
  route_name: string;
  route_code: string | null;
};

type StudentListRow = {
  id: string;
  admission_no: string;
  full_name: string;
  date_of_birth: string | null;
  status: StudentListItem["status"];
  primary_phone: string | null;
  secondary_phone: string | null;
  updated_at: string;
  photo_path: string | null;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
  route_ref: StudentJoinRoute | StudentJoinRoute[] | null;
};

type StudentDetailRow = {
  id: string;
  admission_no: string;
  full_name: string;
  date_of_birth: string | null;
  father_name: string | null;
  mother_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  address: string | null;
  class_id: string;
  transport_route_id: string | null;
  status: StudentDetail["status"];
  notes: string | null;
  photo_path: string | null;
  email: string | null;
  joined_on: string | null;
  created_at: string;
  updated_at: string;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
  route_ref: StudentJoinRoute | StudentJoinRoute[] | null;
} & StudentInfoRow;

type StudentWorkbookFinancialRow = {
  student_id: string;
  workbook_student_key?: string | null;
  student_status_label: "New" | "Old";
  tuition_fee?: number | null;
  transport_fee?: number | null;
  academic_fee?: number | null;
  gross_base_before_discount?: number | null;
  discount_amount?: number | null;
  /** Re-sourced in 20260808140000 to sum public.student_late_fee_waivers. */
  late_fee_waiver_amount?: number | null;
  base_total_due?: number | null;
  base_charge_total?: number | null;
  installment1_base?: number | null;
  installment2_base?: number | null;
  installment3_base?: number | null;
  installment4_base?: number | null;
  total_paid?: number | null;
  total_discount_closeouts?: number | null;
  late_fee_total?: number | null;
  total_due?: number | null;
  outstanding_amount: number;
  next_due_label?: string | null;
  next_due_date?: string | null;
  next_due_amount?: number | null;
  status_label?: "" | "PAID" | "NOT STARTED" | "OVERDUE" | "PARTLY PAID";
  last_payment_date?: string | null;
  last_payment_amount?: number | null;
  duplicate_sr_flag?: boolean | null;
  missing_dob_flag?: boolean | null;
  missing_class_flag?: boolean | null;
  missing_status_flag?: boolean | null;
};

type StudentFamilyMemberRow = {
  family_group_id: string;
  student_id: string;
  academic_session_label: string;
};

type StudentFeeOverrideRow = {
  id: string;
  custom_tuition_fee_amount: number | null;
  custom_transport_fee_amount: number | null;
  custom_books_fee_amount: number | null;
  custom_admission_activity_misc_fee_amount: number | null;
  custom_other_fee_heads: Record<string, unknown> | null;
  custom_other_fee_head_labels?: Record<string, unknown> | null;
  custom_late_fee_flat_amount: number | null;
  other_adjustment_head: string | null;
  other_adjustment_amount: number | null;
  late_fee_waiver_amount: number;
  discount_amount: number;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
  reason: string;
  notes: string | null;
};

type StudentListInstallmentBalanceRow = {
  student_id: string;
  installment_no: number | null;
  installment_label: string | null;
  base_charge: number;
  paid_amount: number;
  adjustment_amount: number;
  final_late_fee: number;
  pending_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived";
};

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const segments = [value.class_name];

  if (value.section) {
    segments.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    segments.push(value.stream_name);
  }

  return segments.join(" - ");
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeSessionKey(value: string) {
  return value.trim().toLowerCase();
}

function isRecoverableWorkbookLoadError(error: { message?: string } | null | undefined) {
  if (!error?.message) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("permission denied for schema private") ||
    message.includes("permission denied")
  );
}

/** Postgres `query_canceled` — what a statement timeout surfaces as. */
const STATEMENT_TIMEOUT_CODE = "57014";

/**
 * Statement timeouts and client-side aborts both mean "this read did not finish
 * in time", never "this data is wrong", so callers may safely fall back.
 *
 * Two shapes have to match: a raw PostgREST error (has `code`), and the wrapped
 * `Error` rethrown by getStudentSiblingPills (message only). postgrest-js turns
 * an aborted fetch into `{ message: "TimeoutError: ...", code: "" }` rather than
 * a rejection, so the abort text is matched here too — without it, adding the
 * abort signal would trade a slow failure for a new one.
 */
function isTimeoutLikeLoadError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  if (error.code === STATEMENT_TIMEOUT_CODE) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();

  return (
    message.includes("canceling statement due to statement timeout") ||
    message.includes("statement timeout") ||
    message.includes(STATEMENT_TIMEOUT_CODE) ||
    message.includes("aborterror") ||
    message.includes("timeouterror") ||
    message.includes("operation was aborted") ||
    message.includes("the user aborted a request")
  );
}

/**
 * Sibling pills come from confirmed family membership only.
 *
 * This used to also scan `mv_student_sibling_groups` — a phone-match heuristic —
 * with an array-overlap filter, which was the slowest read on the student list
 * and needed a client-side abort to stay inside the statement timeout. That
 * detection is gone: a family exists when staff link it, never because two
 * students share a phone number. Both reads below are plain indexed lookups.
 */
async function getStudentSiblingPills(studentIds: readonly string[]) {
  const map = new Map<string, StudentSiblingPill>();

  if (studentIds.length === 0) {
    return map;
  }

  const supabase = await createClient();

  // Membership is resolved across ALL sessions so manually-linked siblings
  // persist into future sessions (the link is per-student, not per-session).
  const { data: matchingMembersRaw, error: matchingMembersError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id, academic_session_label")
    .in("student_id", studentIds);

  if (matchingMembersError) {
    if (isTimeoutLikeLoadError(matchingMembersError)) {
      console.warn(
        "Sibling group fields could not be loaded; falling back to base student data.",
        matchingMembersError.message,
      );
      return map;
    }

    throw new Error(`Unable to load confirmed sibling fields: ${matchingMembersError.message}`);
  }

  const matchingMembers = (matchingMembersRaw ?? []) as StudentFamilyMemberRow[];
  const familyGroupIds = [...new Set(matchingMembers.map((row) => row.family_group_id))];

  if (familyGroupIds.length === 0) {
    return map;
  }

  // A second pass, because the first only returns the rows for the students on
  // this page — the sibling COUNT needs every member of each of their families.
  const { data: familyMembersRaw, error: familyMembersError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id, academic_session_label")
    .in("family_group_id", familyGroupIds);

  if (familyMembersError) {
    if (isTimeoutLikeLoadError(familyMembersError)) {
      return map;
    }

    throw new Error(`Unable to load confirmed family members: ${familyMembersError.message}`);
  }

  const membersByFamily = new Map<string, StudentFamilyMemberRow[]>();
  ((familyMembersRaw ?? []) as StudentFamilyMemberRow[]).forEach((row) => {
    membersByFamily.set(row.family_group_id, [...(membersByFamily.get(row.family_group_id) ?? []), row]);
  });

  const pageStudentIds = new Set(studentIds);

  membersByFamily.forEach((members) => {
    const distinctStudentCount = new Set(members.map((row) => row.student_id)).size;
    if (distinctStudentCount < 2) {
      return;
    }

    members.forEach((member) => {
      if (!pageStudentIds.has(member.student_id)) {
        return;
      }

      map.set(member.student_id, {
        siblingCount: new Set(
          members.filter((row) => row.student_id !== member.student_id).map((row) => row.student_id),
        ).size,
        href: `/protected/students/${member.student_id}`,
      });
    });
  });

  return map;
}

export function getClassOptionsForSession(
  classOptions: readonly StudentClassOption[],
  sessionLabel: string | null | undefined,
) {
  const normalizedSessionLabel = normalizeSessionKey(sessionLabel ?? "");

  if (!normalizedSessionLabel) {
    return [...classOptions];
  }

  return classOptions.filter(
    (row) => normalizeSessionKey(row.sessionLabel) === normalizedSessionLabel,
  );
}

function buildStudentSessionOptions(
  classOptions: readonly StudentClassOption[],
  currentSessionLabel: string | null,
) {
  const uniqueSessionLabels = new Set(
    classOptions.map((row) => row.sessionLabel).filter((value) => value.trim().length > 0),
  );

  if (currentSessionLabel) {
    uniqueSessionLabels.add(currentSessionLabel);
  }

  const sortedSessionLabels = [...uniqueSessionLabels].sort((left, right) =>
    right.localeCompare(left),
  );

  return sortedSessionLabels.map(
    (label) =>
      ({
        value: label,
        label,
      }) satisfies StudentSessionOption,
  );
}

function parseCustomAmountMap(value: Record<string, unknown> | null) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, rawValue]) => {
    if (!key.trim() || typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue <= 0) {
      return acc;
    }

    acc[key] = Math.trunc(rawValue);
    return acc;
  }, {});
}

function getStudentStatusLabel(
  override: StudentFeeOverrideRow | null,
  financial: StudentWorkbookFinancialRow | null,
) {
  if (financial?.student_status_label) {
    return financial.student_status_label;
  }

  return override?.student_type_override === "new" ? "New" : "Old";
}

async function getStudentFeeOverrideRow(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_fee_overrides")
    .select(
      "id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes",
    )
    .eq("student_id", studentId)
    .eq("is_active", true)
    .maybeSingle();

  if (error && !isRecoverableWorkbookLoadError(error)) {
    throw new Error(`Unable to load student fee profile: ${error.message}`);
  }

  return (data ?? null) as StudentFeeOverrideRow | null;
}

async function saveStudentFeeProfile(
  studentId: string,
  payload: StudentValidatedInput,
  existingOverride: StudentFeeOverrideRow | null,
) {
  const hasNewOverrideFields =
    payload.studentTypeOverride !== null ||
    payload.tuitionOverride !== null ||
    payload.transportOverride !== null ||
    payload.discountAmount > 0 ||
    payload.otherAdjustmentHead !== null ||
    payload.otherAdjustmentAmount !== null;

  if (!existingOverride && !hasNewOverrideFields) {
    return;
  }

  const policy = await getFeePolicySummary();

  await upsertStudentFeeOverride({
    studentId,
    customTuitionFeeAmount: payload.tuitionOverride,
    customTransportFeeAmount: payload.transportOverride,
    customBooksFeeAmount: existingOverride?.custom_books_fee_amount ?? null,
    customAdmissionActivityMiscFeeAmount:
      existingOverride?.custom_admission_activity_misc_fee_amount ?? null,
    customFeeHeadAmounts: parseCustomAmountMap(existingOverride?.custom_other_fee_heads ?? null),
    customFeeHeads: policy.customFeeHeads,
    // Per-student named heads are ad-hoc and absent from the school-wide
    // catalog. Without this pass-through the Edit Student form would silently
    // delete them (and their labels) on every unrelated save.
    customOtherFeeHeadLabels: existingOverride?.custom_other_fee_head_labels ?? null,
    allowUncatalogedHeads: true,
    customLateFeeFlatAmount: existingOverride?.custom_late_fee_flat_amount ?? null,
    otherAdjustmentHead: payload.otherAdjustmentHead,
    otherAdjustmentAmount: payload.otherAdjustmentAmount,
    // Preserved, never set from this form. Late-fee waivers live in
    // public.student_late_fee_waivers; a form field here was a lost update
    // waiting to happen, silently reverting any waiver granted while the page
    // was open.
    lateFeeWaiverAmount: existingOverride?.late_fee_waiver_amount ?? 0,
    discountAmount: payload.discountAmount,
    studentTypeOverride: payload.studentTypeOverride,
    transportAppliesOverride: existingOverride?.transport_applies_override ?? null,
    reason: payload.feeProfileReason,
    notes: payload.feeProfileNotes,
    useAdminClient: true,
  });
}

async function saveStudentConventionalDiscountProfile(
  studentId: string,
  payload: StudentValidatedInput,
) {
  const setup = await getFeeSetupPageData();
  const classDefault =
    setup.classDefaults.find((item) => item.classId === payload.classId) ?? null;
  const academicSessionLabel =
    classDefault?.sessionLabel ?? setup.globalPolicy.academicSessionLabel;
  const baseTuition =
    payload.tuitionOverride ?? classDefault?.tuitionFee ?? setup.schoolDefault.tuitionFee;

  await saveStudentConventionalDiscountAssignments({
    studentId,
    academicSessionLabel,
    policyIds: payload.conventionalPolicyIds,
    reason: payload.conventionalDiscountReason,
    notes: payload.conventionalDiscountNotes,
    baseTuition,
    familyGroupLabel: payload.conventionalDiscountFamilyGroup,
    guardianName: payload.fatherName,
    guardianPhone: payload.fatherPhone,
    manualOverrideReason: payload.conventionalDiscountManualOverrideReason,
  });
}

async function generatePendingAdmissionNo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("admission_no")
    .ilike("admission_no", "PENDING-SR-%");

  if (error) {
    throw new Error(`Unable to prepare temporary SR no: ${error.message}`);
  }

  const usedNumbers = new Set(
    ((data ?? []) as Array<{ admission_no: string }>).flatMap((row) => {
      const match = row.admission_no.match(/^PENDING-SR-(\d+)$/i);
      return match ? [Number(match[1])] : [];
    }),
  );

  for (let next = 1; next < 100000; next += 1) {
    if (!usedNumbers.has(next)) {
      return `PENDING-SR-${next.toString().padStart(4, "0")}`;
    }
  }

  throw new Error("Unable to generate a temporary SR no. Please enter SR no manually.");
}

export async function getStudentFormOptions(payload?: {
  sessionLabel?: string | null;
}) {
  const [options, policy] = await Promise.all([
    getMasterDataOptions(),
    getFeePolicySummary(),
  ]);
  const policySessionLabel = policy.academicSessionLabel || "";
  const currentSessionLabel = options.currentSessionLabel || "";
  const academicSessionsCurrentLabel = currentSessionLabel || policySessionLabel || null;

  const allClassOptions: StudentClassOption[] = options.classOptions.map((row) => ({
    id: row.id,
    label: row.label,
    sessionLabel: row.sessionLabel,
  }));
  const requestedSessionLabel = payload?.sessionLabel?.trim() ?? "";
  const resolvedSessionLabel = requestedSessionLabel || policySessionLabel || currentSessionLabel || "";
  const classOptions = getClassOptionsForSession(
    allClassOptions,
    resolvedSessionLabel || null,
  );
  const sessionOptions = buildStudentSessionOptions(
    allClassOptions,
    policySessionLabel || academicSessionsCurrentLabel,
  );
  const sessionMismatch =
    Boolean(policySessionLabel && academicSessionsCurrentLabel) &&
    normalizeSessionKey(policySessionLabel) !== normalizeSessionKey(academicSessionsCurrentLabel ?? "");

  const routeOptions: StudentRouteOption[] = options.routeOptions
    .filter((row) => row.isActive)
    // A transport_routes row literally named "No Transport" is a placeholder,
    // not a route (seeded with annual_fee_amount = 0). Offering it alongside the
    // blank "No transport" option gave staff two identical-looking choices, and
    // picking the row made the student read "No Transport" on every screen even
    // when a custom transport amount was charging them. Master Data still lists
    // it so it can be managed; only the student picker hides it.
    //
    // Students already on it are unaffected: the row charges 0, so a null route
    // is financially identical, and their form simply shows the blank option.
    .filter((row) => !isSentinelNoTransportRoute(row.label))
    .map((row) => ({
      id: row.id,
      label: row.label,
      routeCode: row.routeCode,
      isActive: row.isActive,
    }));
  const conventionalDiscountPolicies = await getConventionalDiscountPolicies(
    resolvedSessionLabel,
  ).catch(() => []);

  return {
    currentSessionLabel: options.currentSessionLabel,
    policySessionLabel,
    academicSessionsCurrentLabel,
    sessionMismatch,
    resolvedSessionLabel,
    sessionOptions,
    allClassOptions,
    classOptions,
    routeOptions,
    conventionalDiscountPolicies,
  };
}

/**
 * Applies the roll's sort order to a `students` select.
 *
 * Shared by the identity and financial passes so the two cannot disagree: the
 * client paints identities first and the financial rows overwrite them, so a
 * different order in either pass shows the list visibly reshuffling itself.
 *
 * `full_name` is always the last key. Sorting by class alone leaves students
 * inside a class in whatever order Postgres returns them, which changes between
 * pages and makes `.range()` repeat or skip rows.
 */
function applyStudentSort<Query extends {
  order(
    column: string,
    options?: { ascending?: boolean; referencedTable?: string },
  ): Query;
}>(query: Query, sort: StudentListFilters["sort"]): Query {
  if (sort === "class") {
    return query
      .order("sort_order", { ascending: true, referencedTable: "class_ref" })
      .order("full_name", { ascending: true });
  }
  return query.order("full_name", { ascending: true });
}

async function getStudentsPageUncached(
  filters: StudentListFilters,
  pagination: {
    page: number;
    pageSize: number;
  },
) {
  const supabase = await createClient();
  const listSessionLabel = filters.sessionLabel;
  const page = Math.max(1, Math.floor(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination.pageSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = applyStudentSort(
    supabase
      .from("students")
      .select(
        "id, admission_no, full_name, date_of_birth, status, primary_phone, secondary_phone, updated_at, photo_path, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
        { count: "exact" },
      )
      .eq("class_ref.status", "active"),
    filters.sort,
  ).range(from, to);

  if (filters.sessionLabel) {
    query = query.eq("class_ref.session_label", filters.sessionLabel);
  }

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.transportRouteId) {
    query = query.eq("transport_route_id", filters.transportRouteId);
  }

  // An enrolment chip (Left, Graduated, Left-but-owing…) IS a status filter,
  // and the more specific one. ANDing it with the dropdown's default "active"
  // produced the empty set — the chip count said "Left 28" (counts are built
  // from the chip alone) while the list showed nothing.
  if (filters.status && !segmentsImplyEnrolment(filters.segments)) {
    query = query.eq("status", filters.status);
  }

  // Search and segments resolve through the directory, exactly as they do in
  // getStudentsIdentityPage. This pass used to skip both: it kept the old
  // ilike("full_name") and applied no segment scope at all. Since the client
  // runs identity-then-financial and the financial result overwrites the list
  // AND the header count, every segment filter appeared to work for about 60ms
  // and then snapped back to the full roll -- which is exactly what it looked
  // like from the office: pick "Never paid", still see 509.
  const directoryIds = await resolveDirectoryStudentIds(filters);
  if (directoryIds !== null) query = query.in("id", directoryIds);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Unable to load students: ${error.message}`);
  }

  const studentRows = (data ?? []) as StudentListRow[];

  let financialMap = new Map<string, StudentWorkbookFinancialRow>();
  let overrideMap = new Map<string, StudentFeeOverrideRow>();
  let overdueAmountMap = new Map<string, number>();
  let pendingLateFeeMap = new Map<string, number>();
  let conventionalDiscountMap = new Map<string, string[]>();
  let siblingPillMap = new Map<string, StudentSiblingPill>();
  let manualWaiverStudentIds = new Set<string>();
  let emiPlanByStudent = new Map<string, StudentEmiPlanBadge>();

  if (studentRows.length > 0) {
    const studentIds = studentRows.map((row) => row.id);
    const [
      { data: financialsRaw, error: financialsError },
      { data: overridesRaw, error: overridesError },
      { data: installmentBalancesRaw, error: installmentBalancesError },
      conventionalAssignments,
      loadedSiblingPills,
      { data: manualWaiversRaw },
      { data: emiPlansRaw },
    ] = await Promise.all([
      supabase
        .from("v_workbook_student_financials")
        .select(
          "student_id, workbook_student_key, student_status_label, tuition_fee, transport_fee, academic_fee, gross_base_before_discount, discount_amount, late_fee_waiver_amount, base_total_due, base_charge_total, installment1_base, installment2_base, installment3_base, installment4_base, total_paid, total_discount_closeouts, late_fee_total, total_due, outstanding_amount, next_due_label, next_due_date, next_due_amount, status_label, last_payment_date, last_payment_amount, duplicate_sr_flag, missing_dob_flag, missing_class_flag, missing_status_flag",
        )
        .in("student_id", studentIds),
      supabase
        .from("student_fee_overrides")
        .select(
          "id, student_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes",
        )
        .eq("is_active", true)
        .in("student_id", studentIds),
      supabase
        .from("v_workbook_installment_balances")
        .select(
          "student_id, installment_no, installment_label, base_charge, paid_amount, adjustment_amount, final_late_fee, pending_amount, balance_status",
        )
        .in("student_id", studentIds)
        .gt("pending_amount", 0)
        .order("installment_no", { ascending: true }),
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: listSessionLabel,
        studentIds,
      }).catch(() => []),
      getStudentSiblingPills(studentIds).catch((error) => {
        if (isTimeoutLikeLoadError(error)) {
          return new Map<string, StudentSiblingPill>();
        }

        throw error;
      }),
      // "Late fee waived" on a row has to mean a person forgave it. The old
      // read was student_fee_overrides.late_fee_waiver_amount -- the pool column
      // 20260808140000 retired -- and the obvious replacement, the effective
      // waiver total, is true for the 433 students who carry an automatic
      // grandfather row. That badge would tell the office 433 families had been
      // forgiven when nobody forgave anything.
      supabase
        .from("v_student_manual_late_fee_waivers")
        .select("student_id")
        .eq("session_label", listSessionLabel)
        .in("student_id", studentIds),
      // Active EMI plans, so a row can say why a months-old due date is not
      // being chased.
      supabase
        .from("v_student_repayment_plan_status")
        .select(
          "student_id, payment_status, monthly_amount, remaining_balance, catch_up_amount, next_due_date, missed_installment_count, plan_review_needed",
        )
        .eq("lifecycle", "active")
        .in("student_id", studentIds),
    ]);

    manualWaiverStudentIds = new Set(
      ((manualWaiversRaw ?? []) as Array<{ student_id: string }>).map((row) => row.student_id),
    );

    emiPlanByStudent = new Map(
      ((emiPlansRaw ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.student_id),
        {
          paymentStatus: (row.payment_status ?? "on_track") as StudentEmiPlanBadge["paymentStatus"],
          monthlyAmount: Number(row.monthly_amount ?? 0),
          remainingBalance: Number(row.remaining_balance ?? 0),
          catchUpAmount: Number(row.catch_up_amount ?? 0),
          nextDueDate: (row.next_due_date as string | null) ?? null,
          missedInstallmentCount: Number(row.missed_installment_count ?? 0),
          planReviewNeeded: row.plan_review_needed === true,
        } satisfies StudentEmiPlanBadge,
      ]),
    );

    if (financialsError) {
      if (isRecoverableWorkbookLoadError(financialsError)) {
        console.warn(
          "Student list workbook financial fields could not be loaded; falling back to base student data.",
          financialsError.message,
        );
      } else {
        throw new Error(
          `Unable to load workbook student list fields: ${financialsError.message}`,
        );
      }
    }

    if (overridesError) {
      if (isRecoverableWorkbookLoadError(overridesError)) {
        console.warn(
          "Student fee profile fields could not be loaded; falling back to base student data.",
          overridesError.message,
        );
      } else {
        throw new Error(`Unable to load student fee profile fields: ${overridesError.message}`);
      }
    }

    if (installmentBalancesError) {
      if (isRecoverableWorkbookLoadError(installmentBalancesError)) {
        console.warn(
          "Student list installment balances could not be loaded; falling back to annual pending only.",
          installmentBalancesError.message,
        );
      } else {
        throw new Error(
          `Unable to load student installment balance fields: ${installmentBalancesError.message}`,
        );
      }
    }

    financialMap = new Map(
      ((financialsRaw ?? []) as StudentWorkbookFinancialRow[]).map((row) => [row.student_id, row]),
    );
    const installmentRowsByStudent = new Map<string, StudentListInstallmentBalanceRow[]>();
    ((installmentBalancesRaw ?? []) as StudentListInstallmentBalanceRow[]).forEach((row) => {
      installmentRowsByStudent.set(row.student_id, [
        ...(installmentRowsByStudent.get(row.student_id) ?? []),
        row,
      ]);
    });
    overdueAmountMap = new Map(
      [...installmentRowsByStudent.entries()].map(([studentId, rows]) => [
        studentId,
        calculateOverdueBaseAmount(
          rows.map((row) => ({
            baseCharge: row.base_charge,
            paidAmount: row.paid_amount,
            adjustmentAmount: row.adjustment_amount,
            finalLateFee: row.final_late_fee,
            pendingAmount: row.pending_amount,
            balanceStatus: row.balance_status,
          })),
        ),
      ]),
    );
    pendingLateFeeMap = new Map(
      [...installmentRowsByStudent.entries()].map(([studentId, rows]) => [
        studentId,
        calculatePendingLateFeeAmount(
          rows.map((row) => ({
            finalLateFee: row.final_late_fee,
            pendingAmount: row.pending_amount,
          })),
        ),
      ]),
    );
    overrideMap = new Map(
      ((overridesRaw ?? []) as Array<StudentFeeOverrideRow & { student_id: string }>).map((row) => [
        row.student_id,
        row,
      ]),
    );
    conventionalDiscountMap = new Map();
    conventionalAssignments.forEach((assignment) => {
      const labels = conventionalDiscountMap.get(assignment.studentId) ?? [];
      labels.push(assignment.policy.displayName);
      conventionalDiscountMap.set(assignment.studentId, labels);
    });
    siblingPillMap = loadedSiblingPills;
  }

  const students = studentRows.map((row) => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);
    const financial = financialMap.get(row.id) ?? null;
    const override = overrideMap.get(row.id) ?? null;
    const classSessionLabel = classRef?.session_label ?? "";
    const expectedSessionLabel = listSessionLabel || classSessionLabel;
    const duesStatus =
      financial
        ? "generated"
        : classSessionLabel &&
            expectedSessionLabel &&
            normalizeSessionKey(classSessionLabel) !== normalizeSessionKey(expectedSessionLabel)
          ? "session_mismatch"
          : "missing_dues";
    const duesStatusLabel =
      duesStatus === "generated"
        ? "Generated"
        : duesStatus === "session_mismatch"
          ? "Session mismatch"
          : "Dues not prepared";
    const hasFeeException =
      override !== null &&
      (override.custom_tuition_fee_amount !== null ||
        override.custom_transport_fee_amount !== null ||
        override.discount_amount > 0 ||
        override.late_fee_waiver_amount > 0 ||
        override.other_adjustment_amount !== null ||
        Boolean(override.other_adjustment_head?.trim()));

    return {
      id: row.id,
      workbookStudentKey:
        financial?.workbook_student_key ??
        `${classRef ? buildClassLabel(classRef) : "Unknown class"}|${row.admission_no}`,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      dateOfBirth: row.date_of_birth,
      status: row.status,
      studentStatusLabel: financial?.student_status_label ?? "Old",
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      transportRouteLabel: buildTransportRouteLabel({
        route: routeRef,
        customTransportFeeAmount: override?.custom_transport_fee_amount ?? null,
        transportFeeAmount: financial?.transport_fee ?? null,
      }),
      hasFeeProfile: Boolean(override),
      feeProfileStatusLabel: hasFeeException
        ? "Special case"
        : override
          ? "Standard profile"
          : "Missing profile",
      tuitionFee: financial?.tuition_fee ?? 0,
      transportFee: financial?.transport_fee ?? 0,
      academicFee: financial?.academic_fee ?? 0,
      grossBaseBeforeDiscount: financial?.gross_base_before_discount ?? 0,
      discountAmount: financial?.discount_amount ?? 0,
      baseTotalDue: financial?.base_total_due ?? financial?.base_charge_total ?? 0,
      installment1Base: financial?.installment1_base ?? 0,
      installment2Base: financial?.installment2_base ?? 0,
      installment3Base: financial?.installment3_base ?? 0,
      installment4Base: financial?.installment4_base ?? 0,
      totalPaid: financial?.total_paid ?? 0,
      discountClosedAmount: financial?.total_discount_closeouts ?? 0,
      lateFeeTotal: financial?.late_fee_total ?? 0,
      totalDue: financial?.total_due ?? 0,
      overdueAmount: overdueAmountMap.get(row.id) ?? 0,
      // Straight off the matview. Both engines now charge an overdue installment
      // its flat late fee, so final_late_fee is the whole figure — adding a
      // "candidate" amount on top would double-count a waived charge.
      pendingLateFeeAmount: pendingLateFeeMap.get(row.id) ?? 0,
      hasLateFeeWaiver: manualWaiverStudentIds.has(row.id),
      emiPlan: emiPlanByStudent.get(row.id) ?? null,
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
      nextDueLabel: financial?.next_due_label ?? null,
      nextDueDate: financial?.next_due_date ?? null,
      nextDueAmount: financial?.next_due_amount ?? null,
      statusLabel: financial?.status_label ?? "",
      duesStatus,
      duesStatusLabel,
      lastPaymentDate: financial?.last_payment_date ?? null,
      lastPaymentAmount: financial?.last_payment_amount ?? 0,
      duplicateSrFlag: Boolean(financial?.duplicate_sr_flag),
      missingDobFlag: Boolean(financial?.missing_dob_flag),
      missingClassFlag: Boolean(financial?.missing_class_flag),
      missingStatusFlag: Boolean(financial?.missing_status_flag),
      outstandingAmount: financial?.outstanding_amount ?? 0,
      conventionalDiscountLabels: conventionalDiscountMap.get(row.id) ?? [],
      siblingPill: siblingPillMap.get(row.id) ?? null,
      updatedAt: row.updated_at,
      photoPath: row.photo_path,
    } satisfies StudentListItem;
  });

  return {
    students,
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Resolve the student ids matching the segment chips and the wide search.
 *
 * Both live on `v_student_directory`, not on `students`, so they cannot be
 * expressed as predicates on the base query. Resolving them to an id set and
 * intersecting with `.in("id", …)` keeps `count: "exact"` honest — the count and
 * the page then describe the same set, which is the whole reason these filters
 * were impossible before.
 *
 * Returning `null` means "no directory-side filter applied"; an empty array
 * means "matched nothing" and must still narrow the query to nothing.
 */
async function resolveDirectoryStudentIds(
  filters: StudentListFilters,
): Promise<string[] | null> {
  const hasSegments = filters.segments.length > 0;
  const hasQuery = Boolean(filters.query.trim());
  if (!hasSegments && !hasQuery) return null;

  const { studentIds } = await getStudentDirectoryIds(
    {
      sessionLabel: filters.sessionLabel,
      classId: filters.classId || undefined,
      transportRouteId: filters.transportRouteId || undefined,
      query: filters.query || undefined,
      segments: filters.segments,
    },
    // One page wide enough for the whole roll: this is an id projection over a
    // few hundred rows, and paging it would defeat the point of an exact count.
    // A scope, not a page: the caller pages the students query itself.
    { page: 1, pageSize: 5000 },
  );

  return studentIds;
}

export async function getStudentsIdentityPage(
  filters: StudentListFilters,
  pagination: { page: number; pageSize: number },
) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination.pageSize)));
  const from = (page - 1) * pageSize;
  let query = applyStudentSort(
    supabase
      .from("students")
      .select(
        "id, admission_no, full_name, date_of_birth, status, primary_phone, secondary_phone, updated_at, photo_path, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
        { count: "exact" },
      )
      .eq("class_ref.status", "active"),
    filters.sort,
  ).range(from, from + pageSize - 1);

  if (filters.sessionLabel) query = query.eq("class_ref.session_label", filters.sessionLabel);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.transportRouteId) query = query.eq("transport_route_id", filters.transportRouteId);
  // Same enrolment-chip precedence as getStudentsPage above.
  if (filters.status && !segmentsImplyEnrolment(filters.segments)) {
    query = query.eq("status", filters.status);
  }

  // Search and segments both resolve through the directory. The old
  // ilike("full_name") was narrower than the placeholder promised and narrower
  // than the client-side pass, so an SR number matched optimistically and then
  // vanished when the server answered.
  const directoryIds = await resolveDirectoryStudentIds(filters);
  if (directoryIds !== null) query = query.in("id", directoryIds);

  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load student identities: ${error.message}`);

  const students = ((data ?? []) as StudentListRow[]).map((row) => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);
    return {
      id: row.id,
      workbookStudentKey: `${classRef ? buildClassLabel(classRef) : "Unknown class"}|${row.admission_no}`,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      dateOfBirth: row.date_of_birth,
      status: row.status,
      studentStatusLabel: "Old",
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      // Degraded fallback path: no financial projection is loaded here, so a
      // custom transport amount cannot be detected. The sentinel-route handling
      // still applies.
      transportRouteLabel: buildTransportRouteLabel({ route: routeRef }),
      tuitionFee: 0,
      transportFee: 0,
      academicFee: 0,
      grossBaseBeforeDiscount: 0,
      discountAmount: 0,
      baseTotalDue: 0,
      installment1Base: 0,
      installment2Base: 0,
      installment3Base: 0,
      installment4Base: 0,
      totalPaid: 0,
      discountClosedAmount: 0,
      lateFeeTotal: 0,
      totalDue: 0,
      overdueAmount: 0,
      pendingLateFeeAmount: 0,
      hasLateFeeWaiver: false,
      hasFeeProfile: false,
      feeProfileStatusLabel: "Loading fee position",
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
      nextDueLabel: null,
      nextDueDate: null,
      nextDueAmount: null,
      statusLabel: "",
      duesStatus: "missing_dues",
      duesStatusLabel: "Loading fee position",
      lastPaymentDate: null,
      lastPaymentAmount: 0,
      duplicateSrFlag: false,
      missingDobFlag: false,
      missingClassFlag: false,
      missingStatusFlag: false,
      outstandingAmount: 0,
      conventionalDiscountLabels: [],
      siblingPill: null,
      updatedAt: row.updated_at,
      photoPath: row.photo_path,
      financialLoading: true,
    } satisfies StudentListItem;
  });

  return { students, totalCount: count ?? 0, page, pageSize };
}

export async function getStudentsPage(
  filters: StudentListFilters,
  pagination: {
    page: number;
    pageSize: number;
  },
) {
  return getStudentsPageUncached(filters, pagination);
}

export async function getStudents(filters: StudentListFilters) {
  const result = await getStudentsPage(filters, { page: 1, pageSize: 100 });
  return result.students;
}

/**
 * Fetch EVERY student matching the filters across all pages — for exports,
 * where a page cap would silently drop rows. getStudents() stays page-bounded
 * for interactive surfaces (search/command palette); this walks all pages.
 */
export async function getAllStudents(filters: StudentListFilters) {
  const pageSize = 100;
  const first = await getStudentsPage(filters, { page: 1, pageSize });
  const all = [...first.students];
  const totalPages = Math.max(1, Math.ceil((first.totalCount ?? all.length) / pageSize));

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await getStudentsPage(filters, { page, pageSize });
    if (next.students.length === 0) break;
    all.push(...next.students);
  }

  return all;
}

export type StudentMasterFields = StudentInfoFields & {
  fatherName: string | null;
  motherName: string | null;
  email: string | null;
  address: string | null;
  joinedOn: string | null;
};

/**
 * The record columns the student list does not carry, keyed by student id.
 *
 * A separate round trip on purpose. The obvious alternative — adding these to
 * the student list select — would put 30 extra columns on the hottest read in
 * the app, `/protected/students`, to serve an export the office runs a few
 * times a term. This way the list query is untouched and only the export pays.
 */
export async function getStudentMasterFieldsByIds(
  studentIds: readonly string[],
): Promise<Map<string, StudentMasterFields>> {
  const byId = new Map<string, StudentMasterFields>();

  if (studentIds.length === 0) {
    return byId;
  }

  const supabase = await getCacheSafeClient();
  // Chunked so a whole-school export does not build one enormous `in` list.
  const chunkSize = 500;

  for (let start = 0; start < studentIds.length; start += chunkSize) {
    const chunk = studentIds.slice(start, start + chunkSize);
    const { data, error } = await supabase
      .from("students")
      .select(
        `id, father_name, mother_name, email, address, joined_on, ${STUDENT_INFO_SELECT_COLUMNS}`,
      )
      .in("id", chunk);

    if (error) {
      throw new Error(`Unable to load student records: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as (StudentInfoRow & {
      id: string;
      father_name: string | null;
      mother_name: string | null;
      email: string | null;
      address: string | null;
      joined_on: string | null;
    })[];

    for (const row of rows) {
      byId.set(row.id, {
        ...mapStudentInfoRow(row),
        fatherName: row.father_name,
        motherName: row.mother_name,
        email: row.email,
        address: row.address,
        joinedOn: row.joined_on,
      });
    }
  }

  return byId;
}

async function getStudentDetailUncached(studentId: string): Promise<StudentDetail | null> {
  const supabase = await getCacheSafeClient();
  const policy = await getFeePolicySummary();
  const [studentResult, overrideRow, financialResult, conventionalAssignments] = await Promise.all([
    supabase
      .from("students")
      .select(
        `id, admission_no, full_name, date_of_birth, father_name, mother_name, primary_phone, secondary_phone, address, class_id, transport_route_id, status, notes, photo_path, email, joined_on, created_at, updated_at, ${STUDENT_INFO_SELECT_COLUMNS}, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)`,
      )
      .eq("id", studentId)
      .maybeSingle(),
    getStudentFeeOverrideRow(studentId),
    supabase
      .from("v_workbook_student_financials")
      .select("student_id, student_status_label, tuition_fee, outstanding_amount, late_fee_waiver_amount")
      .eq("student_id", studentId)
      .maybeSingle(),
    getStudentConventionalDiscountAssignments({
      academicSessionLabel: policy.academicSessionLabel,
      studentIds: [studentId],
    }).catch(() => []),
  ]);

  if (studentResult.error) {
    throw new Error(`Unable to load student: ${studentResult.error.message}`);
  }

  if (financialResult.error && !isRecoverableWorkbookLoadError(financialResult.error)) {
    throw new Error(`Unable to load workbook student details: ${financialResult.error.message}`);
  }

  if (!studentResult.data) {
    return null;
  }

  // Through `unknown`: the select list is built from STUDENT_INFO_SELECT_COLUMNS,
  // so postgrest-js cannot parse it at the type level and infers a ParserError.
  // StudentDetailRow was always the hand-maintained shape of this row — nothing
  // is lost here that the plain cast was checking before.
  const row = studentResult.data as unknown as StudentDetailRow;
  const classRef = toSingleRecord(row.class_ref);
  const routeRef = toSingleRecord(row.route_ref);
  const financial = (financialResult.data ?? null) as StudentWorkbookFinancialRow | null;
  const firstConventionalAssignment = conventionalAssignments[0] ?? null;
  const tuitionBeforeConventionalDiscount =
    firstConventionalAssignment?.beforeTuitionAmount ??
    overrideRow?.custom_tuition_fee_amount ??
    financial?.tuition_fee ??
    0;
  const tuitionAfterConventionalDiscount =
    conventionalAssignments.length > 0
      ? Math.min(...conventionalAssignments.map((item) => item.resultingTuitionAmount))
      : tuitionBeforeConventionalDiscount;

  return {
    ...mapStudentInfoRow(row),
    id: row.id,
    admissionNo: row.admission_no,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    joinedOn: row.joined_on,
    email: row.email,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.primary_phone,
    motherPhone: row.secondary_phone,
    address: row.address,
    classId: row.class_id,
    classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    classSessionLabel: classRef?.session_label ?? "",
    transportRouteId: row.transport_route_id,
    transportRouteLabel: buildTransportRouteLabel({
      route: routeRef,
      customTransportFeeAmount: overrideRow?.custom_transport_fee_amount ?? null,
      transportFeeAmount: financial?.transport_fee ?? null,
    }),
    status: row.status,
    studentTypeOverride: overrideRow?.student_type_override ?? "existing",
    studentStatusLabel: getStudentStatusLabel(overrideRow, financial),
    tuitionOverride: overrideRow?.custom_tuition_fee_amount ?? null,
    transportOverride: overrideRow?.custom_transport_fee_amount ?? null,
    discountAmount: overrideRow?.discount_amount ?? 0,
    // From the workbook view, which now sums public.student_late_fee_waivers.
    // The student_fee_overrides column it used to read is retired.
    lateFeeWaiverAmount: financial?.late_fee_waiver_amount ?? 0,
    otherAdjustmentHead: overrideRow?.other_adjustment_head ?? null,
    otherAdjustmentAmount: overrideRow?.other_adjustment_amount ?? null,
    overrideReason: overrideRow?.reason ?? null,
    overrideNotes: overrideRow?.notes ?? null,
    conventionalDiscountPolicyIds: conventionalAssignments.map((item) => item.policyId),
    conventionalDiscountLabels: conventionalAssignments.map((item) => item.policy.displayName),
    conventionalDiscountReason: firstConventionalAssignment?.reason ?? null,
    conventionalDiscountNotes: firstConventionalAssignment?.notes ?? null,
    conventionalDiscountFamilyGroupLabel: firstConventionalAssignment?.familyGroupLabel ?? null,
    conventionalDiscountManualOverrideReason:
      firstConventionalAssignment?.manualOverrideReason ?? null,
    tuitionBeforeConventionalDiscount,
    tuitionAfterConventionalDiscount,
    notes: row.notes,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies StudentDetail;
}

// Request-scoped memoization: payment posting resolves the same student in the
// action body and again inside preflight — cache() collapses those (and any
// other same-request lookups) into one round of queries.
const getStudentDetailForRequest = cache(getStudentDetailUncached);

export async function getStudentDetail(studentId: string): Promise<StudentDetail | null> {
  return getStudentDetailForRequest(studentId);
}

export async function createStudent(payload: StudentValidatedInput) {
  const supabase = await createClient();
  const shouldGenerateAdmissionNo = !payload.admissionNo;
  let data: { id: string } | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < (shouldGenerateAdmissionNo ? 3 : 1); attempt += 1) {
    const admissionNo = shouldGenerateAdmissionNo
      ? await generatePendingAdmissionNo()
      : payload.admissionNo;
    const result = await supabase
      .from("students")
      .insert({
        full_name: payload.fullName,
        class_id: payload.classId,
        admission_no: admissionNo,
        date_of_birth: payload.dateOfBirth,
        father_name: payload.fatherName,
        mother_name: payload.motherName,
        primary_phone: payload.fatherPhone,
        secondary_phone: payload.motherPhone,
        address: payload.address,
        transport_route_id: payload.transportRouteId,
        status: payload.status,
        notes: payload.notes,
        photo_path: payload.photoPath,
        ...toStudentInfoColumns(payload),
      })
      .select("id")
      .single();

    if (!result.error) {
      data = result.data as { id: string };
      break;
    }

    lastError = result.error.message;

    if (
      !shouldGenerateAdmissionNo ||
      !result.error.message.toLowerCase().includes("admission")
    ) {
      throw new Error(result.error.message);
    }
  }

  if (!data) {
    throw new Error(lastError ?? "Unable to create student.");
  }

  const studentId = data.id as string;
  try {
    await saveStudentFeeProfile(studentId, payload, null);
    await saveStudentConventionalDiscountProfile(studentId, payload);
  } catch (error) {
    const adminClient = createAdminClient();
    await adminClient.from("students").delete().eq("id", studentId);
    throw error;
  }
  return studentId;
}

export async function updateStudent(studentId: string, payload: StudentValidatedInput) {
  const supabase = await createClient();
  const existingOverride = await getStudentFeeOverrideRow(studentId);
  const { data, error } = await supabase
    .from("students")
    .update({
      full_name: payload.fullName,
      class_id: payload.classId,
      admission_no: payload.admissionNo,
      date_of_birth: payload.dateOfBirth,
      father_name: payload.fatherName,
      mother_name: payload.motherName,
      primary_phone: payload.fatherPhone,
      secondary_phone: payload.motherPhone,
      address: payload.address,
      transport_route_id: payload.transportRouteId,
      status: payload.status,
      notes: payload.notes,
      photo_path: payload.photoPath,
      ...toStudentInfoColumns(payload),
    })
    .eq("id", studentId)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const updatedStudentId = data.id as string;
  await saveStudentFeeProfile(updatedStudentId, payload, existingOverride);
  await saveStudentConventionalDiscountProfile(updatedStudentId, payload);
  return updatedStudentId;
}

/**
 * Writes only the information columns it is handed, and nothing else.
 *
 * The quick-edit sheets post one group at a time, and `updateStudent` is the
 * wrong tool for that: it writes the whole student row, so a partial post has
 * to be padded back out from the saved record first — the absent-vs-empty
 * dance in `updateStudentAction`. Here the columns simply are not in the
 * statement, so class, fees, discounts, status and SR no cannot be touched by
 * a sheet that never offered them.
 */
export async function updateStudentInfo(
  studentId: string,
  columns: Partial<StudentInfoFields>,
) {
  if (Object.keys(columns).length === 0) {
    return studentId;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update(toStudentInfoColumns(columns))
    .eq("id", studentId)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return studentId;
}

/** Writes only `photo_path`. See updateStudentPhotoAction for why. */
export async function updateStudentPhoto(
  studentId: string,
  photoPath: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ photo_path: photoPath })
    .eq("id", studentId)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return studentId;
}

/**
 * Removes one object from the student-photos bucket.
 *
 * Service-role, because the caller has already been permission-checked by the
 * action and the browser client's own delete would depend on the staff member
 * still holding write at the moment of cleanup.
 */
export async function deleteStudentPhotoObject(path: string) {
  if (!path || path.includes("..")) {
    return;
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from("student-photos").remove([path]);

  if (error) {
    throw new Error(error.message);
  }
}

async function countRows(
  tableName: string,
  studentId: string,
  columnName = "student_id",
) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq(columnName, studentId);

  if (error) {
    throw new Error(`Unable to check ${tableName}: ${error.message}`);
  }

  return count ?? 0;
}

async function countImportStudentReferences(studentId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .or(
      `target_student_id.eq.${studentId},duplicate_student_id.eq.${studentId},imported_student_id.eq.${studentId}`,
    );

  if (error) {
    throw new Error(`Unable to check import rows: ${error.message}`);
  }

  return count ?? 0;
}

export async function getStudentDeletionSafety(studentId: string): Promise<StudentDeletionSafety | null> {
  const student = await getStudentDetail(studentId);

  if (!student) {
    return null;
  }

  const [
    installmentCount,
    receiptCount,
    paymentCount,
    adjustmentCount,
    refundRequestCount,
    blockedInstallmentCount,
    ledgerRegenerationRowCount,
    importReferenceCount,
    feeOverrideCount,
    auditLogCount,
    receiptAdjustmentCount,
    receiptFinanceAdjustmentCount,
    carryForwardBalanceCount,
    sessionReanchorLogCount,
    paymentImportRowCount,
  ] = await Promise.all([
    countRows("installments", studentId),
    countRows("receipts", studentId),
    countRows("payments", studentId),
    countRows("payment_adjustments", studentId),
    countRows("refund_requests", studentId).catch(() => 0),
    countRows("config_change_blocked_installments", studentId).catch(() => 0),
    countRows("ledger_regeneration_rows", studentId).catch(() => 0),
    countImportStudentReferences(studentId).catch(() => 0),
    countRows("student_fee_overrides", studentId).catch(() => 0),
    countRows("audit_logs", studentId, "record_id").catch(() => 0),
    // The five counts below back `on delete restrict` / `no action` foreign keys
    // that used to be invisible to this check: the delete button was offered and
    // Postgres then refused the DELETE. The first two block; the rest are cleaned
    // up by hardDeleteStudent().
    countRows("receipt_adjustments", studentId).catch(() => 0),
    countRows("receipt_finance_adjustments", studentId).catch(() => 0),
    countRows("student_carry_forward_balances", studentId).catch(() => 0),
    countRows("student_session_reanchor_log", studentId).catch(() => 0),
    countRows("payment_import_rows", studentId).catch(() => 0),
  ]);
  const deletePolicy = getStudentDeletePolicy({
    installmentCount,
    receiptCount,
    paymentCount,
    adjustmentCount,
    refundRequestCount,
    receiptAdjustmentCount,
    receiptFinanceAdjustmentCount,
    blockedInstallmentCount,
    ledgerRegenerationRowCount,
    sessionLabel: student.classSessionLabel,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
  });

  return {
    studentId,
    hasFinancialHistory: deletePolicy.hasFinancialHistory,
    hardDeleteAllowed: deletePolicy.hardDeleteAllowed,
    generatedDuesDeleteAllowed: deletePolicy.generatedDuesDeleteAllowed,
    canForceDeleteTestRecord: deletePolicy.canForceDeleteTestRecord,
    installmentCount,
    receiptCount,
    paymentCount,
    adjustmentCount,
    refundRequestCount,
    blockedInstallmentCount,
    ledgerRegenerationRowCount,
    importReferenceCount,
    feeOverrideCount,
    auditLogCount,
    receiptAdjustmentCount,
    receiptFinanceAdjustmentCount,
    carryForwardBalanceCount,
    sessionReanchorLogCount,
    paymentImportRowCount,
    hardDeleteBlockers: deletePolicy.hardDeleteBlockers,
    sessionLabel: student.classSessionLabel,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
  };
}

export type BulkStudentUpdatePatch = {
  classId?: string | null;
  transportRouteId?: string | null;
  status?: import("@/lib/db/types").StudentStatus | null;
};

export async function bulkUpdateStudentFields(
  studentIds: readonly string[],
  patch: BulkStudentUpdatePatch,
) {
  const trimmedIds = studentIds.map((id) => id.trim()).filter(Boolean);

  if (trimmedIds.length === 0) {
    return { updatedCount: 0 };
  }

  const updates: Record<string, unknown> = {};

  if (patch.classId !== undefined) {
    updates.class_id = patch.classId;
  }

  if (patch.transportRouteId !== undefined) {
    updates.transport_route_id = patch.transportRouteId;
  }

  if (patch.status !== undefined && patch.status !== null) {
    updates.status = patch.status;
  }

  if (Object.keys(updates).length === 0) {
    return { updatedCount: 0 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update(updates)
    .in("id", trimmedIds)
    .select("id");

  if (error) {
    throw new Error(`Unable to bulk-update students: ${error.message}`);
  }

  return { updatedCount: (data ?? []).length };
}

export async function archiveStudent(studentId: string) {
  const supabase = await createClient();
  const existing = await getStudentDetail(studentId);
  const archiveNote = "Archived / withdrawn from Student Master.";
  const nextNotes = existing?.notes
    ? `${existing.notes}\n${archiveNote}`
    : archiveNote;
  const { error } = await supabase
    .from("students")
    .update({
      status: "left",
      notes: nextNotes,
    })
    .eq("id", studentId);

  if (error) {
    throw new Error(`Unable to archive student: ${error.message}`);
  }
}

export async function hardDeleteStudent(studentId: string, options: { forceTestRecord?: boolean } = {}) {
  const safety = await getStudentDeletionSafety(studentId);

  if (!safety) {
    throw new Error("Student record was not found.");
  }

  if (!safety.hardDeleteAllowed && !(options.forceTestRecord && safety.canForceDeleteTestRecord)) {
    throw new Error(
      `Cannot delete because this student is linked to ${safety.hardDeleteBlockers.join(", ")}. Withdraw student instead.`,
    );
  }

  const supabase = createAdminClient();

  // Derived / staging rows that hold an `on delete restrict` (or `no action`)
  // foreign key on this student. None of them is posted money — the money
  // tables are blockers above — but Postgres will still refuse the DELETE while
  // they exist, which is what made "delete" fail silently for staff. Clear them
  // first, in dependency order, before touching the student row itself.
  if (safety.carryForwardBalanceCount > 0) {
    const { error: carryForwardError } = await supabase
      .from("student_carry_forward_balances")
      .delete()
      .eq("student_id", studentId);

    if (carryForwardError) {
      throw new Error(
        `Unable to remove carried-forward balance rows: ${carryForwardError.message}`,
      );
    }
  }

  if (safety.sessionReanchorLogCount > 0) {
    const { error: reanchorError } = await supabase
      .from("student_session_reanchor_log")
      .delete()
      .eq("student_id", studentId);

    if (reanchorError) {
      throw new Error(`Unable to remove session reanchor log rows: ${reanchorError.message}`);
    }
  }

  // Payment import staging keeps its audit row; only the student pointer is
  // released (the column is nullable and the FK is `no action`).
  if (safety.paymentImportRowCount > 0) {
    const { error: paymentImportError } = await supabase
      .from("payment_import_rows")
      .update({ student_id: null })
      .eq("student_id", studentId);

    if (paymentImportError) {
      throw new Error(
        `Unable to unlink staged payment import rows: ${paymentImportError.message}`,
      );
    }
  }

  if (safety.installmentCount > 0) {
    const { error: installmentDeleteError } = await supabase
      .from("installments")
      .delete()
      .eq("student_id", studentId);

    if (installmentDeleteError) {
      throw new Error(`Unable to remove unpaid prepared dues: ${installmentDeleteError.message}`);
    }
  }

  const { error } = await supabase.from("students").delete().eq("id", studentId);

  if (error) {
    // 23503 = foreign_key_violation: some table still references this student.
    // Name it instead of leaking the raw Postgres text, and point staff at the
    // action that always works.
    if (error.code === "23503") {
      throw new Error(
        `This student is still linked to other records (${
          error.details ?? error.message
        }), so the record cannot be deleted. Withdraw the student instead.`,
      );
    }

    throw new Error(`Unable to delete student safely: ${error.message}`);
  }
}

export type StudentFamilyMemberDetail = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  statusLabel: string;
  isSelf: boolean;
  financials?: {
    totalDue: number;
    totalPaid: number;
    outstanding: number;
    discountCloseouts: number;
    lateFeeWaiver: number;
  } | null;
};

/**
 * A family is what staff linked, never what a shared phone number suggested.
 *
 * This used to fall back to `mv_student_sibling_groups` when a student had no
 * membership row, and render the result as an amber "Suspected Siblings" panel.
 * Two students sharing a guardian phone are not necessarily siblings — the live
 * data had one child appearing in two different detected families — so the
 * detection is gone. An unlinked student simply has no family until someone
 * links one through the picker.
 */
export async function getStudentFamilyMembersDetail(
  studentId: string,
): Promise<{
  familyGroupId: string | null;
  members: StudentFamilyMemberDetail[];
}> {
  const supabase = await createClient();

  // Resolve membership across ALL sessions (the link is per-student, not
  // per-session) so a linked sibling shows up in every session. We deliberately
  // avoid `.maybeSingle()` here: a student can have membership rows in more than
  // one session, and `.maybeSingle()` throws on multiple rows — which the
  // caller swallows, making siblings silently disappear.
  const { data: ownMembershipRows } = await supabase
    .from("student_family_members")
    .select("family_group_id")
    .eq("student_id", studentId);

  const familyGroupId = (ownMembershipRows ?? [])[0]?.family_group_id ?? null;

  if (!familyGroupId) {
    return { familyGroupId: null, members: [] };
  }

  let targetStudentIds: string[] = [studentId];

  const { data: allConfirmedMembers } = await supabase
    .from("student_family_members")
    .select("student_id")
    .eq("family_group_id", familyGroupId);

  if (allConfirmedMembers && allConfirmedMembers.length > 0) {
    targetStudentIds = [...new Set(allConfirmedMembers.map((m) => m.student_id))];
  }

  if (targetStudentIds.length === 0) {
    return { familyGroupId: null, members: [] };
  }

  // 3. Fetch student details and class labels
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, full_name, admission_no, status, class_ref:classes(class_name, section, stream_name)")
    .in("id", targetStudentIds);

  if (studentsError) {
    throw new Error(`Unable to load student family details: ${studentsError.message}`);
  }

  // 4. Fetch financial status from v_workbook_student_financials or v_student_financial_state
  const { data: financials } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, base_charge_total, total_due, total_paid, outstanding_amount, total_discount_closeouts, waiver_applied1, waiver_applied2, waiver_applied3, waiver_applied4",
    )
    .in("student_id", targetStudentIds);

  const financialsMap = new Map<
    string,
    { totalDue: number; totalPaid: number; outstanding: number; discountCloseouts: number; lateFeeWaiver: number }
  >();
  if (financials) {
    financials.forEach((f) => {
      const waiver =
        (f.waiver_applied1 ?? 0) +
        (f.waiver_applied2 ?? 0) +
        (f.waiver_applied3 ?? 0) +
        (f.waiver_applied4 ?? 0);
      financialsMap.set(f.student_id, {
        totalDue: f.base_charge_total ?? f.total_due,
        totalPaid: f.total_paid,
        outstanding: f.outstanding_amount,
        discountCloseouts: f.total_discount_closeouts ?? 0,
        lateFeeWaiver: waiver,
      });
    });
  }

  const members = students.map((s) => {
    const classRef = toSingleRecord(s.class_ref);
    return {
      id: s.id,
      fullName: s.full_name,
      admissionNo: s.admission_no,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      statusLabel: s.status === "active" ? "Active" : "Inactive",
      isSelf: s.id === studentId,
      financials: financialsMap.get(s.id) ?? null,
    } satisfies StudentFamilyMemberDetail;
  });

  return {
    familyGroupId,
    members: members.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.fullName.localeCompare(b.fullName))),
  };
}
