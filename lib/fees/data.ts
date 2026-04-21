import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ClassFeeDefault,
  FeeSetupClassOption,
  FeeSetupPageData,
  FeeSetupStudentOption,
  SchoolFeeDefault,
  StudentFeeOverride,
} from "@/lib/fees/types";

type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_id: string;
  class_ref: ClassRow | ClassRow[] | null;
};

type SchoolDefaultRow = {
  id: string;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  late_fee_flat_amount: number;
  installment_count: number;
  installment_due_dates: string[];
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
};

type FeeSettingRow = {
  id: string;
  class_id: string;
  annual_base_amount: number;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  late_fee_flat_amount: number;
  installment_count: number;
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
  class_ref: ClassRow | ClassRow[] | null;
};

type StudentOverrideRow = {
  id: string;
  student_id: string;
  fee_setting_id: string;
  custom_tuition_fee_amount: number | null;
  custom_transport_fee_amount: number | null;
  custom_books_fee_amount: number | null;
  custom_admission_activity_misc_fee_amount: number | null;
  custom_other_fee_heads: Record<string, unknown> | null;
  custom_late_fee_flat_amount: number | null;
  discount_amount: number;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
  reason: string;
  notes: string | null;
  updated_at: string;
  student_ref:
    | {
        id: string;
        full_name: string;
        admission_no: string;
        class_ref: ClassRow | ClassRow[] | null;
      }
    | Array<{
        id: string;
        full_name: string;
        admission_no: string;
        class_ref: ClassRow | ClassRow[] | null;
      }>
    | null;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

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

function parseOtherFeeHeads(value: Record<string, unknown> | null) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, rawValue]) => {
    if (!key.trim()) {
      return acc;
    }

    if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
      return acc;
    }

    acc[key] = Math.trunc(rawValue);
    return acc;
  }, {});
}

function mapClassOptions(classRows: ClassRow[]): FeeSetupClassOption[] {
  return classRows.map((row) => ({
    id: row.id,
    label: buildClassLabel(row),
    sessionLabel: row.session_label,
  }));
}

function mapStudentOptions(studentRows: StudentRow[]): FeeSetupStudentOption[] {
  return studentRows.map((row) => {
    const classRef = toSingleRecord(row.class_ref);

    return {
      id: row.id,
      label: `${row.full_name} (${row.admission_no})`,
      classId: row.class_id,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    };
  });
}

export async function getFeeSetupPageData(): Promise<FeeSetupPageData> {
  const supabase = await createClient();

  const [
    { data: schoolDefaultRaw, error: schoolDefaultError },
    { data: classRowsRaw, error: classRowsError },
    { data: classDefaultsRaw, error: classDefaultsError },
    { data: studentRowsRaw, error: studentRowsError },
    { data: studentOverridesRaw, error: studentOverridesError },
  ] = await Promise.all([
    supabase
      .from("school_fee_defaults")
      .select(
        "id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, late_fee_flat_amount, installment_count, installment_due_dates, student_type_default, transport_applies_default, notes, updated_at",
      )
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("classes")
      .select("id, session_label, class_name, section, stream_name")
      .order("session_label", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("class_name", { ascending: true }),
    supabase
      .from("fee_settings")
      .select(
        "id, class_id, annual_base_amount, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, late_fee_flat_amount, installment_count, student_type_default, transport_applies_default, notes, updated_at, class_ref:classes(id, session_label, class_name, section, stream_name)",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("students")
      .select(
        "id, full_name, admission_no, class_id, class_ref:classes(id, session_label, class_name, section, stream_name)",
      )
      .in("status", ["active", "inactive"])
      .order("full_name", { ascending: true }),
    supabase
      .from("student_fee_overrides")
      .select(
        "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, discount_amount, student_type_override, transport_applies_override, reason, notes, updated_at, student_ref:students(id, full_name, admission_no, class_ref:classes(id, session_label, class_name, section, stream_name))",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false }),
  ]);

  if (schoolDefaultError) {
    throw new Error(`Unable to load school defaults: ${schoolDefaultError.message}`);
  }

  if (classRowsError) {
    throw new Error(`Unable to load class options: ${classRowsError.message}`);
  }

  if (classDefaultsError) {
    throw new Error(`Unable to load class defaults: ${classDefaultsError.message}`);
  }

  if (studentRowsError) {
    throw new Error(`Unable to load student options: ${studentRowsError.message}`);
  }

  if (studentOverridesError) {
    throw new Error(`Unable to load student overrides: ${studentOverridesError.message}`);
  }

  const schoolDefault = schoolDefaultRaw
    ? ({
        id: (schoolDefaultRaw as SchoolDefaultRow).id,
        tuitionFee: (schoolDefaultRaw as SchoolDefaultRow).tuition_fee_amount,
        transportFee: (schoolDefaultRaw as SchoolDefaultRow).transport_fee_amount,
        booksFee: (schoolDefaultRaw as SchoolDefaultRow).books_fee_amount,
        admissionActivityMiscFee: (schoolDefaultRaw as SchoolDefaultRow).admission_activity_misc_fee_amount,
        otherFeeHeads: parseOtherFeeHeads((schoolDefaultRaw as SchoolDefaultRow).other_fee_heads),
        lateFeeFlatAmount: (schoolDefaultRaw as SchoolDefaultRow).late_fee_flat_amount,
        installmentCount: (schoolDefaultRaw as SchoolDefaultRow).installment_count,
        installmentDueDates: (schoolDefaultRaw as SchoolDefaultRow).installment_due_dates,
        studentTypeDefault: (schoolDefaultRaw as SchoolDefaultRow).student_type_default,
        transportAppliesDefault: (schoolDefaultRaw as SchoolDefaultRow).transport_applies_default,
        notes: (schoolDefaultRaw as SchoolDefaultRow).notes,
        updatedAt: (schoolDefaultRaw as SchoolDefaultRow).updated_at,
      } satisfies SchoolFeeDefault)
    : null;

  const classDefaults = (classDefaultsRaw ?? []).map((rawRow) => {
    const row = rawRow as FeeSettingRow;
    const classRef = toSingleRecord(row.class_ref);

    return {
      id: row.id,
      classId: row.class_id,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      sessionLabel: classRef?.session_label ?? "Unknown session",
      annualBaseAmount: row.annual_base_amount,
      tuitionFee: row.tuition_fee_amount,
      transportFee: row.transport_fee_amount,
      booksFee: row.books_fee_amount,
      admissionActivityMiscFee: row.admission_activity_misc_fee_amount,
      otherFeeHeads: parseOtherFeeHeads(row.other_fee_heads),
      lateFeeFlatAmount: row.late_fee_flat_amount,
      installmentCount: row.installment_count,
      studentTypeDefault: row.student_type_default,
      transportAppliesDefault: row.transport_applies_default,
      notes: row.notes,
      updatedAt: row.updated_at,
    } satisfies ClassFeeDefault;
  });

  const studentOverrides = (studentOverridesRaw ?? []).map((rawRow) => {
    const row = rawRow as StudentOverrideRow;
    const studentRef = toSingleRecord(row.student_ref);
    const classRef = studentRef ? toSingleRecord(studentRef.class_ref) : null;

    return {
      id: row.id,
      studentId: row.student_id,
      studentLabel: studentRef
        ? `${studentRef.full_name} (${studentRef.admission_no})`
        : "Unknown student",
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      feeSettingId: row.fee_setting_id,
      customTuitionFeeAmount: row.custom_tuition_fee_amount,
      customTransportFeeAmount: row.custom_transport_fee_amount,
      customBooksFeeAmount: row.custom_books_fee_amount,
      customAdmissionActivityMiscFeeAmount: row.custom_admission_activity_misc_fee_amount,
      customOtherFeeHeads: parseOtherFeeHeads(row.custom_other_fee_heads),
      customLateFeeFlatAmount: row.custom_late_fee_flat_amount,
      discountAmount: row.discount_amount,
      studentTypeOverride: row.student_type_override,
      transportAppliesOverride: row.transport_applies_override,
      reason: row.reason,
      notes: row.notes,
      updatedAt: row.updated_at,
    } satisfies StudentFeeOverride;
  });

  return {
    schoolDefault,
    classDefaults,
    studentOverrides,
    classOptions: mapClassOptions((classRowsRaw ?? []) as ClassRow[]),
    studentOptions: mapStudentOptions((studentRowsRaw ?? []) as StudentRow[]),
  };
}

export async function upsertSchoolFeeDefaults(payload: {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  otherFeeHeads: Record<string, number>;
  lateFeeFlatAmount: number;
  installmentCount: number;
  installmentDueDates: string[];
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("school_fee_defaults")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const values = {
    tuition_fee_amount: payload.tuitionFee,
    transport_fee_amount: payload.transportFee,
    books_fee_amount: payload.booksFee,
    admission_activity_misc_fee_amount: payload.admissionActivityMiscFee,
    other_fee_heads: payload.otherFeeHeads,
    late_fee_flat_amount: payload.lateFeeFlatAmount,
    installment_count: payload.installmentCount,
    installment_due_dates: payload.installmentDueDates,
    student_type_default: payload.studentTypeDefault,
    transport_applies_default: payload.transportAppliesDefault,
    notes: payload.notes,
    is_active: true,
  };

  if (existing?.id) {
    const { error } = await supabase.from("school_fee_defaults").update(values).eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("school_fee_defaults")
    .insert(values)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function upsertClassFeeDefault(payload: {
  classId: string;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  otherFeeHeads: Record<string, number>;
  lateFeeFlatAmount: number;
  installmentCount: number;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();

  const annualBaseAmount =
    payload.tuitionFee +
    payload.booksFee +
    payload.admissionActivityMiscFee +
    Object.values(payload.otherFeeHeads).reduce((sum, value) => sum + value, 0);

  const values = {
    class_id: payload.classId,
    annual_base_amount: annualBaseAmount,
    tuition_fee_amount: payload.tuitionFee,
    transport_fee_amount: payload.transportFee,
    books_fee_amount: payload.booksFee,
    admission_activity_misc_fee_amount: payload.admissionActivityMiscFee,
    other_fee_heads: payload.otherFeeHeads,
    late_fee_flat_amount: payload.lateFeeFlatAmount,
    installment_count: payload.installmentCount,
    student_type_default: payload.studentTypeDefault,
    transport_applies_default: payload.transportAppliesDefault,
    notes: payload.notes,
    is_active: true,
  };

  const { data: existing, error: existingError } = await supabase
    .from("fee_settings")
    .select("id")
    .eq("class_id", payload.classId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabase.from("fee_settings").update(values).eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("fee_settings")
    .insert(values)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function upsertStudentFeeOverride(payload: {
  studentId: string;
  customTuitionFeeAmount: number | null;
  customTransportFeeAmount: number | null;
  customBooksFeeAmount: number | null;
  customAdmissionActivityMiscFeeAmount: number | null;
  customOtherFeeHeads: Record<string, number>;
  customLateFeeFlatAmount: number | null;
  discountAmount: number;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  reason: string;
  notes: string | null;
}) {
  const supabase = await createClient();

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("id", payload.studentId)
    .maybeSingle();

  if (studentError) {
    throw new Error(studentError.message);
  }

  if (!student) {
    throw new Error("Student not found.");
  }

  const { data: feeSetting, error: feeSettingError } = await supabase
    .from("fee_settings")
    .select("id")
    .eq("class_id", student.class_id)
    .eq("is_active", true)
    .maybeSingle();

  if (feeSettingError) {
    throw new Error(feeSettingError.message);
  }

  if (!feeSetting) {
    throw new Error("Create class fee defaults for this student before saving an override.");
  }

  const hasOverrideField =
    payload.customTuitionFeeAmount !== null ||
    payload.customTransportFeeAmount !== null ||
    payload.customBooksFeeAmount !== null ||
    payload.customAdmissionActivityMiscFeeAmount !== null ||
    payload.customLateFeeFlatAmount !== null ||
    Object.keys(payload.customOtherFeeHeads).length > 0 ||
    payload.discountAmount > 0 ||
    payload.studentTypeOverride !== null ||
    payload.transportAppliesOverride !== null;

  if (!hasOverrideField) {
    throw new Error("Provide at least one override field or discount before saving.");
  }

  const values = {
    student_id: payload.studentId,
    fee_setting_id: feeSetting.id as string,
    custom_tuition_fee_amount: payload.customTuitionFeeAmount,
    custom_transport_fee_amount: payload.customTransportFeeAmount,
    custom_books_fee_amount: payload.customBooksFeeAmount,
    custom_admission_activity_misc_fee_amount: payload.customAdmissionActivityMiscFeeAmount,
    custom_other_fee_heads: payload.customOtherFeeHeads,
    custom_late_fee_flat_amount: payload.customLateFeeFlatAmount,
    discount_amount: payload.discountAmount,
    student_type_override: payload.studentTypeOverride,
    transport_applies_override: payload.transportAppliesOverride,
    reason: payload.reason,
    notes: payload.notes,
    is_active: true,
  };

  const { data: existing, error: existingError } = await supabase
    .from("student_fee_overrides")
    .select("id")
    .eq("student_id", payload.studentId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("student_fee_overrides")
      .update(values)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("student_fee_overrides")
    .insert(values)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}
