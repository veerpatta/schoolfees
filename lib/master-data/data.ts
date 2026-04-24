import "server-only";

import type { ClassStatus, PaymentMode } from "@/lib/db/types";
import {
  formatPaymentModeLabel,
  normalizeFeeHeadId,
  parseAcademicSessionLabel,
} from "@/lib/config/fee-rules";
import {
  DEFAULT_FEE_HEAD_METADATA,
  parseFeeHeadCatalog,
  serializeFeeHeadDefinition,
} from "@/lib/fees/fee-heads";
import type { FeeHeadDefinition } from "@/lib/fees/types";
import { createClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  session_label: string;
  status: ClassStatus;
  is_current: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number;
  status: ClassStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RouteRow = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PolicyRow = {
  id: string;
  academic_session_label: string;
  calculation_model?: "standard" | "workbook_v1";
  installment_schedule: unknown;
  new_student_academic_fee_amount?: number;
  old_student_academic_fee_amount?: number;
  late_fee_flat_amount: number;
  custom_fee_heads: unknown;
  accepted_payment_modes: PaymentMode[];
  receipt_prefix: string;
  notes: string | null;
  is_active?: boolean;
};

export type MasterClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type MasterRouteOption = {
  id: string;
  label: string;
  routeCode: string | null;
  isActive: boolean;
};

export type MasterDataOptions = {
  currentSessionLabel: string | null;
  classOptions: MasterClassOption[];
  routeOptions: MasterRouteOption[];
  feeHeads: FeeHeadDefinition[];
  paymentModes: Array<{ value: PaymentMode; label: string; isActive: boolean }>;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function assertValidAcademicSessionLabel(sessionLabel: string) {
  parseAcademicSessionLabel(sessionLabel);
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

const parseFeeHeads = parseFeeHeadCatalog;

function dedupeModes(value: PaymentMode[]) {
  return Array.from(new Set(value));
}

async function getCurrentSessionLabel() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("session_label")
    .eq("is_current", true)
    .eq("status", "active")
    .maybeSingle();

  if (!error && data?.session_label) {
    return data.session_label as string;
  }

  const { data: policy, error: policyError } = await supabase
    .from("fee_policy_configs")
    .select("academic_session_label")
    .eq("is_active", true)
    .maybeSingle();

  if (policyError) {
    return null;
  }

  return normalizeText(policy?.academic_session_label) || null;
}

async function getActivePolicy() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_policy_configs")
    .select(
      "id, academic_session_label, installment_schedule, late_fee_flat_amount, custom_fee_heads, accepted_payment_modes, receipt_prefix, notes",
    )
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Active fee policy is missing.");
  }

  return data as PolicyRow;
}

async function saveActivePolicy(policy: PolicyRow, payload: {
  academicSessionLabel?: string;
  customFeeHeads?: FeeHeadDefinition[];
  acceptedPaymentModes?: PaymentMode[];
}) {
  const supabase = await createClient();
  const values = {
    academic_session_label: payload.academicSessionLabel ?? policy.academic_session_label,
    installment_schedule: policy.installment_schedule,
    calculation_model: policy.calculation_model ?? "workbook_v1",
    new_student_academic_fee_amount: policy.new_student_academic_fee_amount ?? 1100,
    old_student_academic_fee_amount: policy.old_student_academic_fee_amount ?? 500,
    late_fee_flat_amount: policy.late_fee_flat_amount,
    custom_fee_heads: (payload.customFeeHeads ?? parseFeeHeads(policy.custom_fee_heads)).map(
      (item) => serializeFeeHeadDefinition(item),
    ),
    accepted_payment_modes:
      payload.acceptedPaymentModes ?? dedupeModes(policy.accepted_payment_modes ?? []),
    receipt_prefix: policy.receipt_prefix,
    notes: policy.notes,
    is_active: true,
  };

  const { error } = await supabase
    .from("fee_policy_configs")
    .update(values)
    .eq("id", policy.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureSessionNotReferenced(sessionLabel: string) {
  const supabase = await createClient();
  const [
    { data: classRows, count: classCount, error: classError },
    { count: policyCount, error: policyError },
  ] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id", { count: "exact" })
        .eq("session_label", sessionLabel),
      supabase
        .from("fee_policy_configs")
        .select("id", { head: true, count: "exact" })
        .eq("academic_session_label", sessionLabel),
    ]);

  if (classError) {
    throw new Error(classError.message);
  }

  if (policyError) {
    throw new Error(policyError.message);
  }

  if ((policyCount ?? 0) > 0) {
    throw new Error(
      "This session already has saved fee-policy snapshots and cannot be deleted. Archive it instead.",
    );
  }

  const classIds = ((classRows ?? []) as Array<{ id: string }>).map((row) => row.id);

  if ((classCount ?? 0) === 0 || classIds.length === 0) {
    return;
  }

  const [
    { data: studentRows, count: studentCount, error: studentError },
    { data: installmentRows, count: installmentCount, error: installmentError },
    { count: classDefaultCount, error: classDefaultError },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact" })
      .in("class_id", classIds),
    supabase
      .from("installments")
      .select("id", { count: "exact" })
      .in("class_id", classIds),
    supabase
      .from("fee_settings")
      .select("id", { head: true, count: "exact" })
      .in("class_id", classIds),
  ]);

  if (studentError) {
    throw new Error(studentError.message);
  }

  if (installmentError) {
    throw new Error(installmentError.message);
  }

  if (classDefaultError) {
    throw new Error(classDefaultError.message);
  }

  const studentIds = ((studentRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  const installmentIds = ((installmentRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  const receiptCountResult =
    studentIds.length > 0
      ? await supabase
          .from("receipts")
          .select("id", { head: true, count: "exact" })
          .in("student_id", studentIds)
      : { count: 0, error: null };
  const paymentCountResult =
    installmentIds.length > 0
      ? await supabase
          .from("payments")
          .select("id", { head: true, count: "exact" })
          .in("installment_id", installmentIds)
      : { count: 0, error: null };

  if (receiptCountResult.error) {
    throw new Error(receiptCountResult.error.message);
  }

  if (paymentCountResult.error) {
    throw new Error(paymentCountResult.error.message);
  }

  if (
    (classCount ?? 0) > 0 ||
    (classDefaultCount ?? 0) > 0 ||
    (studentCount ?? 0) > 0 ||
    (installmentCount ?? 0) > 0 ||
    (receiptCountResult.count ?? 0) > 0 ||
    (paymentCountResult.count ?? 0) > 0
  ) {
    throw new Error(
      "This session has saved setup, student, installment, receipt, or payment history and cannot be deleted. Archive it instead.",
    );
  }
}

async function ensureClassNotReferenced(classId: string) {
  const supabase = await createClient();

  const [{ count: studentCount, error: studentError }, { count: installmentCount, error: installmentError }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id", { head: true, count: "exact" })
        .eq("class_id", classId),
      supabase
        .from("installments")
        .select("id", { head: true, count: "exact" })
        .eq("class_id", classId),
    ]);

  if (studentError) {
    throw new Error(studentError.message);
  }

  if (installmentError) {
    throw new Error(installmentError.message);
  }

  if ((studentCount ?? 0) > 0 || (installmentCount ?? 0) > 0) {
    throw new Error(
      "This class is referenced by students or installments and cannot be deleted.",
    );
  }
}

async function ensureRouteNotReferenced(routeId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("students")
    .select("id", { head: true, count: "exact" })
    .eq("transport_route_id", routeId);

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error("This route is mapped to students and cannot be deleted.");
  }
}

async function ensureFeeHeadNotReferenced(headId: string) {
  const supabase = await createClient();
  const [schoolDefaults, classDefaults, studentOverrides] = await Promise.all([
    supabase
      .from("school_fee_defaults")
      .select("id, other_fee_heads")
      .eq("is_active", true),
    supabase
      .from("fee_settings")
      .select("id, other_fee_heads")
      .eq("is_active", true),
    supabase
      .from("student_fee_overrides")
      .select("id, custom_other_fee_heads")
      .eq("is_active", true),
  ]);

  if (schoolDefaults.error || classDefaults.error || studentOverrides.error) {
    throw new Error(
      schoolDefaults.error?.message ||
        classDefaults.error?.message ||
        studentOverrides.error?.message ||
        "Unable to validate fee head usage.",
    );
  }

  const usedInSchoolDefaults = (schoolDefaults.data ?? []).some((row) => {
    const map = row.other_fee_heads as Record<string, unknown> | null;
    return typeof map?.[headId] === "number" && Number(map[headId]) > 0;
  });

  const usedInClassDefaults = (classDefaults.data ?? []).some((row) => {
    const map = row.other_fee_heads as Record<string, unknown> | null;
    return typeof map?.[headId] === "number" && Number(map[headId]) > 0;
  });

  const usedInOverrides = (studentOverrides.data ?? []).some((row) => {
    const map = row.custom_other_fee_heads as Record<string, unknown> | null;
    return typeof map?.[headId] === "number" && Number(map[headId]) > 0;
  });

  if (usedInSchoolDefaults || usedInClassDefaults || usedInOverrides) {
    throw new Error(
      "This fee head is already used in defaults or overrides and cannot be removed.",
    );
  }
}

export async function getMasterDataOptions(): Promise<MasterDataOptions> {
  const supabase = await createClient();
  const currentSessionLabel = await getCurrentSessionLabel();

  const classQuery = supabase
    .from("classes")
    .select("id, session_label, class_name, section, stream_name, sort_order, status")
    .eq("status", "active")
    .order("session_label", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("class_name", { ascending: true });

  const [
    { data: classRowsRaw, error: classError },
    { data: routeRowsRaw, error: routeError },
    { data: policyRaw, error: policyError },
  ] =
    await Promise.all([
      classQuery,
      supabase
        .from("transport_routes")
        .select("id, route_code, route_name, is_active")
        .order("is_active", { ascending: false })
        .order("route_name", { ascending: true }),
      supabase
        .from("fee_policy_configs")
        .select(
          "id, academic_session_label, installment_schedule, late_fee_flat_amount, custom_fee_heads, accepted_payment_modes, receipt_prefix, notes",
        )
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (classError) {
    throw new Error(classError.message);
  }

  if (routeError) {
    throw new Error(routeError.message);
  }

  if (policyError && !policyError.message.includes("0 rows")) {
    throw new Error(policyError.message);
  }

  const policy = (policyRaw as PolicyRow | null) ?? null;
  const feeHeads = parseFeeHeads(policy?.custom_fee_heads ?? []);
  const acceptedModes = new Set(policy?.accepted_payment_modes ?? ["cash", "upi", "bank_transfer", "cheque"]);

  return {
    currentSessionLabel,
    classOptions: ((classRowsRaw ?? []) as Array<Pick<ClassRow, "id" | "session_label" | "class_name" | "section" | "stream_name">>).map(
      (row) => ({
        id: row.id,
        label: buildClassLabel(row),
        sessionLabel: row.session_label,
      }),
    ),
    routeOptions: ((routeRowsRaw ?? []) as Array<Pick<RouteRow, "id" | "route_code" | "route_name" | "is_active">>).map((row) => ({
      id: row.id,
      label: row.route_name,
      routeCode: row.route_code,
      isActive: row.is_active,
    })),
    feeHeads,
    paymentModes: (["cash", "upi", "bank_transfer", "cheque"] as PaymentMode[]).map((mode) => ({
      value: mode,
      label: formatPaymentModeLabel(mode),
      isActive: acceptedModes.has(mode),
    })),
  };
}

export async function getMasterDataPageData() {
  const supabase = await createClient();
  const [{ data: sessionsRaw, error: sessionsError }, { data: classesRaw, error: classesError }, { data: routesRaw, error: routesError }, options] =
    await Promise.all([
      supabase
        .from("academic_sessions")
        .select("id, session_label, status, is_current, notes, created_at, updated_at")
        .order("is_current", { ascending: false })
        .order("session_label", { ascending: false }),
      supabase
        .from("classes")
        .select(
          "id, session_label, class_name, section, stream_name, sort_order, status, notes, created_at, updated_at",
        )
        .order("session_label", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("class_name", { ascending: true }),
      supabase
        .from("transport_routes")
        .select(
          "id, route_code, route_name, default_installment_amount, is_active, notes, created_at, updated_at",
        )
        .order("is_active", { ascending: false })
        .order("route_name", { ascending: true }),
      getMasterDataOptions(),
    ]);

  if (sessionsError) {
    throw new Error(`Unable to load academic sessions: ${sessionsError.message}`);
  }

  if (classesError) {
    throw new Error(`Unable to load classes: ${classesError.message}`);
  }

  if (routesError) {
    throw new Error(`Unable to load routes: ${routesError.message}`);
  }

  return {
    sessions: (sessionsRaw ?? []) as SessionRow[],
    classes: (classesRaw ?? []) as ClassRow[],
    routes: (routesRaw ?? []) as RouteRow[],
    currentSessionLabel: options.currentSessionLabel,
    feeHeads: options.feeHeads,
    paymentModes: options.paymentModes,
  };
}

export async function createAcademicSession(payload: {
  sessionLabel: string;
  status: ClassStatus;
  isCurrent: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const label = normalizeText(payload.sessionLabel);

  if (!label) {
    throw new Error("Session label is required.");
  }

  assertValidAcademicSessionLabel(label);

  const { count, error: duplicateError } = await supabase
    .from("academic_sessions")
    .select("id", { head: true, count: "exact" })
    .ilike("session_label", label);

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error("Session label already exists.");
  }

  const { error } = await supabase.from("academic_sessions").insert({
    session_label: label,
    status: payload.status,
    is_current: payload.isCurrent,
    notes: normalizeText(payload.notes) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateAcademicSession(payload: {
  id: string;
  sessionLabel: string;
  status: ClassStatus;
  isCurrent: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const label = normalizeText(payload.sessionLabel);

  if (!label) {
    throw new Error("Session label is required.");
  }

  assertValidAcademicSessionLabel(label);

  const { data: existing, error: existingError } = await supabase
    .from("academic_sessions")
    .select("id, session_label")
    .eq("id", payload.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error("Academic session not found.");
  }

  if (normalizeKey(existing.session_label) !== normalizeKey(label)) {
    const { count, error: duplicateError } = await supabase
      .from("academic_sessions")
      .select("id", { head: true, count: "exact" })
      .ilike("session_label", label);

    if (duplicateError) {
      throw new Error(duplicateError.message);
    }

    if ((count ?? 0) > 0) {
      throw new Error("Session label already exists.");
    }

    const { error: classUpdateError } = await supabase
      .from("classes")
      .update({ session_label: label })
      .eq("session_label", existing.session_label);

    if (classUpdateError) {
      throw new Error(classUpdateError.message);
    }

    const { data: policy, error: policyError } = await supabase
      .from("fee_policy_configs")
      .select("id, academic_session_label")
      .eq("is_active", true)
      .maybeSingle();

    if (!policyError && policy && normalizeKey(policy.academic_session_label) === normalizeKey(existing.session_label)) {
      const { error: policyUpdateError } = await supabase
        .from("fee_policy_configs")
        .update({ academic_session_label: label })
        .eq("id", policy.id as string);

      if (policyUpdateError) {
        throw new Error(policyUpdateError.message);
      }
    }
  }

  const { error } = await supabase
    .from("academic_sessions")
    .update({
      session_label: label,
      status: payload.status,
      is_current: payload.isCurrent,
      notes: normalizeText(payload.notes) || null,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAcademicSession(sessionId: string) {
  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("academic_sessions")
    .select("id, session_label, is_current")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    throw new Error("Academic session not found.");
  }

  if (session.is_current) {
    throw new Error("Current session cannot be deleted. Mark another session current first.");
  }

  await ensureSessionNotReferenced(session.session_label as string);

  const { error } = await supabase.from("academic_sessions").delete().eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function copyAcademicSessionSetup(payload: {
  sourceSessionLabel: string;
  targetSessionLabel: string;
}) {
  const supabase = await createClient();
  const sourceSessionLabel = normalizeText(payload.sourceSessionLabel);
  const targetSessionLabel = normalizeText(payload.targetSessionLabel);

  if (!sourceSessionLabel || !targetSessionLabel) {
    throw new Error("Source and target session labels are required.");
  }

  assertValidAcademicSessionLabel(sourceSessionLabel);
  assertValidAcademicSessionLabel(targetSessionLabel);

  if (normalizeKey(sourceSessionLabel) === normalizeKey(targetSessionLabel)) {
    throw new Error("Choose a different target session label.");
  }

  const { data: existingSession, error: existingSessionError } = await supabase
    .from("academic_sessions")
    .select("id")
    .ilike("session_label", targetSessionLabel)
    .maybeSingle();

  if (existingSessionError) {
    throw new Error(existingSessionError.message);
  }

  if (existingSession?.id) {
    throw new Error("Target session already exists.");
  }

  const [
    { data: sourcePolicyRaw, error: sourcePolicyError },
    { data: sourceClassesRaw, error: sourceClassesError },
  ] = await Promise.all([
    supabase
      .from("fee_policy_configs")
      .select(
        "id, academic_session_label, calculation_model, installment_schedule, new_student_academic_fee_amount, old_student_academic_fee_amount, late_fee_flat_amount, custom_fee_heads, accepted_payment_modes, receipt_prefix, notes, is_active",
      )
      .eq("academic_session_label", sourceSessionLabel)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("classes")
      .select(
        "id, session_label, class_name, section, stream_name, sort_order, status, notes",
      )
      .eq("session_label", sourceSessionLabel)
      .order("sort_order", { ascending: true })
      .order("class_name", { ascending: true }),
  ]);

  if (sourcePolicyError) {
    throw new Error(sourcePolicyError.message);
  }

  if (sourceClassesError) {
    throw new Error(sourceClassesError.message);
  }

  const sourcePolicy = (sourcePolicyRaw as PolicyRow | null) ?? null;
  const sourceClasses = (sourceClassesRaw ?? []) as Array<
    Pick<
      ClassRow,
      "id" | "session_label" | "class_name" | "section" | "stream_name" | "sort_order" | "status" | "notes"
    >
  >;

  const { data: insertedSession, error: insertSessionError } = await supabase
    .from("academic_sessions")
    .insert({
      session_label: targetSessionLabel,
      status: "active",
      is_current: false,
      notes: `Copied from ${sourceSessionLabel}.`,
    })
    .select("id")
    .single();

  if (insertSessionError || !insertedSession?.id) {
    throw new Error(insertSessionError?.message ?? "Unable to create the copied session.");
  }

  if (sourcePolicy) {
    const { error: copyPolicyError } = await supabase.from("fee_policy_configs").insert({
      academic_session_label: targetSessionLabel,
      calculation_model: sourcePolicy.calculation_model ?? "workbook_v1",
      installment_schedule: sourcePolicy.installment_schedule,
      new_student_academic_fee_amount:
        sourcePolicy.new_student_academic_fee_amount ?? 1100,
      old_student_academic_fee_amount:
        sourcePolicy.old_student_academic_fee_amount ?? 500,
      late_fee_flat_amount: sourcePolicy.late_fee_flat_amount,
      custom_fee_heads: sourcePolicy.custom_fee_heads,
      accepted_payment_modes: sourcePolicy.accepted_payment_modes,
      receipt_prefix: sourcePolicy.receipt_prefix,
      notes: sourcePolicy.notes,
      is_active: false,
    });

    if (copyPolicyError) {
      throw new Error(copyPolicyError.message);
    }
  }

  if (sourceClasses.length === 0) {
    return;
  }

  const { data: insertedClassesRaw, error: insertClassesError } = await supabase
    .from("classes")
    .insert(
      sourceClasses.map((row) => ({
        session_label: targetSessionLabel,
        class_name: row.class_name,
        section: row.section,
        stream_name: row.stream_name,
        sort_order: row.sort_order,
        status: row.status,
        notes: row.notes,
      })),
    )
    .select("id, class_name, section, stream_name");

  if (insertClassesError) {
    throw new Error(insertClassesError.message);
  }

  const insertedClasses = (insertedClassesRaw ?? []) as Array<{
    id: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
  }>;
  const classIdByKey = new Map(
    insertedClasses.map((row) => [
      `${normalizeKey(row.class_name)}|${normalizeKey(row.section)}|${normalizeKey(row.stream_name)}`,
      row.id,
    ]),
  );
  const sourceClassIds = sourceClasses.map((row) => row.id);

  const { data: sourceDefaultsRaw, error: sourceDefaultsError } = await supabase
    .from("fee_settings")
    .select(
      "class_id, annual_base_amount, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, student_type_default, transport_applies_default, notes, is_active",
    )
    .in("class_id", sourceClassIds)
    .eq("is_active", true);

  if (sourceDefaultsError) {
    throw new Error(sourceDefaultsError.message);
  }

  const sourceDefaults = (sourceDefaultsRaw ?? []) as Array<{
    class_id: string;
    annual_base_amount: number;
    tuition_fee_amount: number;
    transport_fee_amount: number;
    books_fee_amount: number;
    admission_activity_misc_fee_amount: number;
    other_fee_heads: Record<string, unknown> | null;
    student_type_default: "new" | "existing";
    transport_applies_default: boolean;
    notes: string | null;
    is_active: boolean;
  }>;
  const sourceClassById = new Map(sourceClasses.map((row) => [row.id, row]));
  const nextDefaults = sourceDefaults
    .map((row) => {
      const sourceClass = sourceClassById.get(row.class_id);

      if (!sourceClass) {
        return null;
      }

      const targetClassId = classIdByKey.get(
        `${normalizeKey(sourceClass.class_name)}|${normalizeKey(sourceClass.section)}|${normalizeKey(sourceClass.stream_name)}`,
      );

      if (!targetClassId) {
        return null;
      }

      return {
        class_id: targetClassId,
        annual_base_amount: row.annual_base_amount,
        tuition_fee_amount: row.tuition_fee_amount,
        transport_fee_amount: row.transport_fee_amount,
        books_fee_amount: row.books_fee_amount,
        admission_activity_misc_fee_amount: row.admission_activity_misc_fee_amount,
        other_fee_heads: row.other_fee_heads ?? {},
        student_type_default: row.student_type_default,
        transport_applies_default: row.transport_applies_default,
        notes: row.notes,
        is_active: row.is_active,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (nextDefaults.length === 0) {
    return;
  }

  const { error: copyDefaultsError } = await supabase.from("fee_settings").insert(nextDefaults);

  if (copyDefaultsError) {
    throw new Error(copyDefaultsError.message);
  }
}

export async function createClass(payload: {
  sessionLabel: string;
  className: string;
  section: string | null;
  streamName: string | null;
  sortOrder: number;
  status: ClassStatus;
  notes: string | null;
}) {
  const supabase = await createClient();
  const sessionLabel = normalizeText(payload.sessionLabel);
  const className = normalizeText(payload.className);
  const section = normalizeText(payload.section) || null;
  const streamName = normalizeText(payload.streamName) || null;

  if (!sessionLabel || !className) {
    throw new Error("Session and class name are required.");
  }

  const { data: session, error: sessionError } = await supabase
    .from("academic_sessions")
    .select("id")
    .eq("session_label", sessionLabel)
    .eq("status", "active")
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    throw new Error("Select an active academic session for this class.");
  }

  const { data: classRows, error: duplicateError } = await supabase
    .from("classes")
    .select("id, class_name, section, stream_name")
    .eq("session_label", sessionLabel)
    .eq("status", "active");

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  const duplicate = (classRows ?? []).some((row) => {
    const current = row as {
      class_name: string;
      section: string | null;
      stream_name: string | null;
    };

    return (
      normalizeKey(current.class_name) === normalizeKey(className) &&
      normalizeKey(current.section) === normalizeKey(section) &&
      normalizeKey(current.stream_name) === normalizeKey(streamName)
    );
  });

  if (duplicate) {
    throw new Error("Duplicate class name is not allowed in the same active session.");
  }

  const { error } = await supabase.from("classes").insert({
    session_label: sessionLabel,
    class_name: className,
    section,
    stream_name: streamName,
    sort_order: payload.sortOrder,
    status: payload.status,
    notes: normalizeText(payload.notes) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateClass(payload: {
  id: string;
  sessionLabel: string;
  className: string;
  section: string | null;
  streamName: string | null;
  sortOrder: number;
  status: ClassStatus;
  notes: string | null;
}) {
  const supabase = await createClient();
  const sessionLabel = normalizeText(payload.sessionLabel);
  const className = normalizeText(payload.className);
  const section = normalizeText(payload.section) || null;
  const streamName = normalizeText(payload.streamName) || null;

  if (!sessionLabel || !className) {
    throw new Error("Session and class name are required.");
  }

  const { data: classRows, error: duplicateError } = await supabase
    .from("classes")
    .select("id, class_name, section, stream_name")
    .eq("session_label", sessionLabel)
    .eq("status", "active")
    .neq("id", payload.id);

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  const duplicate = (classRows ?? []).some((row) => {
    const current = row as {
      class_name: string;
      section: string | null;
      stream_name: string | null;
    };

    return (
      normalizeKey(current.class_name) === normalizeKey(className) &&
      normalizeKey(current.section) === normalizeKey(section) &&
      normalizeKey(current.stream_name) === normalizeKey(streamName)
    );
  });

  if (duplicate) {
    throw new Error("Duplicate class name is not allowed in the same active session.");
  }

  const { error } = await supabase
    .from("classes")
    .update({
      session_label: sessionLabel,
      class_name: className,
      section,
      stream_name: streamName,
      sort_order: payload.sortOrder,
      status: payload.status,
      notes: normalizeText(payload.notes) || null,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteClass(classId: string) {
  await ensureClassNotReferenced(classId);

  const supabase = await createClient();
  const { error } = await supabase.from("classes").delete().eq("id", classId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createRoute(payload: {
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  isActive: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const routeCode = normalizeText(payload.routeCode) || null;
  const routeName = normalizeText(payload.routeName);

  if (!routeName) {
    throw new Error("Route name is required.");
  }

  const { count, error: duplicateError } = await supabase
    .from("transport_routes")
    .select("id", { head: true, count: "exact" })
    .eq("is_active", true)
    .ilike("route_name", routeName);

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error("Duplicate active route name is not allowed.");
  }

  const { error } = await supabase.from("transport_routes").insert({
    route_code: routeCode,
    route_name: routeName,
    default_installment_amount: payload.defaultInstallmentAmount,
    is_active: payload.isActive,
    notes: normalizeText(payload.notes) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateRoute(payload: {
  id: string;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  isActive: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const routeCode = normalizeText(payload.routeCode) || null;
  const routeName = normalizeText(payload.routeName);

  if (!routeName) {
    throw new Error("Route name is required.");
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("transport_routes")
    .select("id")
    .eq("is_active", true)
    .ilike("route_name", routeName)
    .neq("id", payload.id)
    .maybeSingle();

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  if (duplicate) {
    throw new Error("Duplicate active route name is not allowed.");
  }

  const { error } = await supabase
    .from("transport_routes")
    .update({
      route_code: routeCode,
      route_name: routeName,
      default_installment_amount: payload.defaultInstallmentAmount,
      is_active: payload.isActive,
      notes: normalizeText(payload.notes) || null,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteRoute(routeId: string) {
  await ensureRouteNotReferenced(routeId);

  const supabase = await createClient();
  const { error } = await supabase.from("transport_routes").delete().eq("id", routeId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createFeeHead(label: string) {
  const policy = await getActivePolicy();
  const feeHeads = parseFeeHeads(policy.custom_fee_heads);
  const normalizedLabel = normalizeText(label);

  if (!normalizedLabel) {
    throw new Error("Fee head label is required.");
  }

  const id = normalizeFeeHeadId(normalizedLabel);

  if (!id) {
    throw new Error("Fee head label is invalid.");
  }

  if (feeHeads.some((item) => item.id === id || normalizeKey(item.label) === normalizeKey(normalizedLabel))) {
    throw new Error("Fee head already exists.");
  }

  await saveActivePolicy(policy, {
    customFeeHeads: [
      ...feeHeads,
      {
        id,
        label: normalizedLabel,
        amount: 0,
        applicationType: "annual_fixed",
        ...DEFAULT_FEE_HEAD_METADATA,
        isActive: true,
        notes: null,
      },
    ],
  });
}

export async function updateFeeHead(payload: {
  id: string;
  label: string;
  isActive: boolean;
}) {
  const policy = await getActivePolicy();
  const feeHeads = parseFeeHeads(policy.custom_fee_heads);
  const normalizedLabel = normalizeText(payload.label);

  if (!normalizedLabel) {
    throw new Error("Fee head label is required.");
  }

  const duplicate = feeHeads.find(
    (item) => item.id !== payload.id && normalizeKey(item.label) === normalizeKey(normalizedLabel),
  );

  if (duplicate) {
    throw new Error("Fee head label already exists.");
  }

  const updated = feeHeads.map((item) =>
    item.id === payload.id ? { ...item, label: normalizedLabel, isActive: payload.isActive } : item,
  );

  await saveActivePolicy(policy, { customFeeHeads: updated });
}

export async function deleteFeeHead(feeHeadId: string) {
  await ensureFeeHeadNotReferenced(feeHeadId);

  const policy = await getActivePolicy();
  const feeHeads = parseFeeHeads(policy.custom_fee_heads);
  const existing = feeHeads.find((item) => item.id === feeHeadId);

  if (!existing) {
    throw new Error("Fee head not found.");
  }

  await saveActivePolicy(policy, {
    customFeeHeads: feeHeads.filter((item) => item.id !== feeHeadId),
  });
}

export async function setPaymentModeActive(payload: {
  paymentMode: PaymentMode;
  isActive: boolean;
}) {
  const policy = await getActivePolicy();
  const currentModes = dedupeModes(policy.accepted_payment_modes ?? []);

  let nextModes = currentModes;

  if (payload.isActive && !currentModes.includes(payload.paymentMode)) {
    nextModes = [...currentModes, payload.paymentMode];
  }

  if (!payload.isActive && currentModes.includes(payload.paymentMode)) {
    nextModes = currentModes.filter((mode) => mode !== payload.paymentMode);
  }

  if (nextModes.length === 0) {
    throw new Error("At least one payment mode must remain active.");
  }

  await saveActivePolicy(policy, { acceptedPaymentModes: nextModes });
}
