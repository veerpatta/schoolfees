import "server-only";

import { getFeePolicySummary, upsertStudentFeeOverride } from "@/lib/fees/data";
import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import type {
  StudentClassOption,
  StudentDetail,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
  StudentSessionOption,
  StudentValidatedInput,
} from "@/lib/students/types";

type StudentJoinClass = {
  id: string;
  session_label: string;
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
  student_status_label: "New" | "Old";
  outstanding_amount: number;
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

  const allClassOptions: StudentClassOption[] = options.classOptions.map((row) => ({
    id: row.id,
    label: row.label,
    sessionLabel: row.sessionLabel,
  }));
  const requestedSessionLabel = payload?.sessionLabel?.trim() ?? "";
  const resolvedSessionLabel =
    requestedSessionLabel || options.currentSessionLabel || "";
  const classOptions = getClassOptionsForSession(
    allClassOptions,
    resolvedSessionLabel || null,
  );
  const sessionOptions = buildStudentSessionOptions(
    allClassOptions,
    options.currentSessionLabel,
  );

  const routeOptions: StudentRouteOption[] = options.routeOptions.map((row) => ({
    id: row.id,
    label: row.label,
    routeCode: row.routeCode,
    isActive: row.isActive,
  }));

  return {
    currentSessionLabel: options.currentSessionLabel,
    resolvedSessionLabel,
    sessionOptions,
    allClassOptions,
    classOptions,
    routeOptions,
  };
}

export async function getStudents(filters: StudentListFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, status, primary_phone, secondary_phone, updated_at, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
    )
    .order("full_name", { ascending: true });

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

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load students: ${error.message}`);
  }

  const studentRows = (data ?? []) as StudentListRow[];

  let financialMap = new Map<string, StudentWorkbookFinancialRow>();
  let overrideMap = new Map<string, StudentFeeOverrideRow>();

  if (studentRows.length > 0) {
    const studentIds = studentRows.map((row) => row.id);
    const [
      { data: financialsRaw, error: financialsError },
      { data: overridesRaw, error: overridesError },
    ] = await Promise.all([
      supabase
        .from("v_workbook_student_financials")
        .select("student_id, student_status_label, outstanding_amount")
        .in("student_id", studentIds),
      supabase
        .from("student_fee_overrides")
        .select(
          "id, student_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes",
        )
        .eq("is_active", true)
        .in("student_id", studentIds),
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
  }

  return studentRows.map((row) => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);
    const financial = financialMap.get(row.id) ?? null;
    const override = overrideMap.get(row.id) ?? null;
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
      admissionNo: row.admission_no,
      fullName: row.full_name,
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
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
      outstandingAmount: financial?.outstanding_amount ?? 0,
      updatedAt: row.updated_at,
    } satisfies StudentListItem;
  });
}

export async function getStudentDetail(studentId: string) {
  const supabase = await createClient();
  const [studentResult, overrideRow, financialResult] = await Promise.all([
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
      .select("student_id, student_status_label, outstanding_amount")
      .eq("student_id", studentId)
      .maybeSingle(),
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
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies StudentDetail;
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
  await saveStudentFeeProfile(studentId, payload, null);
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
  return updatedStudentId;
}
