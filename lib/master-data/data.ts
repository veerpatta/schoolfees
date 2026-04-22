import "server-only";

import type { ClassStatus, PaymentMode } from "@/lib/db/types";
import { formatPaymentModeLabel, normalizeFeeHeadId } from "@/lib/config/fee-rules";
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
  installment_schedule: unknown;
  late_fee_flat_amount: number;
  custom_fee_heads: unknown;
  accepted_payment_modes: PaymentMode[];
  receipt_prefix: string;
  notes: string | null;
};

type FeeHeadDefinition = {
  id: string;
  label: string;
  isActive: boolean;
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

function parseFeeHeads(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as FeeHeadDefinition[];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const rawLabel = typeof record.label === "string" ? record.label : "";
      const label = rawLabel.trim();

      if (!label) {
        return null;
      }

      const rawId = typeof record.id === "string" ? record.id : label;
      const id = normalizeFeeHeadId(rawId);

      if (!id || seen.has(id)) {
        return null;
      }

      seen.add(id);

      return {
        id,
        label,
        isActive: record.isActive !== false,
      } satisfies FeeHeadDefinition;
    })
    .filter((entry): entry is FeeHeadDefinition => Boolean(entry));
}

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
    late_fee_flat_amount: policy.late_fee_flat_amount,
    custom_fee_heads: (payload.customFeeHeads ?? parseFeeHeads(policy.custom_fee_heads)).map((item) => ({
      id: item.id,
      label: item.label,
      isActive: item.isActive,
    })),
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
  const { count, error } = await supabase
    .from("classes")
    .select("id", { head: true, count: "exact" })
    .eq("session_label", sessionLabel);

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error("This session is in use by classes and cannot be deleted.");
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
    customFeeHeads: [...feeHeads, { id, label: normalizedLabel, isActive: true }],
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
