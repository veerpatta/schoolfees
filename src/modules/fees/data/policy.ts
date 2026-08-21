import { FEE_ADMINISTERED_STATUSES } from "@/modules/students/domain/populations";
import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/platform/supabase/admin";
import { getMasterDataOptions } from "@/modules/master-data/data/queries";
import { createClient } from "@/platform/supabase/server";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/platform/supabase/cache-safe";
import { getOptionalEnvVar, hasRequiredEnvVars } from "@/platform/env";
import { getActiveSessionLabel } from "@/platform/session/active";
import { setActiveSessionLabel } from "@/platform/session/set-active";
import { getDisplayInstallmentLabel } from "@/modules/prev-year-dues/domain/display";
import type { PaymentMode } from "@/platform/db/types";
import { buildDefaultFeePolicySummary } from "@/platform/config/fee-rules";
import { getConventionalDiscountPolicies, getStudentConventionalDiscountAssignments } from "@/modules/fees/data/conventional-discounts";
import type { ClassFeeDefault, FeeHeadDefinition, FeePolicySnapshot, FeePolicySummary, FeeSetupPageData, SchoolFeeDefault, StudentFeeOverride, StudentFinancialSnapshot, TransportDefault } from "@/modules/fees/domain/types";
import { resolveStudentPolicyBreakdown } from "@/modules/fees/domain/policy-resolution";
import { buildClassLabel, buildOtherFeeHeadLabelPayload, buildOtherFeeHeadPayload, buildPolicyPayload, buildStudentOptions, calculateAnnualTotal, createEmptySchoolDefault, normalizeCatalog, parseCustomAmountMap, parseCustomLabelMap, snapshotToSummary, stripMissingOverrideColumn, toFeePolicySummary, toSingleRecord, toWholeNumber } from "@/modules/fees/domain/policy-shaping";
import {
  ClassRow,
  FeeSettingRow,
  GlobalPolicyRow,
  InstallmentBalanceRow,
  RouteRow,
  SchoolDefaultRow,
  StudentOverrideRow,
  StudentRow,
} from "@/modules/fees/domain/policy-rows";

// Re-exported: the resolution rule moved to domain/ so it can be read and
// tested without a database, but every existing call site still points here.
export { resolveStudentPolicyBreakdown } from "@/modules/fees/domain/policy-resolution";

type ReadClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

async function loadFeePolicySnapshots(useAdmin = false): Promise<FeePolicySnapshot[]> {
  const defaults = buildDefaultFeePolicySummary();
  const supabase = await getReadClient(useAdmin);

  if (!supabase) {
    return [
      {
        id: null,
        ...defaults,
        isActive: true,
        updatedAt: null,
      },
    ];
  }

  const activeSessionLabel = await getActiveSessionLabel();
  const { data, error } = await supabase
    .from("fee_policy_configs")
    .select(
      "id, academic_session_label, calculation_model, installment_schedule, late_fee_flat_amount, new_student_academic_fee_amount, old_student_academic_fee_amount, academic_fee_distribution, custom_fee_heads, accepted_payment_modes, receipt_prefix, notes, is_active, updated_at",
    )
    .order("academic_session_label", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return [
      {
        id: null,
        ...defaults,
        isActive: true,
        updatedAt: null,
      },
    ];
  }

  const seen = new Set<string>();

  return (data as GlobalPolicyRow[])
    .map((row) => toFeePolicySummary(row, defaults, activeSessionLabel))
    .filter((row) => {
      const key = row.academicSessionLabel.trim().toLowerCase();

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

async function getReadClient(useAdmin = false): Promise<ReadClient | null> {
  if (!hasRequiredEnvVars) {
    return null;
  }

  if (useAdmin && getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY")) {
    return createAdminClient();
  }

  return getCacheSafeClient();
}

async function loadPolicyForSession(
  sessionLabel: string,
  useAdmin = false,
): Promise<FeePolicySummary> {
  const snapshots = await loadFeePolicySnapshots(useAdmin);
  const normalizedSessionLabel = sessionLabel.trim().toLowerCase();
  const selected =
    snapshots.find(
      (item) => item.academicSessionLabel.trim().toLowerCase() === normalizedSessionLabel,
    ) ??
    snapshots.find((item) => item.isActive) ??
    snapshots[0];

  if (!selected) {
    const defaults = buildDefaultFeePolicySummary();
    return {
      id: null,
      ...defaults,
      academicSessionLabel: sessionLabel.trim() || defaults.academicSessionLabel,
    };
  }

  return snapshotToSummary(selected);
}

async function loadGlobalPolicy(useAdmin = false): Promise<FeePolicySummary> {
  if (!hasRequiredEnvVars) {
    return {
      id: null,
      ...buildDefaultFeePolicySummary(),
    };
  }

  return loadPolicyForSession(await getActiveSessionLabel(), useAdmin);
}

async function loadFeeCollectionsUncached(useAdmin = false) {
  // `useAdmin` matters for headless callers. Every in-app caller runs inside a
  // request with a staff session, so the cookie client passes RLS and this was
  // never noticed — but a cron, a script or an admin route has no session, so
  // fee_settings came back EMPTY and the generator skipped every student with
  // CLASS_FEE_MISSING. Silent, and it looked like a Fee Setup problem.
  const supabase = useAdmin ? createAdminClient() : await createClient();
  const studentOverridesSelectWithNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes, updated_at";
  const studentOverridesSelectWithoutNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, updated_at";

  const studentOverridesRequest = supabase
    .from("student_fee_overrides")
    .select(studentOverridesSelectWithNotes)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  const [
    { data: schoolDefaultRaw, error: schoolDefaultError },
    { data: classRowsRaw, error: classRowsError },
    { data: classDefaultsRaw, error: classDefaultsError },
    { data: routeRowsRaw, error: routeRowsError },
    { data: studentRowsRaw, error: studentRowsError },
    studentOverridesResponse,
  ] = await Promise.all([
    supabase
      .from("school_fee_defaults")
      .select(
        "id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, student_type_default, transport_applies_default, notes, updated_at",
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
        "id, class_id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, student_type_default, transport_applies_default, notes, updated_at",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("transport_routes")
      .select(
        "id, route_code, route_name, default_installment_amount, annual_fee_amount, is_active, notes, updated_at",
      )
      .order("is_active", { ascending: false })
      .order("route_name", { ascending: true }),
    supabase
      .from("students")
      .select(
        "id, full_name, admission_no, class_id, class_ref:classes(id, session_label, class_name, section, stream_name)",
      )
      .in("status", [...FEE_ADMINISTERED_STATUSES])
      .order("full_name", { ascending: true }),
    studentOverridesRequest,
  ]);

  let studentOverridesRaw =
    (studentOverridesResponse.data as StudentOverrideRow[] | null) ?? null;
  let studentOverridesError = studentOverridesResponse.error;

  if (
    studentOverridesError &&
    studentOverridesError.message.includes("student_fee_overrides.notes")
  ) {
    const fallback = await supabase
      .from("student_fee_overrides")
      .select(studentOverridesSelectWithoutNotes)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    studentOverridesRaw = (fallback.data as StudentOverrideRow[] | null) ?? null;
    studentOverridesError = fallback.error;
  }

  if (schoolDefaultError) {
    throw new Error(`Unable to load school defaults: ${schoolDefaultError.message}`);
  }

  if (classRowsError) {
    throw new Error(`Unable to load classes: ${classRowsError.message}`);
  }

  if (classDefaultsError) {
    throw new Error(`Unable to load class defaults: ${classDefaultsError.message}`);
  }

  if (routeRowsError) {
    throw new Error(`Unable to load transport defaults: ${routeRowsError.message}`);
  }

  if (studentRowsError) {
    throw new Error(`Unable to load students: ${studentRowsError.message}`);
  }

  if (studentOverridesError) {
    throw new Error(`Unable to load student overrides: ${studentOverridesError.message}`);
  }

  return {
    schoolDefaultRaw: (schoolDefaultRaw as SchoolDefaultRow | null) ?? null,
    classRows: (classRowsRaw ?? []) as ClassRow[],
    classDefaultsRaw: (classDefaultsRaw ?? []) as FeeSettingRow[],
    routeRows: (routeRowsRaw ?? []) as RouteRow[],
    studentRows: (studentRowsRaw ?? []) as StudentRow[],
    studentOverridesRaw: (studentOverridesRaw ?? []) as StudentOverrideRow[],
  };
}

const getFeePolicySummaryCached = cacheSafeUnstableCache(
  async () => loadGlobalPolicy(false),
  ["fee-policy-summary"],
  { tags: ["fee-policy"], revalidate: 300 },
);

const getFeePolicySummaryForRequest = cache(async (useAdmin: boolean) => {
  if (!useAdmin) return getFeePolicySummaryCached();
  return loadGlobalPolicy(useAdmin);
});

export async function getFeePolicySummary(options: { useAdmin?: boolean } = {}) {
  return getFeePolicySummaryForRequest(Boolean(options.useAdmin));
}

/**
 * Same treatment as getFeePolicySummary above, and for the same reason.
 *
 * This ran a full unfiltered `fee_policy_configs` select on EVERY protected
 * render — React `cache` only dedupes within a single request, so switching
 * sessions paid for it twice over, once for the shell and once for the page.
 * The shell reads exactly one string out of the result (`receiptPrefix`).
 * The session label is part of the cache key, so each session keeps its own
 * entry and the `fee-policy` tag still busts all of them on publish.
 */
const getFeePolicyForSessionCached = cacheSafeUnstableCache(
  async (sessionLabel: string) => loadPolicyForSession(sessionLabel, false),
  ["fee-policy-for-session"],
  { tags: ["fee-policy"], revalidate: 300 },
);

const getFeePolicyForSessionForRequest = cache(async (sessionLabel: string, useAdmin: boolean) => {
  if (!useAdmin) return getFeePolicyForSessionCached(sessionLabel);
  return loadPolicyForSession(sessionLabel, useAdmin);
});

export async function getFeePolicyForSession(
  label: string,
  options: { useAdmin?: boolean } = {},
) {
  return getFeePolicyForSessionForRequest(label, Boolean(options.useAdmin));
}

async function loadFeeCollections(useAdmin = false) {
  return loadFeeCollectionsUncached(useAdmin);
}

export async function getFeeSetupPageData(
  options: { sessionLabel?: string; useAdmin?: boolean } = {},
): Promise<FeeSetupPageData> {
  const useAdmin = Boolean(options.useAdmin);
  const requestedSessionLabel = options.sessionLabel?.trim();
  const globalPolicy = requestedSessionLabel
    ? await loadPolicyForSession(requestedSessionLabel, useAdmin)
    : await loadGlobalPolicy(useAdmin);
  const [policySnapshotsRaw, collections, masterOptions] = await Promise.all([
    loadFeePolicySnapshots(useAdmin),
    loadFeeCollections(useAdmin),
    getMasterDataOptions(useAdmin),
  ]);
  const [conventionalDiscountPolicies, conventionalDiscountAssignments] = await Promise.all([
    getConventionalDiscountPolicies(globalPolicy.academicSessionLabel, useAdmin),
    getStudentConventionalDiscountAssignments({
      academicSessionLabel: globalPolicy.academicSessionLabel,
      studentIds: collections.studentRows.map((row) => row.id),
      useAdmin,
    }),
  ]);

  const discoveredFeeHeadIds = new Set<string>();
  const schoolCustomAmounts = parseCustomAmountMap(collections.schoolDefaultRaw?.other_fee_heads ?? null);
  Object.keys(schoolCustomAmounts).forEach((key) => discoveredFeeHeadIds.add(key));
  collections.classDefaultsRaw.forEach((row) => {
    Object.keys(parseCustomAmountMap(row.other_fee_heads)).forEach((key) =>
      discoveredFeeHeadIds.add(key),
    );
  });
  collections.studentOverridesRaw.forEach((row) => {
    Object.keys(parseCustomAmountMap(row.custom_other_fee_heads)).forEach((key) =>
      discoveredFeeHeadIds.add(key),
    );
  });

  const policySnapshots = policySnapshotsRaw.map((snapshot) => ({
    ...snapshot,
    customFeeHeads: normalizeCatalog(snapshot.customFeeHeads, discoveredFeeHeadIds),
  }));
  const activeSnapshot =
    policySnapshots.find((item) => item.isActive) ??
    policySnapshots.find((item) => item.academicSessionLabel === globalPolicy.academicSessionLabel) ??
    null;
  const customFeeHeads = normalizeCatalog(
    activeSnapshot?.customFeeHeads ?? globalPolicy.customFeeHeads,
    discoveredFeeHeadIds,
  );
  const classMap = new Map(collections.classRows.map((row) => [row.id, row]));
  const studentMap = new Map(collections.studentRows.map((row) => [row.id, row]));

  const schoolDefault = collections.schoolDefaultRaw
    ? ({
        id: collections.schoolDefaultRaw.id,
        tuitionFee: collections.schoolDefaultRaw.tuition_fee_amount,
        transportFee: collections.schoolDefaultRaw.transport_fee_amount,
        booksFee: collections.schoolDefaultRaw.books_fee_amount,
        admissionActivityMiscFee:
          collections.schoolDefaultRaw.admission_activity_misc_fee_amount,
        customFeeHeadAmounts: schoolCustomAmounts,
        studentTypeDefault: collections.schoolDefaultRaw.student_type_default,
        transportAppliesDefault:
          collections.schoolDefaultRaw.transport_applies_default,
        notes: collections.schoolDefaultRaw.notes,
        updatedAt: collections.schoolDefaultRaw.updated_at,
      } satisfies SchoolFeeDefault)
    : createEmptySchoolDefault();

  const classDefaults = collections.classDefaultsRaw.map((row) => {
    const classRef = classMap.get(row.class_id);
    const customFeeHeadAmounts = parseCustomAmountMap(row.other_fee_heads);

    return {
      id: row.id,
      classId: row.class_id,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      sessionLabel: classRef?.session_label ?? "Unknown session",
      tuitionFee: row.tuition_fee_amount,
      transportFee: row.transport_fee_amount,
      booksFee: row.books_fee_amount,
      admissionActivityMiscFee: row.admission_activity_misc_fee_amount,
      customFeeHeadAmounts,
      annualTotal: calculateAnnualTotal({
        tuitionFee: row.tuition_fee_amount,
        transportFee: row.transport_fee_amount,
        booksFee: row.books_fee_amount,
        admissionActivityMiscFee: row.admission_activity_misc_fee_amount,
        customFeeHeadAmounts,
      }),
      studentTypeDefault: row.student_type_default,
      transportAppliesDefault: row.transport_applies_default,
      notes: row.notes,
      updatedAt: row.updated_at,
    } satisfies ClassFeeDefault;
  });

  const transportDefaults = collections.routeRows.map((row) => ({
    id: row.id,
    routeCode: row.route_code,
    routeName: row.route_name,
    defaultInstallmentAmount: row.default_installment_amount,
    annualFeeAmount: row.annual_fee_amount,
    isActive: row.is_active,
    notes: row.notes,
    updatedAt: row.updated_at,
  })) satisfies TransportDefault[];

  const studentOverrides = collections.studentOverridesRaw.map((row) => {
    const studentRef = studentMap.get(row.student_id);
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
      customAdmissionActivityMiscFeeAmount:
        row.custom_admission_activity_misc_fee_amount,
      customFeeHeadAmounts: parseCustomAmountMap(row.custom_other_fee_heads),
      customOtherFeeHeadLabels: parseCustomLabelMap(row.custom_other_fee_head_labels),
      customLateFeeFlatAmount: row.custom_late_fee_flat_amount,
      otherAdjustmentHead: row.other_adjustment_head,
      otherAdjustmentAmount: row.other_adjustment_amount,
      lateFeeWaiverAmount: toWholeNumber(row.late_fee_waiver_amount),
      discountAmount: row.discount_amount,
      studentTypeOverride: row.student_type_override,
      transportAppliesOverride: row.transport_applies_override,
      reason: row.reason,
      notes: row.notes ?? null,
      updatedAt: row.updated_at,
    } satisfies StudentFeeOverride;
  });

  return {
    globalPolicy: {
      ...globalPolicy,
      customFeeHeads,
    },
    policySnapshots,
    schoolDefault,
    classDefaults,
    transportDefaults,
    studentOverrides,
    conventionalDiscountPolicies,
    conventionalDiscountAssignments,
    classOptions: masterOptions.classOptions,
    studentOptions: buildStudentOptions(collections.studentRows),
    routeOptions: masterOptions.routeOptions,
  };
}

async function syncAcademicSessionFromPolicy(sessionLabel: string) {
  const normalized = sessionLabel.trim();

  if (!normalized) {
    return;
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("academic_sessions")
    .select("id")
    .eq("session_label", normalized)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("academic_sessions")
      .update({ status: "active" })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from("academic_sessions").insert({
    session_label: normalized,
    status: "active",
    is_current: false,
    notes: "Auto-synced from fee policy",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertGlobalFeePolicy(payload: {
  academicSessionLabel: string;
  calculationModel: FeePolicySummary["calculationModel"];
  installmentSchedule: Array<{ label: string; dueDateLabel: string }>;
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  academicFeeDistribution: FeePolicySummary["academicFeeDistribution"];
  acceptedPaymentModes: PaymentMode[];
  receiptPrefix: string;
  customFeeHeads: FeeHeadDefinition[];
  notes: string | null;
  activateSession?: boolean;
}) {
  const supabase = await createClient();
  const values = buildPolicyPayload(payload);
  const shouldActivateSession = payload.activateSession ?? true;
  const { data: existing, error: existingError } = await supabase
    .from("fee_policy_configs")
    .select("id, academic_session_label, is_active")
    .eq("academic_session_label", values.academic_session_label)
    .maybeSingle();

  if (existingError && !existingError.message.includes("does not exist")) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    if (shouldActivateSession) {
      const { error: deactivatePoliciesError } = await supabase
        .from("fee_policy_configs")
        .update({ is_active: false })
        .neq("academic_session_label", values.academic_session_label);

      if (deactivatePoliciesError) {
        throw new Error(deactivatePoliciesError.message);
      }
    }

    values.is_active = shouldActivateSession ? true : Boolean(existing.is_active);

    const { error } = await supabase
      .from("fee_policy_configs")
      .update(values)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    if (shouldActivateSession) {
      await setActiveSessionLabel(values.academic_session_label);
    }

    return existing.id as string;
  }

  values.is_active = false;

  const { data, error } = await supabase
    .from("fee_policy_configs")
    .insert(values)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Unable to save global fee policy right now.");
  }

  await syncAcademicSessionFromPolicy(values.academic_session_label);
  if (shouldActivateSession) {
    const { error: deactivatePoliciesError } = await supabase
      .from("fee_policy_configs")
      .update({ is_active: false })
      .neq("academic_session_label", values.academic_session_label);

    if (deactivatePoliciesError) {
      throw new Error(deactivatePoliciesError.message);
    }

    const { error: activatePolicyError } = await supabase
      .from("fee_policy_configs")
      .update({ is_active: true })
      .eq("id", data.id);

    if (activatePolicyError) {
      throw new Error(activatePolicyError.message);
    }

    await setActiveSessionLabel(values.academic_session_label);
  }

  return data.id as string;
}

export async function upsertSchoolFeeDefaults(payload: {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  customFeeHeads: FeeHeadDefinition[];
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
    other_fee_heads: buildOtherFeeHeadPayload(
      payload.customFeeHeads,
      payload.customFeeHeadAmounts,
    ),
    student_type_default: payload.studentTypeDefault,
    transport_applies_default: payload.transportAppliesDefault,
    notes: payload.notes,
    is_active: true,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("school_fee_defaults")
      .update(values)
      .eq("id", existing.id);

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

  if (!data?.id) {
    throw new Error("Unable to save school defaults right now.");
  }

  return data.id as string;
}

export async function upsertClassFeeDefault(payload: {
  classId: string;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  customFeeHeads: FeeHeadDefinition[];
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const annualBaseAmount =
    payload.tuitionFee +
    payload.booksFee +
    payload.admissionActivityMiscFee +
    Object.values(payload.customFeeHeadAmounts).reduce((sum, value) => sum + value, 0);

  const values = {
    class_id: payload.classId,
    annual_base_amount: annualBaseAmount,
    tuition_fee_amount: payload.tuitionFee,
    transport_fee_amount: payload.transportFee,
    books_fee_amount: payload.booksFee,
    admission_activity_misc_fee_amount: payload.admissionActivityMiscFee,
    other_fee_heads: buildOtherFeeHeadPayload(
      payload.customFeeHeads,
      payload.customFeeHeadAmounts,
    ),
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
    const { error } = await supabase
      .from("fee_settings")
      .update(values)
      .eq("id", existing.id);

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

  if (!data?.id) {
    throw new Error("Unable to save class defaults right now.");
  }

  return data.id as string;
}

export async function upsertTransportDefault(payload: {
  routeId: string | null;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  annualFeeAmount: number | null;
  isActive: boolean;
  notes: string | null;
}) {
  const supabase = await createClient();
  const values = {
    route_code: payload.routeCode,
    route_name: payload.routeName,
    default_installment_amount: payload.defaultInstallmentAmount,
    annual_fee_amount: payload.annualFeeAmount,
    is_active: payload.isActive,
    notes: payload.notes,
  };

  if (payload.routeId) {
    const { error } = await supabase
      .from("transport_routes")
      .update(values)
      .eq("id", payload.routeId);

    if (error) {
      throw new Error(error.message);
    }

    return payload.routeId;
  }

  const { data, error } = await supabase
    .from("transport_routes")
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
  customFeeHeadAmounts: Record<string, number>;
  customFeeHeads: FeeHeadDefinition[];
  /**
   * Display labels for `customFeeHeadAmounts`, keyed by the same slug. Accepts
   * the raw jsonb straight off a read so callers need no parser of their own;
   * non-string and unmatched entries are dropped here.
   */
  customOtherFeeHeadLabels?: Record<string, unknown> | null;
  /** See buildOtherFeeHeadPayload — required for ad-hoc per-student heads. */
  allowUncatalogedHeads?: boolean;
  customLateFeeFlatAmount: number | null;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  lateFeeWaiverAmount: number;
  discountAmount: number;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  reason: string;
  notes: string | null;
  useAdminClient?: boolean;
}) {
  const supabase = await getReadClient(payload.useAdminClient);

  if (!supabase) {
    throw new Error("Supabase environment is not configured.");
  }
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
    (payload.otherAdjustmentAmount ?? 0) !== 0 ||
    Boolean(payload.otherAdjustmentHead?.trim()) ||
    payload.lateFeeWaiverAmount > 0 ||
    Object.keys(payload.customFeeHeadAmounts).length > 0 ||
    payload.discountAmount > 0 ||
    payload.studentTypeOverride !== null ||
    payload.transportAppliesOverride !== null;

  if (!hasOverrideField) {
    throw new Error("Provide at least one override field or discount before saving.");
  }

  const otherFeeHeadPayload = buildOtherFeeHeadPayload(
    payload.customFeeHeads,
    payload.customFeeHeadAmounts,
    payload.allowUncatalogedHeads,
  );

  const values = {
    student_id: payload.studentId,
    fee_setting_id: feeSetting.id as string,
    custom_tuition_fee_amount: payload.customTuitionFeeAmount,
    custom_transport_fee_amount: payload.customTransportFeeAmount,
    custom_books_fee_amount: payload.customBooksFeeAmount,
    custom_admission_activity_misc_fee_amount:
      payload.customAdmissionActivityMiscFeeAmount,
    custom_other_fee_heads: otherFeeHeadPayload,
    custom_other_fee_head_labels: buildOtherFeeHeadLabelPayload(
      otherFeeHeadPayload,
      payload.customOtherFeeHeadLabels,
    ),
    custom_late_fee_flat_amount: payload.customLateFeeFlatAmount,
    other_adjustment_head: payload.otherAdjustmentHead?.trim() || null,
    other_adjustment_amount: payload.otherAdjustmentAmount,
    late_fee_waiver_amount: payload.lateFeeWaiverAmount,
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
    let attempt = values as Record<string, unknown>;
    let error: { message: string } | null = null;

    // Retry once per optional column so a deploy that lands ahead of its
    // migration degrades to writing the columns that do exist.
    for (;;) {
      const result = await supabase
        .from("student_fee_overrides")
        .update(attempt)
        .eq("id", existing.id);
      error = result.error;

      const retry = error ? stripMissingOverrideColumn(attempt, error.message) : null;
      if (!retry) break;
      attempt = retry;
    }

    if (error) {
      throw new Error(error.message);
    }

    return existing.id as string;
  }

  let attempt = values as Record<string, unknown>;
  let data: { id: string } | null = null;
  let error: { message: string } | null = null;

  for (;;) {
    const result = await supabase
      .from("student_fee_overrides")
      .insert(attempt)
      .select("id")
      .single();
    data = result.data as { id: string } | null;
    error = result.error;

    const retry = error ? stripMissingOverrideColumn(attempt, error.message) : null;
    if (!retry) break;
    attempt = retry;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Unable to save student override right now.");
  }

  return data.id as string;
}

async function getStudentFeeSetupData(payload: {
  studentId: string;
  classId: string;
  transportRouteId: string | null;
  sessionLabel: string;
  classRef: ClassRow | null;
  studentRaw: { id: string; class_id: string; transport_route_id: string | null; full_name?: string; admission_no?: string };
}) {
  const supabase = await createClient();

  const studentOverridesSelectWithNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes, updated_at";
  const studentOverridesSelectWithoutNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, updated_at";

  const studentOverridesRequest = supabase
    .from("student_fee_overrides")
    .select(studentOverridesSelectWithNotes)
    .eq("student_id", payload.studentId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  const [
    policy,
    schoolDefaultResult,
    classDefaultResult,
    routeDefaultResult,
    studentOverrideResponse,
    conventionalDiscountAssignments,
  ] = await Promise.all([
    loadPolicyForSession(payload.sessionLabel),
    supabase
      .from("school_fee_defaults")
      .select(
        "id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, student_type_default, transport_applies_default, notes, updated_at",
      )
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("fee_settings")
      .select(
        "id, class_id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, student_type_default, transport_applies_default, notes, updated_at",
      )
      .eq("class_id", payload.classId)
      .eq("is_active", true)
      .maybeSingle(),
    payload.transportRouteId
      ? supabase
          .from("transport_routes")
          .select(
            "id, route_code, route_name, default_installment_amount, annual_fee_amount, is_active, notes, updated_at",
          )
          .eq("id", payload.transportRouteId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    studentOverridesRequest,
    getStudentConventionalDiscountAssignments({
      academicSessionLabel: payload.sessionLabel,
      studentIds: [payload.studentId],
    }).catch(() => []),
  ]);

  let studentOverrideRaw = studentOverrideResponse.data as StudentOverrideRow | null;
  let studentOverridesError = studentOverrideResponse.error;

  if (
    studentOverridesError &&
    studentOverridesError.message.includes("student_fee_overrides.notes")
  ) {
    const fallback = await supabase
      .from("student_fee_overrides")
      .select(studentOverridesSelectWithoutNotes)
      .eq("student_id", payload.studentId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .maybeSingle();

    studentOverrideRaw = fallback.data as StudentOverrideRow | null;
    studentOverridesError = fallback.error;
  }

  if (schoolDefaultResult.error) {
    throw new Error(`Unable to load school defaults: ${schoolDefaultResult.error.message}`);
  }
  if (classDefaultResult.error) {
    throw new Error(`Unable to load class defaults: ${classDefaultResult.error.message}`);
  }
  if (routeDefaultResult.error) {
    throw new Error(`Unable to load route defaults: ${routeDefaultResult.error.message}`);
  }
  if (studentOverridesError) {
    throw new Error(`Unable to load student overrides: ${studentOverridesError.message}`);
  }

  const schoolDefaultRaw = schoolDefaultResult.data;
  const schoolDefault = schoolDefaultRaw
    ? ({
        id: schoolDefaultRaw.id,
        tuitionFee: schoolDefaultRaw.tuition_fee_amount,
        transportFee: schoolDefaultRaw.transport_fee_amount,
        booksFee: schoolDefaultRaw.books_fee_amount,
        admissionActivityMiscFee: schoolDefaultRaw.admission_activity_misc_fee_amount,
        customFeeHeadAmounts: parseCustomAmountMap(schoolDefaultRaw.other_fee_heads),
        studentTypeDefault: schoolDefaultRaw.student_type_default,
        transportAppliesDefault: schoolDefaultRaw.transport_applies_default,
        notes: schoolDefaultRaw.notes,
        updatedAt: schoolDefaultRaw.updated_at,
      } satisfies SchoolFeeDefault)
    : createEmptySchoolDefault();

  const classDefaultRaw = classDefaultResult.data;
  let classDefault = null;
  if (classDefaultRaw) {
    const customFeeHeadAmounts = parseCustomAmountMap(classDefaultRaw.other_fee_heads);
    classDefault = {
      id: classDefaultRaw.id,
      classId: classDefaultRaw.class_id,
      classLabel: payload.classRef ? buildClassLabel(payload.classRef) : "Unknown class",
      sessionLabel: payload.classRef?.session_label ?? "Unknown session",
      tuitionFee: classDefaultRaw.tuition_fee_amount,
      transportFee: classDefaultRaw.transport_fee_amount,
      booksFee: classDefaultRaw.books_fee_amount,
      admissionActivityMiscFee: classDefaultRaw.admission_activity_misc_fee_amount,
      customFeeHeadAmounts,
      annualTotal: calculateAnnualTotal({
        tuitionFee: classDefaultRaw.tuition_fee_amount,
        transportFee: classDefaultRaw.transport_fee_amount,
        booksFee: classDefaultRaw.books_fee_amount,
        admissionActivityMiscFee: classDefaultRaw.admission_activity_misc_fee_amount,
        customFeeHeadAmounts,
      }),
      studentTypeDefault: classDefaultRaw.student_type_default,
      transportAppliesDefault: classDefaultRaw.transport_applies_default,
      notes: classDefaultRaw.notes,
      updatedAt: classDefaultRaw.updated_at,
    } satisfies ClassFeeDefault;
  }

  const routeDefaultRaw = routeDefaultResult.data;
  const routeDefault = routeDefaultRaw
    ? ({
        id: routeDefaultRaw.id,
        routeCode: routeDefaultRaw.route_code,
        routeName: routeDefaultRaw.route_name,
        defaultInstallmentAmount: routeDefaultRaw.default_installment_amount,
        annualFeeAmount: routeDefaultRaw.annual_fee_amount,
        isActive: routeDefaultRaw.is_active,
        notes: routeDefaultRaw.notes,
        updatedAt: routeDefaultRaw.updated_at,
      } satisfies TransportDefault)
    : null;

  const studentOverride = studentOverrideRaw
    ? ({
        id: studentOverrideRaw.id,
        studentId: studentOverrideRaw.student_id,
        studentLabel: payload.studentRaw
          ? `${payload.studentRaw.full_name ?? ""} (${payload.studentRaw.admission_no ?? ""})`
          : "Unknown student",
        classLabel: payload.classRef ? buildClassLabel(payload.classRef) : "Unknown class",
        feeSettingId: studentOverrideRaw.fee_setting_id,
        customTuitionFeeAmount: studentOverrideRaw.custom_tuition_fee_amount,
        customTransportFeeAmount: studentOverrideRaw.custom_transport_fee_amount,
        customBooksFeeAmount: studentOverrideRaw.custom_books_fee_amount,
        customAdmissionActivityMiscFeeAmount: studentOverrideRaw.custom_admission_activity_misc_fee_amount,
        customFeeHeadAmounts: parseCustomAmountMap(studentOverrideRaw.custom_other_fee_heads),
        customOtherFeeHeadLabels: parseCustomLabelMap(
          studentOverrideRaw.custom_other_fee_head_labels,
        ),
        customLateFeeFlatAmount: studentOverrideRaw.custom_late_fee_flat_amount,
        otherAdjustmentHead: studentOverrideRaw.other_adjustment_head,
        otherAdjustmentAmount: studentOverrideRaw.other_adjustment_amount,
        lateFeeWaiverAmount: toWholeNumber(studentOverrideRaw.late_fee_waiver_amount),
        discountAmount: studentOverrideRaw.discount_amount,
        studentTypeOverride: studentOverrideRaw.student_type_override,
        transportAppliesOverride: studentOverrideRaw.transport_applies_override,
        reason: studentOverrideRaw.reason,
        notes: studentOverrideRaw.notes ?? null,
        updatedAt: studentOverrideRaw.updated_at,
      } satisfies StudentFeeOverride)
    : null;

  return {
    policy,
    schoolDefault,
    classDefault,
    routeDefault,
    studentOverride,
    conventionalDiscountAssignments,
  };
}

async function getStudentFinancialSnapshotUncached(
  studentId: string,
): Promise<StudentFinancialSnapshot | null> {
  const supabase = await getCacheSafeClient();
  const { data: studentRaw, error: studentError } = await supabase
    .from("students")
    .select(
      "id, class_id, transport_route_id, full_name, admission_no, class_ref:classes(id, session_label, class_name, section, stream_name)",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    throw new Error(`Unable to load student financial view: ${studentError.message}`);
  }

  if (!studentRaw) {
    return null;
  }

  const student = studentRaw as {
    id: string;
    class_id: string;
    transport_route_id: string | null;
    full_name: string;
    admission_no: string;
    class_ref: ClassRow | ClassRow[] | null;
  };

  const classRef = toSingleRecord(student.class_ref);
  const sessionLabel = classRef?.session_label ?? "";

  const pageData = await getStudentFeeSetupData({
    studentId,
    classId: student.class_id,
    transportRouteId: student.transport_route_id,
    sessionLabel,
    classRef,
    studentRaw,
  });

  const classDefault = pageData.classDefault;
  const routeDefault = pageData.routeDefault;
  const studentOverride = pageData.studentOverride;
  const conventionalDiscountAssignments = pageData.conventionalDiscountAssignments;

  const resolved = resolveStudentPolicyBreakdown({
    policy: pageData.policy,
    schoolDefault: pageData.schoolDefault,
    classDefault,
    routeDefault,
    studentOverride,
    conventionalDiscountAssignments,
    hasTransportRoute: Boolean(student.transport_route_id),
  });

  // Mirrors the no-override branches of resolveStudentPolicyBreakdown so the
  // fee-plan editor can show what clearing an override would fall back to.
  const classDefaultTuitionFee =
    (classDefault ?? pageData.schoolDefault).tuitionFee;
  const routeDefaultTransportFee =
    student.transport_route_id && routeDefault
      ? routeDefault.annualFeeAmount ??
        routeDefault.defaultInstallmentAmount * pageData.policy.installmentCount
      : 0;

  if (pageData.policy.calculationModel === "workbook_v1") {
    const [
      { data: workbookStudentRaw, error: workbookStudentError },
      { data: workbookBalancesRaw, error: workbookBalancesError },
      { data: financialStateRaw, error: financialStateError },
    ] = await Promise.all([
      supabase
        .from("v_workbook_student_financials")
        .select("outstanding_amount, next_due_date, next_due_label, next_due_amount")
        .eq("student_id", studentId)
        .maybeSingle(),
      supabase
        .from("v_workbook_installment_balances")
        .select("pending_amount, balance_status")
        .eq("student_id", studentId)
        .gt("pending_amount", 0),
      supabase
        .from("v_student_financial_state")
        .select("pending_amount, credit_balance, refundable_amount, rows_kept_for_review")
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);

    if (workbookStudentError && !workbookStudentError.message.includes("does not exist")) {
      throw new Error(`Unable to load workbook student balances: ${workbookStudentError.message}`);
    }

    if (workbookBalancesError && !workbookBalancesError.message.includes("does not exist")) {
      throw new Error(`Unable to load workbook installment balances: ${workbookBalancesError.message}`);
    }

    if (financialStateError && !financialStateError.message.includes("does not exist")) {
      throw new Error(`Unable to load student financial state: ${financialStateError.message}`);
    }

    const workbookStudent = (workbookStudentRaw ?? null) as
      | {
          outstanding_amount: number;
          next_due_date: string | null;
          next_due_label: string | null;
          next_due_amount: number | null;
        }
      | null;
    const workbookBalances = (workbookBalancesRaw ?? []) as Array<{
      pending_amount: number;
      balance_status: "paid" | "partial" | "overdue" | "pending" | "waived";
    }>;
    const financialState = (financialStateRaw ?? null) as
      | {
          pending_amount: number;
          credit_balance: number;
          refundable_amount: number;
          rows_kept_for_review: number;
        }
      | null;

    return {
      policy: pageData.policy,
      resolvedBreakdown: resolved.breakdown,
    classDefaultTuitionFee,
    routeDefaultTransportFee,
      currentOutstanding:
        financialState?.pending_amount ??
        workbookStudent?.outstanding_amount ??
        workbookBalances.reduce((sum, row) => sum + row.pending_amount, 0),
      creditBalance: financialState?.credit_balance ?? 0,
      refundableAmount: financialState?.refundable_amount ?? 0,
      rowsKeptForReview: financialState?.rows_kept_for_review ?? 0,
      openInstallments: workbookBalances.length,
      overdueInstallments: workbookBalances.filter((row) => row.balance_status === "overdue").length,
      nextDueDate: workbookStudent?.next_due_date ?? null,
      nextDueLabel: workbookStudent?.next_due_label
        ? getDisplayInstallmentLabel({ installmentLabel: workbookStudent.next_due_label })
        : null,
      nextDueAmount: workbookStudent?.next_due_amount ?? null,
      activeOverrideReason: resolved.activeOverrideReason,
    };
  }

  const { data: balancesRaw, error: balancesError } = await supabase
    .from("v_installment_balances")
    .select("due_date, outstanding_amount, balance_status, installment_label")
    .eq("student_id", studentId)
    .gt("outstanding_amount", 0)
    .order("due_date", { ascending: true });

  if (balancesError) {
    throw new Error(`Unable to load student balances: ${balancesError.message}`);
  }

  const balanceRows = (balancesRaw ?? []) as InstallmentBalanceRow[];
  const nextDue = balanceRows[0] ?? null;

  return {
    policy: pageData.policy,
    resolvedBreakdown: resolved.breakdown,
    classDefaultTuitionFee,
    routeDefaultTransportFee,
    currentOutstanding: balanceRows.reduce(
      (sum, row) => sum + row.outstanding_amount,
      0,
    ),
    creditBalance: 0,
    refundableAmount: 0,
    rowsKeptForReview: 0,
    openInstallments: balanceRows.length,
    overdueInstallments: balanceRows.filter((row) => row.balance_status === "overdue").length,
    nextDueDate: nextDue?.due_date ?? null,
    nextDueLabel: nextDue?.installment_label
      ? getDisplayInstallmentLabel({ installmentLabel: nextDue.installment_label })
      : null,
    nextDueAmount: nextDue?.outstanding_amount ?? null,
    activeOverrideReason: resolved.activeOverrideReason,
  };
}

export async function getStudentFinancialSnapshot(
  studentId: string,
  options: { skipCache?: boolean } = {},
): Promise<StudentFinancialSnapshot | null> {
  // The uncached body uses cookie-based Supabase clients. `unstable_cache`
  // forbids reading cookies inside its scope — which throws a hard 500 in a
  // Route Handler on a cold (cache-miss) student. Callers that run outside a
  // render (e.g. the fee-pdf route handlers) pass skipCache so the body runs
  // directly, where reading cookies is allowed.
  if (options.skipCache) {
    return getStudentFinancialSnapshotUncached(studentId);
  }
  return cacheSafeUnstableCache(
    async () => getStudentFinancialSnapshotUncached(studentId),
    ["student-financial-snapshot", studentId],
    { tags: [`student:${studentId}`] },
  )();
}

