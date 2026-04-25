import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import { getOptionalEnvVar, hasRequiredEnvVars } from "@/lib/env";
import type { PaymentMode } from "@/lib/db/types";
import {
  buildDefaultFeePolicySummary,
  buildInstallmentDueDate,
  formatPaymentModeLabel,
  normalizeFeeHeadId,
} from "@/lib/config/fee-rules";
import {
  buildWorkbookInstallmentCharges,
  isWorkbookSession,
} from "@/lib/fees/workbook";
import {
  DEFAULT_FEE_HEAD_METADATA,
  normalizeFeeHeadDefinition,
  parseFeeHeadCatalog,
} from "@/lib/fees/fee-heads";
import {
  applyConventionalDiscountsToTuition,
  getConventionalDiscountPolicies,
  getStudentConventionalDiscountAssignments,
} from "@/lib/fees/conventional-discounts";
import type {
  ClassFeeDefault,
  FeeHeadDefinition,
  FeePolicySnapshot,
  FeePolicySummary,
  FeeSetupPageData,
  FeeSetupStudentOption,
  InstallmentScheduleItem,
  ResolvedFeeBreakdown,
  SchoolFeeDefault,
  StudentConventionalDiscountAssignment,
  StudentFeeOverride,
  StudentFinancialSnapshot,
  TransportDefault,
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

type RouteRow = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  annual_fee_amount: number | null;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
};

type GlobalPolicyRow = {
  id: string;
  academic_session_label: string;
  calculation_model: "standard" | "workbook_v1";
  installment_schedule: unknown;
  late_fee_flat_amount: number;
  new_student_academic_fee_amount: number;
  old_student_academic_fee_amount: number;
  custom_fee_heads: unknown;
  accepted_payment_modes: PaymentMode[];
  receipt_prefix: string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

type SchoolDefaultRow = {
  id: string;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
};

type FeeSettingRow = {
  id: string;
  class_id: string;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
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
  other_adjustment_head: string | null;
  other_adjustment_amount: number | null;
  late_fee_waiver_amount: number;
  discount_amount: number;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
  reason: string;
  notes?: string | null;
  updated_at: string;
};

type InstallmentBalanceRow = {
  due_date: string;
  outstanding_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
  installment_label: string;
};

type ReadClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

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

function titleCaseFromKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toWholeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function parseCustomAmountMap(value: Record<string, unknown> | null) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, rawValue]) => {
    if (!key.trim()) {
      return acc;
    }

    const numeric = toWholeNumber(rawValue);
    if (numeric <= 0) {
      return acc;
    }

    acc[key] = numeric;
    return acc;
  }, {});
}

function normalizeCatalog(
  catalog: FeeHeadDefinition[],
  discoveredIds: Iterable<string>,
) {
  const ordered = new Map<string, FeeHeadDefinition>();

  catalog.forEach((item) => {
    const normalized = normalizeFeeHeadDefinition(item);

    if (!normalized || ordered.has(normalized.id)) {
      return;
    }

    ordered.set(normalized.id, normalized);
  });

  for (const rawId of discoveredIds) {
    const id = normalizeFeeHeadId(rawId);

    if (!id || ordered.has(id)) {
      continue;
    }

    ordered.set(id, {
      id,
      label: titleCaseFromKey(rawId),
      amount: 0,
      applicationType: "annual_fixed",
      ...DEFAULT_FEE_HEAD_METADATA,
      isActive: true,
      notes: null,
    });
  }

  return Array.from(ordered.values());
}

function toFeePolicySummary(
  row: GlobalPolicyRow,
  defaults = buildDefaultFeePolicySummary(),
): FeePolicySnapshot {
  const academicSessionLabel = row.academic_session_label?.trim() || defaults.academicSessionLabel;
  const installmentSchedule = parseInstallmentSchedule(
    academicSessionLabel,
    row.installment_schedule,
  );

  return {
    id: row.id,
    academicSessionLabel,
    calculationModel: row.calculation_model ?? defaults.calculationModel,
    installmentCount: installmentSchedule.length,
    installmentSchedule,
    lateFeeFlatAmount: toWholeNumber(row.late_fee_flat_amount),
    lateFeeLabel: `Flat Rs ${toWholeNumber(row.late_fee_flat_amount)}`,
    newStudentAcademicFeeAmount:
      toWholeNumber(row.new_student_academic_fee_amount) ||
      defaults.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount:
      toWholeNumber(row.old_student_academic_fee_amount) ||
      defaults.oldStudentAcademicFeeAmount,
    acceptedPaymentModes: (
      row.accepted_payment_modes ?? defaults.acceptedPaymentModes.map((item) => item.value)
    ).map((value) => ({
      value,
      label: formatPaymentModeLabel(value),
    })),
    receiptPrefix: row.receipt_prefix?.trim() || defaults.receiptPrefix,
    customFeeHeads: parseFeeHeadCatalog(row.custom_fee_heads),
    notes: row.notes ?? defaults.notes,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

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

  const { data, error } = await supabase
    .from("fee_policy_configs")
    .select(
      "id, academic_session_label, calculation_model, installment_schedule, late_fee_flat_amount, new_student_academic_fee_amount, old_student_academic_fee_amount, custom_fee_heads, accepted_payment_modes, receipt_prefix, notes, is_active, updated_at",
    )
    .order("is_active", { ascending: false })
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
    .map((row) => toFeePolicySummary(row, defaults))
    .filter((row) => {
      const key = row.academicSessionLabel.trim().toLowerCase();

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function parseInstallmentSchedule(
  academicSessionLabel: string,
  value: unknown,
): InstallmentScheduleItem[] {
  if (!Array.isArray(value)) {
    return buildDefaultFeePolicySummary().installmentSchedule.map((item) => ({
      ...item,
      dueDate: buildInstallmentDueDate(academicSessionLabel, item.dueDateLabel),
    }));
  }

  const schedule = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const label = typeof entry.label === "string" ? entry.label.trim() : "";
      const dueDateLabel =
        typeof entry.dueDateLabel === "string" ? entry.dueDateLabel.trim() : "";

      if (!label || !dueDateLabel) {
        return null;
      }

      return {
        label,
        dueDateLabel,
        dueDate: buildInstallmentDueDate(academicSessionLabel, dueDateLabel),
      } satisfies InstallmentScheduleItem;
    })
    .filter((entry): entry is InstallmentScheduleItem => Boolean(entry));

  if (schedule.length > 0) {
    return schedule;
  }

  return buildDefaultFeePolicySummary().installmentSchedule.map((item) => ({
    ...item,
    dueDate: buildInstallmentDueDate(academicSessionLabel, item.dueDateLabel),
  }));
}

function createEmptySchoolDefault(): SchoolFeeDefault {
  return {
    id: null,
    tuitionFee: 0,
    transportFee: 0,
    booksFee: 0,
    admissionActivityMiscFee: 0,
    customFeeHeadAmounts: {},
    studentTypeDefault: "existing",
    transportAppliesDefault: false,
    notes: null,
    updatedAt: null,
  };
}

function calculateAnnualTotal(
  values: Pick<
    SchoolFeeDefault,
    "tuitionFee" | "transportFee" | "booksFee" | "admissionActivityMiscFee" | "customFeeHeadAmounts"
  >,
) {
  return (
    values.tuitionFee +
    values.transportFee +
    values.booksFee +
    values.admissionActivityMiscFee +
    Object.values(values.customFeeHeadAmounts).reduce((sum, value) => sum + value, 0)
  );
}

async function getReadClient(useAdmin = false): Promise<ReadClient | null> {
  if (!hasRequiredEnvVars) {
    return null;
  }

  if (useAdmin && getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY")) {
    return createAdminClient();
  }

  return createClient();
}

async function loadGlobalPolicy(useAdmin = false): Promise<FeePolicySummary> {
  const snapshots = await loadFeePolicySnapshots(useAdmin);
  const active = snapshots.find((item) => item.isActive) ?? snapshots[0];

  if (!active) {
    return {
      id: null,
      ...buildDefaultFeePolicySummary(),
    };
  }

  return {
    id: active.id,
    academicSessionLabel: active.academicSessionLabel,
    calculationModel: active.calculationModel,
    installmentCount: active.installmentCount,
    installmentSchedule: active.installmentSchedule,
    lateFeeFlatAmount: active.lateFeeFlatAmount,
    lateFeeLabel: active.lateFeeLabel,
    newStudentAcademicFeeAmount: active.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: active.oldStudentAcademicFeeAmount,
    acceptedPaymentModes: active.acceptedPaymentModes,
    receiptPrefix: active.receiptPrefix,
    customFeeHeads: active.customFeeHeads,
    notes: active.notes,
  };
}

async function loadFeeCollections() {
  const supabase = await createClient();
  const studentOverridesSelectWithNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, notes, updated_at";
  const studentOverridesSelectWithoutNotes =
    "id, student_id, fee_setting_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, reason, updated_at";

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
      .in("status", ["active", "inactive"])
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

function buildStudentOptions(studentRows: StudentRow[]): FeeSetupStudentOption[] {
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

function buildResolvedBreakdown(payload: {
  tuitionBeforeConventionalDiscount?: number;
  conventionalDiscountApplied?: number;
  conventionalDiscountLabels?: string[];
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  customFeeHeads: FeeHeadDefinition[];
  calculationModel?: FeePolicySummary["calculationModel"];
  studentType?: "new" | "existing";
  academicFeeAmount?: number;
  otherAdjustmentHead?: string | null;
  otherAdjustmentAmount?: number;
  grossBaseBeforeDiscount?: number;
  discountApplied?: number;
  lateFeeWaiverAmount?: number;
  annualTotal?: number;
  booksExcludedFromWorkbook?: boolean;
}): ResolvedFeeBreakdown {
  const customHeadMap = new Map(
    payload.customFeeHeads.map((item) => [item.id, item.label]),
  );

  const isWorkbook = payload.calculationModel === "workbook_v1";
  const coreHeads = isWorkbook
    ? [
        { id: "tuition_fee", label: "Tuition fee", amount: payload.tuitionFee },
        { id: "transport_fee", label: "Transport fee", amount: payload.transportFee },
        {
          id: "academic_fee",
          label: "Academic fee",
          amount: Math.max(0, payload.academicFeeAmount ?? 0),
        },
        {
          id: "other_adjustment",
          label: payload.otherAdjustmentHead?.trim() || "Other fee / adjustment",
          amount: payload.otherAdjustmentAmount ?? 0,
        },
      ]
    : [
        { id: "tuition_fee", label: "Tuition fee", amount: payload.tuitionFee },
        { id: "transport_fee", label: "Transport fee", amount: payload.transportFee },
        { id: "books_fee", label: "Books fee", amount: payload.booksFee },
        {
          id: "admission_activity_misc_fee",
          label: "Admission / activity / misc fee",
          amount: payload.admissionActivityMiscFee,
        },
      ];

  const customHeads = isWorkbook
    ? []
    : Object.entries(payload.customFeeHeadAmounts)
        .map(([id, amount]) => ({
          id,
          label: customHeadMap.get(id) ?? titleCaseFromKey(id),
          amount,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

  const annualTotal =
    payload.annualTotal ??
    (coreHeads.reduce((sum, item) => sum + item.amount, 0) +
      customHeads.reduce((sum, item) => sum + item.amount, 0));

  return {
    coreHeads,
    customHeads,
    annualTotal,
    calculationModel: payload.calculationModel ?? "standard",
    studentType: payload.studentType ?? "existing",
    academicFeeAmount: Math.max(0, payload.academicFeeAmount ?? 0),
    otherAdjustmentHead: payload.otherAdjustmentHead ?? null,
    otherAdjustmentAmount: payload.otherAdjustmentAmount ?? 0,
    grossBaseBeforeDiscount:
      payload.grossBaseBeforeDiscount ??
      (coreHeads.reduce((sum, item) => sum + item.amount, 0) +
        customHeads.reduce((sum, item) => sum + item.amount, 0)),
    discountApplied: Math.max(0, payload.discountApplied ?? 0),
    conventionalDiscountApplied: Math.max(
      0,
      Math.trunc(payload.conventionalDiscountApplied ?? 0),
    ),
    conventionalDiscountLabels: payload.conventionalDiscountLabels ?? [],
    tuitionBeforeConventionalDiscount:
      payload.tuitionBeforeConventionalDiscount ?? payload.tuitionFee,
    lateFeeWaiverAmount: Math.max(0, payload.lateFeeWaiverAmount ?? 0),
    booksExcludedFromWorkbook: Boolean(payload.booksExcludedFromWorkbook),
  };
}

export async function getFeePolicySummary(options: { useAdmin?: boolean } = {}) {
  return loadGlobalPolicy(Boolean(options.useAdmin));
}

export async function getFeeSetupPageData(): Promise<FeeSetupPageData> {
  const [globalPolicy, policySnapshotsRaw, collections, masterOptions] = await Promise.all([
    loadGlobalPolicy(false),
    loadFeePolicySnapshots(false),
    loadFeeCollections(),
    getMasterDataOptions(),
  ]);
  const [conventionalDiscountPolicies, conventionalDiscountAssignments] = await Promise.all([
    getConventionalDiscountPolicies(globalPolicy.academicSessionLabel),
    getStudentConventionalDiscountAssignments({
      academicSessionLabel: globalPolicy.academicSessionLabel,
      studentIds: collections.studentRows.map((row) => row.id),
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
      .update({ status: "active", is_current: true })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from("academic_sessions").insert({
    session_label: normalized,
    status: "active",
    is_current: true,
    notes: "Auto-synced from fee policy",
  });

  if (error) {
    throw new Error(error.message);
  }
}

function buildPolicyPayload(payload: {
  academicSessionLabel: string;
  calculationModel: FeePolicySummary["calculationModel"];
  installmentSchedule: Array<{ label: string; dueDateLabel: string }>;
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  acceptedPaymentModes: PaymentMode[];
  receiptPrefix: string;
  customFeeHeads: FeeHeadDefinition[];
  notes: string | null;
}) {
  const dedupedCatalog = normalizeCatalog(payload.customFeeHeads, []);
  const dedupedModes = Array.from(new Set(payload.acceptedPaymentModes));

  if (dedupedModes.length === 0) {
    throw new Error("Select at least one accepted payment mode.");
  }

  if (!payload.academicSessionLabel.trim()) {
    throw new Error("Academic session is required.");
  }

  if (!payload.receiptPrefix.trim()) {
    throw new Error("Receipt prefix is required.");
  }

  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(payload.receiptPrefix)) {
    throw new Error("Receipt prefix must use 2-12 uppercase letters, numbers, or hyphens.");
  }

  const installmentSchedule = payload.installmentSchedule
    .map((item) => ({
      label: item.label.trim(),
      dueDateLabel: item.dueDateLabel.trim(),
    }))
    .filter((item) => item.label && item.dueDateLabel);

  if (installmentSchedule.length === 0) {
    throw new Error("At least one installment schedule row is required.");
  }

  installmentSchedule.forEach((item) => {
    buildInstallmentDueDate(payload.academicSessionLabel, item.dueDateLabel);
  });

  return {
    academic_session_label: payload.academicSessionLabel.trim(),
    calculation_model: payload.calculationModel,
    installment_schedule: installmentSchedule,
    late_fee_flat_amount: payload.lateFeeFlatAmount,
    new_student_academic_fee_amount: payload.newStudentAcademicFeeAmount,
    old_student_academic_fee_amount: payload.oldStudentAcademicFeeAmount,
    custom_fee_heads: dedupedCatalog,
    accepted_payment_modes: dedupedModes,
    receipt_prefix: payload.receiptPrefix.trim(),
    notes: payload.notes,
    is_active: true,
  };
}

export async function upsertGlobalFeePolicy(payload: {
  academicSessionLabel: string;
  calculationModel: FeePolicySummary["calculationModel"];
  installmentSchedule: Array<{ label: string; dueDateLabel: string }>;
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  acceptedPaymentModes: PaymentMode[];
  receiptPrefix: string;
  customFeeHeads: FeeHeadDefinition[];
  notes: string | null;
}) {
  const supabase = await createClient();
  const values = buildPolicyPayload(payload);
  const { data: existing, error: existingError } = await supabase
    .from("fee_policy_configs")
    .select("id, academic_session_label")
    .eq("is_active", true)
    .maybeSingle();

  if (existingError && !existingError.message.includes("does not exist")) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    if (existing.academic_session_label.trim() !== values.academic_session_label) {
      const { error: deactivateError } = await supabase
        .from("fee_policy_configs")
        .update({ is_active: false })
        .eq("id", existing.id);

      if (deactivateError) {
        throw new Error(deactivateError.message);
      }

      const { data: inserted, error: insertError } = await supabase
        .from("fee_policy_configs")
        .insert(values)
        .select("id")
        .single();

      if (insertError) {
        await supabase
          .from("fee_policy_configs")
          .update({ is_active: true })
          .eq("id", existing.id);
        throw new Error(insertError.message);
      }

      await syncAcademicSessionFromPolicy(values.academic_session_label);
      return inserted.id as string;
    }

    const { error } = await supabase
      .from("fee_policy_configs")
      .update(values)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    await syncAcademicSessionFromPolicy(values.academic_session_label);

    return existing.id as string;
  }

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

  return data.id as string;
}

function buildOtherFeeHeadPayload(
  customFeeHeads: FeeHeadDefinition[],
  amounts: Record<string, number>,
) {
  const allowedIds = new Set(customFeeHeads.map((item) => item.id));

  return Object.entries(amounts).reduce<Record<string, number>>((acc, [id, amount]) => {
    const normalizedId = normalizeFeeHeadId(id);
    if (!normalizedId || !allowedIds.has(normalizedId) || amount <= 0) {
      return acc;
    }

    acc[normalizedId] = amount;
    return acc;
  }, {});
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

  const values = {
    student_id: payload.studentId,
    fee_setting_id: feeSetting.id as string,
    custom_tuition_fee_amount: payload.customTuitionFeeAmount,
    custom_transport_fee_amount: payload.customTransportFeeAmount,
    custom_books_fee_amount: payload.customBooksFeeAmount,
    custom_admission_activity_misc_fee_amount:
      payload.customAdmissionActivityMiscFeeAmount,
    custom_other_fee_heads: buildOtherFeeHeadPayload(
      payload.customFeeHeads,
      payload.customFeeHeadAmounts,
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
  const valuesWithoutNotes = {
    ...values,
  };
  delete (valuesWithoutNotes as { notes?: string | null }).notes;

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
    let { error } = await supabase
      .from("student_fee_overrides")
      .update(values)
      .eq("id", existing.id);

    if (error && error.message.includes("student_fee_overrides.notes")) {
      const fallback = await supabase
        .from("student_fee_overrides")
        .update(valuesWithoutNotes)
        .eq("id", existing.id);
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    return existing.id as string;
  }

  let { data, error } = await supabase
    .from("student_fee_overrides")
    .insert(values)
    .select("id")
    .single();

  if (error && error.message.includes("student_fee_overrides.notes")) {
    const fallback = await supabase
      .from("student_fee_overrides")
      .insert(valuesWithoutNotes)
      .select("id")
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Unable to save student override right now.");
  }

  return data.id as string;
}

export function resolveStudentPolicyBreakdown(payload: {
  policy: FeePolicySummary;
  schoolDefault: SchoolFeeDefault;
  classDefault: ClassFeeDefault | null;
  routeDefault: TransportDefault | null;
  studentOverride: StudentFeeOverride | null;
  conventionalDiscountAssignments?: StudentConventionalDiscountAssignment[];
  hasTransportRoute: boolean;
}) {
  const base = payload.classDefault ?? payload.schoolDefault;
  const baseCustomAmounts = base.customFeeHeadAmounts;
  const overrideCustomAmounts = payload.studentOverride?.customFeeHeadAmounts ?? {};
  const mergedCustomAmounts = payload.policy.customFeeHeads.reduce<Record<string, number>>(
    (acc, item) => {
      const overrideAmount = overrideCustomAmounts[item.id];
      const baseAmount = baseCustomAmounts[item.id];
      acc[item.id] =
        overrideAmount !== undefined ? overrideAmount : baseAmount ?? 0;
      return acc;
    },
    {},
  );
  const effectiveStudentType =
    payload.studentOverride?.studentTypeOverride ?? base.studentTypeDefault;
  const lateFeeFlatAmount =
    payload.studentOverride?.customLateFeeFlatAmount ??
    payload.policy.lateFeeFlatAmount;
  const lateFeeWaiverAmount = payload.studentOverride?.lateFeeWaiverAmount ?? 0;
  const classSessionLabel = payload.classDefault?.sessionLabel ?? payload.policy.academicSessionLabel;
  const routeAnnualAmount =
    payload.hasTransportRoute && payload.routeDefault
      ? (payload.routeDefault.annualFeeAmount ??
          payload.routeDefault.defaultInstallmentAmount * payload.policy.installmentCount)
      : 0;

  if (isWorkbookSession(payload.policy, classSessionLabel)) {
    const legacyOtherAdjustmentEntries = Object.entries(overrideCustomAmounts).filter(
      ([, amount]) => amount !== 0,
    );
    const fallbackOtherAdjustmentAmount = legacyOtherAdjustmentEntries.reduce(
      (sum, [, amount]) => sum + amount,
      0,
    );
    const otherAdjustmentHead =
      payload.studentOverride?.otherAdjustmentHead?.trim() ||
      (legacyOtherAdjustmentEntries.length === 1
        ? titleCaseFromKey(legacyOtherAdjustmentEntries[0]![0])
        : legacyOtherAdjustmentEntries.length > 1
          ? "Other fee / adjustment"
          : null);
    const otherAdjustmentAmount =
      payload.studentOverride?.otherAdjustmentAmount ?? fallbackOtherAdjustmentAmount;
    const tuitionBeforeConventionalDiscount =
      payload.studentOverride?.customTuitionFeeAmount ?? base.tuitionFee;
    const conventionalDiscountEffect = applyConventionalDiscountsToTuition({
      baseTuition: tuitionBeforeConventionalDiscount,
      assignments: payload.conventionalDiscountAssignments ?? [],
    });
    const tuitionFee = conventionalDiscountEffect.resultingTuition;
    const transportFee =
      payload.studentOverride?.customTransportFeeAmount ??
      (payload.hasTransportRoute ? routeAnnualAmount : 0);
    const academicFeeAmount =
      effectiveStudentType === "new"
        ? payload.policy.newStudentAcademicFeeAmount
        : payload.policy.oldStudentAcademicFeeAmount;
    const workbookCharges = buildWorkbookInstallmentCharges({
      installmentCount: payload.policy.installmentCount,
      tuitionFee,
      transportFee,
      academicFee: academicFeeAmount,
      otherAdjustmentAmount,
      discountAmount: payload.studentOverride?.discountAmount ?? 0,
    });

    return {
      breakdown: buildResolvedBreakdown({
        tuitionFee,
        tuitionBeforeConventionalDiscount,
        transportFee,
        booksFee: 0,
        admissionActivityMiscFee: 0,
        customFeeHeadAmounts: {},
        customFeeHeads: [],
        calculationModel: payload.policy.calculationModel,
        studentType: effectiveStudentType,
        academicFeeAmount,
        otherAdjustmentHead,
        otherAdjustmentAmount,
        grossBaseBeforeDiscount: workbookCharges.grossBaseBeforeDiscount,
        discountApplied: workbookCharges.discountApplied,
        conventionalDiscountApplied: conventionalDiscountEffect.discountApplied,
        conventionalDiscountLabels: conventionalDiscountEffect.appliedLabels,
        lateFeeWaiverAmount,
        annualTotal: workbookCharges.baseTotalDue,
        booksExcludedFromWorkbook: true,
      }),
      lateFeeFlatAmount,
      activeOverrideReason: payload.studentOverride?.reason ?? null,
    };
  }

  const transportEnabled =
    payload.studentOverride?.transportAppliesOverride ??
    base.transportAppliesDefault;
  const admissionActivityMiscFee =
    payload.studentOverride?.customAdmissionActivityMiscFeeAmount ??
    (effectiveStudentType === "new" ? base.admissionActivityMiscFee : 0);
  const transportFee = transportEnabled
    ? payload.studentOverride?.customTransportFeeAmount ??
      (payload.hasTransportRoute ? routeAnnualAmount : base.transportFee)
    : 0;
  const legacyTuitionFee =
    payload.studentOverride?.customTuitionFeeAmount ?? base.tuitionFee;
  const conventionalDiscountEffect = applyConventionalDiscountsToTuition({
    baseTuition: legacyTuitionFee,
    assignments: payload.conventionalDiscountAssignments ?? [],
  });
  const tuitionFee = conventionalDiscountEffect.resultingTuition;
  const legacyBooksFee =
    payload.studentOverride?.customBooksFeeAmount ?? base.booksFee;
  const legacyGrossBaseBeforeDiscount =
    tuitionFee +
    transportFee +
    legacyBooksFee +
    admissionActivityMiscFee +
    Object.values(mergedCustomAmounts).reduce((sum, value) => sum + value, 0);

  const breakdown = buildResolvedBreakdown({
    tuitionFee,
    tuitionBeforeConventionalDiscount: legacyTuitionFee,
    transportFee,
    booksFee: legacyBooksFee,
    admissionActivityMiscFee,
    customFeeHeadAmounts: mergedCustomAmounts,
    customFeeHeads: payload.policy.customFeeHeads,
    calculationModel: payload.policy.calculationModel,
    studentType: effectiveStudentType,
    grossBaseBeforeDiscount: legacyGrossBaseBeforeDiscount,
    discountApplied: payload.studentOverride?.discountAmount ?? 0,
    conventionalDiscountApplied: conventionalDiscountEffect.discountApplied,
    conventionalDiscountLabels: conventionalDiscountEffect.appliedLabels,
    lateFeeWaiverAmount,
  });

  return {
    breakdown,
    lateFeeFlatAmount,
    activeOverrideReason: payload.studentOverride?.reason ?? null,
  };
}

export async function getStudentFinancialSnapshot(
  studentId: string,
): Promise<StudentFinancialSnapshot | null> {
  const supabase = await createClient();
  const { data: studentRaw, error: studentError } = await supabase
    .from("students")
    .select(
      "id, class_id, transport_route_id, class_ref:classes(id, session_label, class_name, section, stream_name)",
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
    class_ref: ClassRow | ClassRow[] | null;
  };

  const pageData = await getFeeSetupPageData();
  const classDefault =
    pageData.classDefaults.find((item) => item.classId === student.class_id) ?? null;
  const routeDefault =
    pageData.transportDefaults.find((item) => item.id === student.transport_route_id) ??
    null;
  const studentOverride =
    pageData.studentOverrides.find((item) => item.studentId === studentId) ?? null;
  const conventionalDiscountAssignments = pageData.conventionalDiscountAssignments.filter(
    (item) => item.studentId === studentId,
  );
  const resolved = resolveStudentPolicyBreakdown({
    policy: pageData.globalPolicy,
    schoolDefault: pageData.schoolDefault,
    classDefault,
    routeDefault,
    studentOverride,
    conventionalDiscountAssignments,
    hasTransportRoute: Boolean(student.transport_route_id),
  });

  if (pageData.globalPolicy.calculationModel === "workbook_v1") {
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
      policy: pageData.globalPolicy,
      resolvedBreakdown: resolved.breakdown,
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
      nextDueLabel: workbookStudent?.next_due_label ?? null,
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
    policy: pageData.globalPolicy,
    resolvedBreakdown: resolved.breakdown,
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
    nextDueLabel: nextDue?.installment_label ?? null,
    nextDueAmount: nextDue?.outstanding_amount ?? null,
    activeOverrideReason: resolved.activeOverrideReason,
  };
}

export async function getAcceptedPaymentModeOptions() {
  const policy = await loadGlobalPolicy(false);
  return policy.acceptedPaymentModes;
}
