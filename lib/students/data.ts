import "server-only";


import { getFeePolicySummary, getFeeSetupPageData, upsertStudentFeeOverride } from "@/lib/fees/data";
import {
  getConventionalDiscountPolicies,
  getStudentConventionalDiscountAssignments,
  saveStudentConventionalDiscountAssignments,
} from "@/lib/fees/conventional-discounts";
import { getMasterDataOptions } from "@/lib/master-data/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { getStudentDeletePolicy } from "@/lib/students/delete-policy";
import type {
  StudentClassOption,
  StudentDetail,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
  StudentSessionOption,
  StudentSiblingPill,
  SiblingGroupSummary,
  StudentDeletionSafety,
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
  created_at: string;
  updated_at: string;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
  route_ref: StudentJoinRoute | StudentJoinRoute[] | null;
};

type StudentWorkbookFinancialRow = {
  student_id: string;
  workbook_student_key?: string | null;
  student_status_label: "New" | "Old";
  tuition_fee?: number | null;
  transport_fee?: number | null;
  academic_fee?: number | null;
  gross_base_before_discount?: number | null;
  discount_amount?: number | null;
  base_total_due?: number | null;
  base_charge_total?: number | null;
  installment1_base?: number | null;
  installment2_base?: number | null;
  installment3_base?: number | null;
  installment4_base?: number | null;
  total_paid?: number | null;
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

type SiblingGroupViewRow = {
  group_key: string;
  session_label: string;
  student_ids: string[] | null;
  student_count: number;
  phone_match: string[] | null;
  father_name_match: boolean | null;
  confidence: "confirmed" | "suspected";
  existing_family_group_id: string | null;
};

type SiblingGroupStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
};

type StudentFamilyGroupRow = {
  id: string;
  academic_session_label: string;
  family_label: string;
  guardian_phone: string | null;
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

function isRecoverableSiblingGroupLoadError(error: { message?: string } | null | undefined) {
  if (!error?.message) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("v_student_sibling_groups") || isRecoverableWorkbookLoadError(error);
}

function buildSiblingPill(group: SiblingGroupViewRow, studentId: string): StudentSiblingPill | null {
  const studentIds = group.student_ids ?? [];
  const siblingCount = Math.max(0, studentIds.filter((id) => id !== studentId).length);

  if (siblingCount < 1) {
    return null;
  }

  const href = group.existing_family_group_id
    ? `/protected/students/families?group=${encodeURIComponent(group.existing_family_group_id)}`
    : `/protected/students/families?suspect=${encodeURIComponent(group.group_key)}`;

  return {
    siblingCount,
    href,
    confidence: group.confidence,
  };
}

async function getStudentSiblingPills(
  studentIds: readonly string[],
  sessionLabel?: string | null,
) {
  if (studentIds.length === 0) {
    return new Map<string, StudentSiblingPill>();
  }

  const supabase = await createClient();
  let query = supabase
    .from("v_student_sibling_groups")
    .select(
      "group_key, session_label, student_ids, student_count, phone_match, father_name_match, confidence, existing_family_group_id",
    )
    .overlaps("student_ids", studentIds);

  if (sessionLabel) {
    query = query.eq("session_label", sessionLabel);
  }

  const [
    { data, error },
    { data: matchingMembersRaw, error: matchingMembersError },
  ] = await Promise.all([
    query,
    (() => {
      let memberQuery = supabase
        .from("student_family_members")
        .select("family_group_id, student_id, academic_session_label")
        .in("student_id", studentIds);

      if (sessionLabel) {
        memberQuery = memberQuery.eq("academic_session_label", sessionLabel);
      }

      return memberQuery;
    })(),
  ]);

  if (error) {
    if (isRecoverableSiblingGroupLoadError(error)) {
      console.warn("Sibling group fields could not be loaded; falling back to base student data.", error.message);
      return new Map<string, StudentSiblingPill>();
    }

    throw new Error(`Unable to load sibling group fields: ${error.message}`);
  }

  const groups = ((data ?? []) as SiblingGroupViewRow[]).filter((group) => group.student_count >= 2);
  const map = new Map<string, StudentSiblingPill>();

  if (matchingMembersError) {
    if (!isRecoverableSiblingGroupLoadError(matchingMembersError)) {
      throw new Error(`Unable to load confirmed sibling fields: ${matchingMembersError.message}`);
    }
  } else {
    const matchingMembers = (matchingMembersRaw ?? []) as StudentFamilyMemberRow[];
    const familyGroupIds = [...new Set(matchingMembers.map((row) => row.family_group_id))];

    if (familyGroupIds.length > 0) {
      const { data: familyMembersRaw, error: familyMembersError } = await supabase
        .from("student_family_members")
        .select("family_group_id, student_id, academic_session_label")
        .in("family_group_id", familyGroupIds);

      if (familyMembersError && !isRecoverableSiblingGroupLoadError(familyMembersError)) {
        throw new Error(`Unable to load confirmed family members: ${familyMembersError.message}`);
      }

      const membersByFamily = new Map<string, StudentFamilyMemberRow[]>();
      ((familyMembersRaw ?? []) as StudentFamilyMemberRow[]).forEach((row) => {
        membersByFamily.set(row.family_group_id, [...(membersByFamily.get(row.family_group_id) ?? []), row]);
      });

      membersByFamily.forEach((members, familyGroupId) => {
        if (members.length < 2) {
          return;
        }

        members.forEach((member) => {
          if (!studentIds.includes(member.student_id)) {
            return;
          }

          map.set(member.student_id, {
            siblingCount: members.filter((row) => row.student_id !== member.student_id).length,
            href: `/protected/students/families?group=${encodeURIComponent(familyGroupId)}`,
            confidence: "confirmed",
          });
        });
      });
    }
  }

  groups.forEach((group) => {
    (group.student_ids ?? []).forEach((studentId) => {
      if (!studentIds.includes(studentId) || map.has(studentId)) {
        return;
      }

      const pill = buildSiblingPill(group, studentId);

      if (pill) {
        map.set(studentId, pill);
      }
    });
  });

  return map;
}

/** Loads detected sibling groups with child rows and pending totals for the Students family workspace. */
export async function getSiblingGroups(sessionLabel?: string | null): Promise<SiblingGroupSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_student_sibling_groups")
    .select(
      "group_key, session_label, student_ids, student_count, phone_match, father_name_match, confidence, existing_family_group_id",
    )
    .order("confidence", { ascending: true })
    .order("student_count", { ascending: false });

  if (sessionLabel) {
    query = query.eq("session_label", sessionLabel);
  }

  const [
    { data, error },
    { data: familyGroupsRaw, error: familyGroupsError },
  ] = await Promise.all([
    query,
    (() => {
      let familyQuery = supabase
        .from("student_family_groups")
        .select("id, academic_session_label, family_label, guardian_phone")
        .order("family_label", { ascending: true });

      if (sessionLabel) {
        familyQuery = familyQuery.eq("academic_session_label", sessionLabel);
      }

      return familyQuery;
    })(),
  ]);

  if (error) {
    throw new Error(`Unable to load sibling groups: ${error.message}`);
  }

  if (familyGroupsError) {
    throw new Error(`Unable to load confirmed family groups: ${familyGroupsError.message}`);
  }

  const groups = ((data ?? []) as SiblingGroupViewRow[]).filter((group) => group.student_count >= 2);
  const familyGroups = (familyGroupsRaw ?? []) as StudentFamilyGroupRow[];
  let confirmedFamilyMembers: StudentFamilyMemberRow[] = [];

  if (familyGroups.length > 0) {
    const { data: membersRaw, error: membersError } = await supabase
      .from("student_family_members")
      .select("family_group_id, student_id, academic_session_label")
      .in("family_group_id", familyGroups.map((group) => group.id));

    if (membersError) {
      throw new Error(`Unable to load confirmed family members: ${membersError.message}`);
    }

    confirmedFamilyMembers = (membersRaw ?? []) as StudentFamilyMemberRow[];
  }

  const detectedFamilyIds = new Set(
    groups.flatMap((group) => (group.existing_family_group_id ? [group.existing_family_group_id] : [])),
  );
  const membersByFamily = new Map<string, StudentFamilyMemberRow[]>();
  confirmedFamilyMembers.forEach((member) => {
    membersByFamily.set(member.family_group_id, [...(membersByFamily.get(member.family_group_id) ?? []), member]);
  });
  const persistedOnlyGroups: SiblingGroupViewRow[] = familyGroups.flatMap((group) => {
    if (detectedFamilyIds.has(group.id)) {
      return [];
    }

    const members = membersByFamily.get(group.id) ?? [];
    const memberIds = members.map((member) => member.student_id).sort();

    if (memberIds.length < 2) {
      return [];
    }

    return [
      {
        group_key: group.id,
        session_label: group.academic_session_label,
        student_ids: memberIds,
        student_count: memberIds.length,
        phone_match: group.guardian_phone ? [group.guardian_phone] : [],
        father_name_match: false,
        confidence: "confirmed",
        existing_family_group_id: group.id,
      } satisfies SiblingGroupViewRow,
    ];
  });
  const allGroups = [...groups, ...persistedOnlyGroups];
  const allStudentIds = [...new Set(allGroups.flatMap((group) => group.student_ids ?? []))];

  if (allGroups.length === 0 || allStudentIds.length === 0) {
    return [];
  }

  const [studentsResult, financialsResult] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, admission_no, full_name, class_ref:classes(id, session_label, status, class_name, section, stream_name)",
      )
      .in("id", allStudentIds),
    supabase
      .from("v_workbook_student_financials")
      .select("student_id, outstanding_amount")
      .in("student_id", allStudentIds),
  ]);

  if (studentsResult.error) {
    throw new Error(`Unable to load sibling students: ${studentsResult.error.message}`);
  }

  if (financialsResult.error && !isRecoverableWorkbookLoadError(financialsResult.error)) {
    throw new Error(`Unable to load sibling pending totals: ${financialsResult.error.message}`);
  }

  const studentMap = new Map(
    ((studentsResult.data ?? []) as SiblingGroupStudentRow[]).map((row) => [row.id, row]),
  );
  const outstandingMap = new Map(
    ((financialsResult.data ?? []) as Array<{ student_id: string; outstanding_amount: number | null }>).map(
      (row) => [row.student_id, row.outstanding_amount ?? 0],
    ),
  );

  return allGroups.map((group) => {
    const studentIds = group.student_ids ?? [];
    const students = studentIds.flatMap((studentId) => {
      const row = studentMap.get(studentId);

      if (!row) {
        return [];
      }

      const classRef = toSingleRecord(row.class_ref);

      return [
        {
          studentId: row.id,
          admissionNo: row.admission_no,
          fullName: row.full_name,
          classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
          outstandingAmount: outstandingMap.get(row.id) ?? 0,
        },
      ];
    });

    return {
      groupKey: group.group_key,
      sessionLabel: group.session_label,
      studentIds,
      studentCount: group.student_count,
      phoneMatch: group.phone_match ?? [],
      fatherNameMatch: Boolean(group.father_name_match),
      confidence: group.confidence,
      existingFamilyGroupId: group.existing_family_group_id,
      guardianPhone: group.phone_match?.[0] ?? null,
      pendingTotal: students.reduce((total, student) => total + student.outstandingAmount, 0),
      students,
    } satisfies SiblingGroupSummary;
  });
}

export async function getStudentSiblingPill(studentId: string) {
  return (await getStudentSiblingPills([studentId])).get(studentId) ?? null;
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
      "id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes",
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
    payload.lateFeeWaiverAmount > 0 ||
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
    customLateFeeFlatAmount: existingOverride?.custom_late_fee_flat_amount ?? null,
    otherAdjustmentHead: payload.otherAdjustmentHead,
    otherAdjustmentAmount: payload.otherAdjustmentAmount,
    lateFeeWaiverAmount: payload.lateFeeWaiverAmount,
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
  const options = await getMasterDataOptions();
  const policy = await getFeePolicySummary();
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
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, date_of_birth, status, primary_phone, secondary_phone, updated_at, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
      { count: "exact" },
    )
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true })
    .range(from, to);

  if (filters.query) {
    query = query.ilike("full_name", `%${filters.query}%`);
  }

  if (filters.sessionLabel) {
    query = query.eq("class_ref.session_label", filters.sessionLabel);
  }

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.transportRouteId) {
    query = query.eq("transport_route_id", filters.transportRouteId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Unable to load students: ${error.message}`);
  }

  const studentRows = (data ?? []) as StudentListRow[];

  let financialMap = new Map<string, StudentWorkbookFinancialRow>();
  let overrideMap = new Map<string, StudentFeeOverrideRow>();
  let conventionalDiscountMap = new Map<string, string[]>();
  let siblingPillMap = new Map<string, StudentSiblingPill>();

  if (studentRows.length > 0) {
    const studentIds = studentRows.map((row) => row.id);
    const [
      { data: financialsRaw, error: financialsError },
      { data: overridesRaw, error: overridesError },
      conventionalAssignments,
      loadedSiblingPills,
    ] = await Promise.all([
      supabase
        .from("v_workbook_student_financials")
        .select(
          "student_id, workbook_student_key, student_status_label, tuition_fee, transport_fee, academic_fee, gross_base_before_discount, discount_amount, base_total_due, base_charge_total, installment1_base, installment2_base, installment3_base, installment4_base, total_paid, late_fee_total, total_due, outstanding_amount, next_due_label, next_due_date, next_due_amount, status_label, last_payment_date, last_payment_amount, duplicate_sr_flag, missing_dob_flag, missing_class_flag, missing_status_flag",
        )
        .in("student_id", studentIds),
      supabase
        .from("student_fee_overrides")
        .select(
          "id, student_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes",
        )
        .eq("is_active", true)
        .in("student_id", studentIds),
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: listSessionLabel,
        studentIds,
      }).catch(() => []),
      getStudentSiblingPills(studentIds, listSessionLabel).catch((error) => {
        if (isRecoverableSiblingGroupLoadError(error)) {
          return new Map<string, StudentSiblingPill>();
        }

        throw error;
      }),
    ]);

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

    financialMap = new Map(
      ((financialsRaw ?? []) as StudentWorkbookFinancialRow[]).map((row) => [row.student_id, row]),
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
      transportRouteLabel: routeRef
        ? routeRef.route_code
          ? `${routeRef.route_name} (${routeRef.route_code})`
          : routeRef.route_name
        : "No Transport",
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
      lateFeeTotal: financial?.late_fee_total ?? 0,
      totalDue: financial?.total_due ?? 0,
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
    } satisfies StudentListItem;
  });

  return {
    students,
    totalCount: count ?? 0,
    page,
    pageSize,
  };
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

async function getStudentDetailUncached(studentId: string): Promise<StudentDetail | null> {
  const supabase = await getCacheSafeClient();
  const policy = await getFeePolicySummary();
  const [studentResult, overrideRow, financialResult, conventionalAssignments] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, admission_no, full_name, date_of_birth, father_name, mother_name, primary_phone, secondary_phone, address, class_id, transport_route_id, status, notes, created_at, updated_at, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
      )
      .eq("id", studentId)
      .maybeSingle(),
    getStudentFeeOverrideRow(studentId),
    supabase
      .from("v_workbook_student_financials")
      .select("student_id, student_status_label, tuition_fee, outstanding_amount")
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

  const row = studentResult.data as StudentDetailRow;
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
    id: row.id,
    admissionNo: row.admission_no,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.primary_phone,
    motherPhone: row.secondary_phone,
    address: row.address,
    classId: row.class_id,
    classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    classSessionLabel: classRef?.session_label ?? "",
    transportRouteId: row.transport_route_id,
    transportRouteLabel: routeRef
      ? routeRef.route_code
        ? `${routeRef.route_name} (${routeRef.route_code})`
        : routeRef.route_name
      : "No Transport",
    status: row.status,
    studentTypeOverride: overrideRow?.student_type_override ?? "existing",
    studentStatusLabel: getStudentStatusLabel(overrideRow, financial),
    tuitionOverride: overrideRow?.custom_tuition_fee_amount ?? null,
    transportOverride: overrideRow?.custom_transport_fee_amount ?? null,
    discountAmount: overrideRow?.discount_amount ?? 0,
    lateFeeWaiverAmount: overrideRow?.late_fee_waiver_amount ?? 0,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies StudentDetail;
}

export async function getStudentDetail(studentId: string): Promise<StudentDetail | null> {
  return cacheSafeUnstableCache(
    async () => getStudentDetailUncached(studentId),
    ["student-detail", studentId],
    { tags: [`student:${studentId}`] },
  )();
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
  ]);
  const deletePolicy = getStudentDeletePolicy({
    installmentCount,
    receiptCount,
    paymentCount,
    adjustmentCount,
    refundRequestCount,
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
    hardDeleteBlockers: deletePolicy.hardDeleteBlockers,
    sessionLabel: student.classSessionLabel,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
  };
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
  } | null;
};

export async function getStudentFamilyMembersDetail(
  studentId: string,
  sessionLabel: string,
): Promise<{
  familyGroupId: string | null;
  confidence: "confirmed" | "suspected" | null;
  members: StudentFamilyMemberDetail[];
}> {
  const supabase = await createClient();

  // 1. Check if student has a confirmed family group
  const { data: confirmedGroupRow } = await supabase
    .from("student_family_members")
    .select("family_group_id")
    .eq("student_id", studentId)
    .eq("academic_session_label", sessionLabel)
    .maybeSingle();

  let targetStudentIds: string[] = [studentId];
  let familyGroupId: string | null = null;
  let confidence: "confirmed" | "suspected" | null = null;

  if (confirmedGroupRow) {
    familyGroupId = confirmedGroupRow.family_group_id;
    confidence = "confirmed";
    const { data: allConfirmedMembers } = await supabase
      .from("student_family_members")
      .select("student_id")
      .eq("family_group_id", familyGroupId)
      .eq("academic_session_label", sessionLabel);

    if (allConfirmedMembers && allConfirmedMembers.length > 0) {
      targetStudentIds = allConfirmedMembers.map((m) => m.student_id);
    }
  } else {
    // 2. If not confirmed, check if suspected sibling group exists
    const { data: suspectedGroupRow } = await supabase
      .from("v_student_sibling_groups")
      .select("student_ids, confidence, existing_family_group_id")
      .overlaps("student_ids", [studentId])
      .eq("session_label", sessionLabel)
      .maybeSingle();

    if (suspectedGroupRow && suspectedGroupRow.student_ids) {
      targetStudentIds = suspectedGroupRow.student_ids;
      confidence = suspectedGroupRow.confidence as "confirmed" | "suspected";
      familyGroupId = suspectedGroupRow.existing_family_group_id;
    }
  }

  if (targetStudentIds.length === 0) {
    return { familyGroupId: null, confidence: null, members: [] };
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
    .select("student_id, total_due, total_paid, outstanding_amount")
    .in("student_id", targetStudentIds);

  const financialsMap = new Map<string, { totalDue: number; totalPaid: number; outstanding: number }>();
  if (financials) {
    financials.forEach((f) => {
      financialsMap.set(f.student_id, {
        totalDue: f.total_due,
        totalPaid: f.total_paid,
        outstanding: f.outstanding_amount,
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
    confidence,
    members: members.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.fullName.localeCompare(b.fullName))),
  };
}
