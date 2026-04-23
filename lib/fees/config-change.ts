import "server-only";

import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import type { PaymentMode } from "@/lib/db/types";
import {
  generateSessionLedgersAction,
  previewLedgerGenerationDetailed,
  type BlockedInstallmentForReview,
} from "@/lib/fees/generator";
import {
  getFeeSetupPageData,
  upsertClassFeeDefault,
  upsertGlobalFeePolicy,
  upsertSchoolFeeDefaults,
  upsertStudentFeeOverride,
  upsertTransportDefault,
} from "@/lib/fees/policy";
import { createClient } from "@/lib/supabase/server";
import type {
  ClassFeeDefault,
  ConfigChangeFieldDiff,
  ConfigChangeImpactPreview,
  ConfigChangeScope,
  FeeHeadDefinition,
  FeePolicySummary,
  FeeSetupPageData,
  InstallmentScheduleItem,
  SchoolFeeDefault,
  StudentFeeOverride,
  TransportDefault,
} from "@/lib/fees/types";

type GlobalPolicyChangePayload = {
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
};

type SharedCustomHeadPayload = {
  customFeeHeadsCatalog: FeeHeadDefinition[];
};

type SchoolDefaultsChangePayload = SharedCustomHeadPayload & {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
};

type ClassDefaultsChangePayload = SharedCustomHeadPayload & {
  classId: string;
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  studentTypeDefault: "new" | "existing";
  transportAppliesDefault: boolean;
  notes: string | null;
};

type TransportDefaultsChangePayload = {
  routeId: string | null;
  routeCode: string | null;
  routeName: string;
  defaultInstallmentAmount: number;
  annualFeeAmount: number | null;
  isActive: boolean;
  notes: string | null;
};

type StudentOverrideChangePayload = SharedCustomHeadPayload & {
  studentId: string;
  customTuitionFeeAmount: number | null;
  customTransportFeeAmount: number | null;
  customBooksFeeAmount: number | null;
  customAdmissionActivityMiscFeeAmount: number | null;
  customFeeHeadAmounts: Record<string, number>;
  customLateFeeFlatAmount: number | null;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  lateFeeWaiverAmount: number;
  discountAmount: number;
  studentTypeOverride: "new" | "existing" | null;
  transportAppliesOverride: boolean | null;
  reason: string;
  notes: string | null;
};

type ConfigPayloadByScope = {
  global_policy: GlobalPolicyChangePayload;
  school_defaults: SchoolDefaultsChangePayload;
  class_defaults: ClassDefaultsChangePayload;
  transport_defaults: TransportDefaultsChangePayload;
  student_override: StudentOverrideChangePayload;
};

type ConfigBatchStatus = "preview_ready" | "applied" | "stale" | "failed" | "cancelled";

type ConfigChangeBatchRow = {
  id: string;
  change_scope: ConfigChangeScope;
  status: ConfigBatchStatus;
  before_payload: unknown;
  proposed_payload: unknown;
  preview_summary: unknown;
};

type SessionStudentRow = {
  id: string;
  class_id: string;
  transport_route_id: string | null;
  class_ref:
    | {
        session_label: string;
      }
    | Array<{
        session_label: string;
      }>
    | null;
};

type ScopeContext = {
  targetLabel: string;
  targetRef: string | null;
  beforeSnapshot: {
    exists: boolean;
    values: unknown;
  };
  proposedPayload: unknown;
  projectedSetupData: FeeSetupPageData;
  changedFields: ConfigChangeFieldDiff[];
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};

  Object.keys(record)
    .sort()
    .forEach((key) => {
      ordered[key] = sortJson(record[key]);
    });

  return ordered;
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function sameValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function formatAmountMap(value: Record<string, number>) {
  const entries = Object.entries(value).filter(([, amount]) => amount > 0);

  if (entries.length === 0) {
    return "None";
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([head, amount]) => `${head}: Rs ${amount}`)
    .join(", ");
}

function formatFeeHeads(value: FeeHeadDefinition[]) {
  if (value.length === 0) {
    return "None";
  }

  return value.map((item) => `${item.label} (${item.id})`).join(", ");
}

function formatInstallmentSchedule(value: Array<{ label: string; dueDateLabel: string }>) {
  if (value.length === 0) {
    return "None";
  }

  return value.map((item) => `${item.label}: ${item.dueDateLabel}`).join(" | ");
}

function formatPaymentModes(value: PaymentMode[]) {
  if (value.length === 0) {
    return "None";
  }

  return value.map((item) => formatPaymentModeLabel(item)).join(", ");
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatNullable(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || "Not set";
}

function formatOptionalAmount(value: number | null) {
  return value === null ? "Not set" : `Rs ${value}`;
}

function buildFieldDiff(payload: {
  field: string;
  label: string;
  beforeValue: unknown;
  afterValue: unknown;
  formatter?: (value: unknown) => string;
}) {
  if (sameValue(payload.beforeValue, payload.afterValue)) {
    return null;
  }

  const formatter = payload.formatter ?? ((value: unknown) => formatNullable(String(value ?? "")));

  return {
    field: payload.field,
    label: payload.label,
    beforeValue: formatter(payload.beforeValue),
    afterValue: formatter(payload.afterValue),
  } satisfies ConfigChangeFieldDiff;
}

function buildGlobalPolicyPayloadFromSummary(payload: {
  academicSessionLabel: string;
  calculationModel: FeePolicySummary["calculationModel"];
  installmentSchedule: InstallmentScheduleItem[];
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  acceptedPaymentModes: Array<{ value: PaymentMode }>;
  receiptPrefix: string;
  customFeeHeads: FeeHeadDefinition[];
  notes: string | null;
}) {
  return {
    academicSessionLabel: payload.academicSessionLabel,
    calculationModel: payload.calculationModel,
    installmentSchedule: payload.installmentSchedule.map((item) => ({
      label: item.label,
      dueDateLabel: item.dueDateLabel,
    })),
    lateFeeFlatAmount: payload.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: payload.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: payload.oldStudentAcademicFeeAmount,
    acceptedPaymentModes: payload.acceptedPaymentModes.map((item) => item.value),
    receiptPrefix: payload.receiptPrefix,
    customFeeHeads: payload.customFeeHeads,
    notes: payload.notes,
  } satisfies GlobalPolicyChangePayload;
}

function buildSchoolDefaultsPayload(
  schoolDefault: SchoolFeeDefault,
  customFeeHeadsCatalog: FeeHeadDefinition[],
): SchoolDefaultsChangePayload {
  return {
    tuitionFee: schoolDefault.tuitionFee,
    transportFee: schoolDefault.transportFee,
    booksFee: schoolDefault.booksFee,
    admissionActivityMiscFee: schoolDefault.admissionActivityMiscFee,
    customFeeHeadAmounts: schoolDefault.customFeeHeadAmounts,
    studentTypeDefault: schoolDefault.studentTypeDefault,
    transportAppliesDefault: schoolDefault.transportAppliesDefault,
    notes: schoolDefault.notes,
    customFeeHeadsCatalog,
  };
}

function buildClassDefaultsPayload(
  classDefault: ClassFeeDefault,
  customFeeHeadsCatalog: FeeHeadDefinition[],
): ClassDefaultsChangePayload {
  return {
    classId: classDefault.classId,
    tuitionFee: classDefault.tuitionFee,
    transportFee: classDefault.transportFee,
    booksFee: classDefault.booksFee,
    admissionActivityMiscFee: classDefault.admissionActivityMiscFee,
    customFeeHeadAmounts: classDefault.customFeeHeadAmounts,
    studentTypeDefault: classDefault.studentTypeDefault,
    transportAppliesDefault: classDefault.transportAppliesDefault,
    notes: classDefault.notes,
    customFeeHeadsCatalog,
  };
}

function buildTransportDefaultsPayload(
  transportDefault: TransportDefault,
): TransportDefaultsChangePayload {
  return {
    routeId: transportDefault.id,
    routeCode: transportDefault.routeCode,
    routeName: transportDefault.routeName,
    defaultInstallmentAmount: transportDefault.defaultInstallmentAmount,
    annualFeeAmount: transportDefault.annualFeeAmount,
    isActive: transportDefault.isActive,
    notes: transportDefault.notes,
  };
}

function buildStudentOverridePayload(
  studentOverride: StudentFeeOverride,
  customFeeHeadsCatalog: FeeHeadDefinition[],
): StudentOverrideChangePayload {
  return {
    studentId: studentOverride.studentId,
    customTuitionFeeAmount: studentOverride.customTuitionFeeAmount,
    customTransportFeeAmount: studentOverride.customTransportFeeAmount,
    customBooksFeeAmount: studentOverride.customBooksFeeAmount,
    customAdmissionActivityMiscFeeAmount:
      studentOverride.customAdmissionActivityMiscFeeAmount,
    customFeeHeadAmounts: studentOverride.customFeeHeadAmounts,
    customLateFeeFlatAmount: studentOverride.customLateFeeFlatAmount,
    otherAdjustmentHead: studentOverride.otherAdjustmentHead,
    otherAdjustmentAmount: studentOverride.otherAdjustmentAmount,
    lateFeeWaiverAmount: studentOverride.lateFeeWaiverAmount,
    discountAmount: studentOverride.discountAmount,
    studentTypeOverride: studentOverride.studentTypeOverride,
    transportAppliesOverride: studentOverride.transportAppliesOverride,
    reason: studentOverride.reason,
    notes: studentOverride.notes,
    customFeeHeadsCatalog,
  };
}

function calculateAnnualTotal(payload: {
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
}) {
  return (
    payload.tuitionFee +
    payload.transportFee +
    payload.booksFee +
    payload.admissionActivityMiscFee +
    Object.values(payload.customFeeHeadAmounts).reduce((sum, value) => sum + value, 0)
  );
}

function buildGlobalDiffs(
  beforeValues: GlobalPolicyChangePayload,
  afterValues: GlobalPolicyChangePayload,
) {
  return [
    buildFieldDiff({
      field: "academicSessionLabel",
      label: "Academic session",
      beforeValue: beforeValues.academicSessionLabel,
      afterValue: afterValues.academicSessionLabel,
      formatter: (value) => formatNullable(String(value ?? "")),
    }),
    buildFieldDiff({
      field: "calculationModel",
      label: "Calculation model",
      beforeValue: beforeValues.calculationModel,
      afterValue: afterValues.calculationModel,
      formatter: (value) => formatNullable(String(value ?? "")),
    }),
    buildFieldDiff({
      field: "installmentSchedule",
      label: "Installment schedule",
      beforeValue: beforeValues.installmentSchedule,
      afterValue: afterValues.installmentSchedule,
      formatter: (value) =>
        formatInstallmentSchedule((value ?? []) as Array<{ label: string; dueDateLabel: string }>),
    }),
    buildFieldDiff({
      field: "lateFeeFlatAmount",
      label: "Late fee",
      beforeValue: beforeValues.lateFeeFlatAmount,
      afterValue: afterValues.lateFeeFlatAmount,
      formatter: (value) => `Rs ${Number(value ?? 0)}`,
    }),
    buildFieldDiff({
      field: "newStudentAcademicFeeAmount",
      label: "New student academic fee",
      beforeValue: beforeValues.newStudentAcademicFeeAmount,
      afterValue: afterValues.newStudentAcademicFeeAmount,
      formatter: (value) => `Rs ${Number(value ?? 0)}`,
    }),
    buildFieldDiff({
      field: "oldStudentAcademicFeeAmount",
      label: "Old student academic fee",
      beforeValue: beforeValues.oldStudentAcademicFeeAmount,
      afterValue: afterValues.oldStudentAcademicFeeAmount,
      formatter: (value) => `Rs ${Number(value ?? 0)}`,
    }),
    buildFieldDiff({
      field: "acceptedPaymentModes",
      label: "Accepted payment modes",
      beforeValue: beforeValues.acceptedPaymentModes,
      afterValue: afterValues.acceptedPaymentModes,
      formatter: (value) => formatPaymentModes((value ?? []) as PaymentMode[]),
    }),
    buildFieldDiff({
      field: "receiptPrefix",
      label: "Receipt prefix",
      beforeValue: beforeValues.receiptPrefix,
      afterValue: afterValues.receiptPrefix,
      formatter: (value) => formatNullable(String(value ?? "")),
    }),
    buildFieldDiff({
      field: "customFeeHeads",
      label: "Custom fee heads",
      beforeValue: beforeValues.customFeeHeads,
      afterValue: afterValues.customFeeHeads,
      formatter: (value) => formatFeeHeads((value ?? []) as FeeHeadDefinition[]),
    }),
    buildFieldDiff({
      field: "notes",
      label: "Policy notes",
      beforeValue: beforeValues.notes,
      afterValue: afterValues.notes,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
  ].filter((item): item is ConfigChangeFieldDiff => Boolean(item));
}

function buildSchoolDiffs(
  beforeValues: SchoolDefaultsChangePayload | null,
  afterValues: SchoolDefaultsChangePayload,
) {
  return [
    buildFieldDiff({
      field: "tuitionFee",
      label: "Tuition fee",
      beforeValue: beforeValues?.tuitionFee ?? null,
      afterValue: afterValues.tuitionFee,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "transportFee",
      label: "Transport fee",
      beforeValue: beforeValues?.transportFee ?? null,
      afterValue: afterValues.transportFee,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "booksFee",
      label: "Books fee",
      beforeValue: beforeValues?.booksFee ?? null,
      afterValue: afterValues.booksFee,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "admissionActivityMiscFee",
      label: "Admission/activity/misc fee",
      beforeValue: beforeValues?.admissionActivityMiscFee ?? null,
      afterValue: afterValues.admissionActivityMiscFee,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "customFeeHeadAmounts",
      label: "Custom fee-head amounts",
      beforeValue: beforeValues?.customFeeHeadAmounts ?? {},
      afterValue: afterValues.customFeeHeadAmounts,
      formatter: (value) => formatAmountMap((value ?? {}) as Record<string, number>),
    }),
    buildFieldDiff({
      field: "studentTypeDefault",
      label: "Student type default",
      beforeValue: beforeValues?.studentTypeDefault ?? null,
      afterValue: afterValues.studentTypeDefault,
      formatter: (value) => formatNullable(String(value ?? "")),
    }),
    buildFieldDiff({
      field: "transportAppliesDefault",
      label: "Transport applies by default",
      beforeValue: beforeValues?.transportAppliesDefault ?? null,
      afterValue: afterValues.transportAppliesDefault,
      formatter: (value) => (value == null ? "Not set" : formatBoolean(Boolean(value))),
    }),
    buildFieldDiff({
      field: "notes",
      label: "Notes",
      beforeValue: beforeValues?.notes ?? null,
      afterValue: afterValues.notes,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
  ].filter((item): item is ConfigChangeFieldDiff => Boolean(item));
}

function buildClassDiffs(
  beforeValues: ClassDefaultsChangePayload | null,
  afterValues: ClassDefaultsChangePayload,
) {
  return buildSchoolDiffs(beforeValues, afterValues);
}

function buildTransportDiffs(
  beforeValues: TransportDefaultsChangePayload | null,
  afterValues: TransportDefaultsChangePayload,
) {
  return [
    buildFieldDiff({
      field: "routeCode",
      label: "Route code",
      beforeValue: beforeValues?.routeCode ?? null,
      afterValue: afterValues.routeCode,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
    buildFieldDiff({
      field: "routeName",
      label: "Route name",
      beforeValue: beforeValues?.routeName ?? null,
      afterValue: afterValues.routeName,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
    buildFieldDiff({
      field: "defaultInstallmentAmount",
      label: "Default installment amount",
      beforeValue: beforeValues?.defaultInstallmentAmount ?? null,
      afterValue: afterValues.defaultInstallmentAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "annualFeeAmount",
      label: "Annual route fee",
      beforeValue: beforeValues?.annualFeeAmount ?? null,
      afterValue: afterValues.annualFeeAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "isActive",
      label: "Route active",
      beforeValue: beforeValues?.isActive ?? null,
      afterValue: afterValues.isActive,
      formatter: (value) => (value == null ? "Not set" : formatBoolean(Boolean(value))),
    }),
    buildFieldDiff({
      field: "notes",
      label: "Notes",
      beforeValue: beforeValues?.notes ?? null,
      afterValue: afterValues.notes,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
  ].filter((item): item is ConfigChangeFieldDiff => Boolean(item));
}

function buildStudentDiffs(
  beforeValues: StudentOverrideChangePayload | null,
  afterValues: StudentOverrideChangePayload,
) {
  return [
    buildFieldDiff({
      field: "customTuitionFeeAmount",
      label: "Custom tuition fee",
      beforeValue: beforeValues?.customTuitionFeeAmount ?? null,
      afterValue: afterValues.customTuitionFeeAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "customTransportFeeAmount",
      label: "Custom transport fee",
      beforeValue: beforeValues?.customTransportFeeAmount ?? null,
      afterValue: afterValues.customTransportFeeAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "customBooksFeeAmount",
      label: "Custom books fee",
      beforeValue: beforeValues?.customBooksFeeAmount ?? null,
      afterValue: afterValues.customBooksFeeAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "customAdmissionActivityMiscFeeAmount",
      label: "Custom admission/activity/misc fee",
      beforeValue: beforeValues?.customAdmissionActivityMiscFeeAmount ?? null,
      afterValue: afterValues.customAdmissionActivityMiscFeeAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "customFeeHeadAmounts",
      label: "Custom fee-head amounts",
      beforeValue: beforeValues?.customFeeHeadAmounts ?? {},
      afterValue: afterValues.customFeeHeadAmounts,
      formatter: (value) => formatAmountMap((value ?? {}) as Record<string, number>),
    }),
    buildFieldDiff({
      field: "customLateFeeFlatAmount",
      label: "Custom late fee",
      beforeValue: beforeValues?.customLateFeeFlatAmount ?? null,
      afterValue: afterValues.customLateFeeFlatAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "otherAdjustmentHead",
      label: "Other fee / adjustment head",
      beforeValue: beforeValues?.otherAdjustmentHead ?? null,
      afterValue: afterValues.otherAdjustmentHead,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
    buildFieldDiff({
      field: "otherAdjustmentAmount",
      label: "Other fee / adjustment amount",
      beforeValue: beforeValues?.otherAdjustmentAmount ?? null,
      afterValue: afterValues.otherAdjustmentAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "lateFeeWaiverAmount",
      label: "Late fee waiver",
      beforeValue: beforeValues?.lateFeeWaiverAmount ?? null,
      afterValue: afterValues.lateFeeWaiverAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "discountAmount",
      label: "Discount amount",
      beforeValue: beforeValues?.discountAmount ?? null,
      afterValue: afterValues.discountAmount,
      formatter: (value) => formatOptionalAmount(value == null ? null : Number(value)),
    }),
    buildFieldDiff({
      field: "studentTypeOverride",
      label: "Student type override",
      beforeValue: beforeValues?.studentTypeOverride ?? null,
      afterValue: afterValues.studentTypeOverride,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
    buildFieldDiff({
      field: "transportAppliesOverride",
      label: "Transport applies override",
      beforeValue: beforeValues?.transportAppliesOverride ?? null,
      afterValue: afterValues.transportAppliesOverride,
      formatter: (value) => (value == null ? "Not set" : formatBoolean(Boolean(value))),
    }),
    buildFieldDiff({
      field: "reason",
      label: "Reason",
      beforeValue: beforeValues?.reason ?? null,
      afterValue: afterValues.reason,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
    buildFieldDiff({
      field: "notes",
      label: "Notes",
      beforeValue: beforeValues?.notes ?? null,
      afterValue: afterValues.notes,
      formatter: (value) => formatNullable((value ?? null) as string | null),
    }),
  ].filter((item): item is ConfigChangeFieldDiff => Boolean(item));
}

function buildScopeLabel(scope: ConfigChangeScope) {
  switch (scope) {
    case "global_policy":
      return "Canonical policy";
    case "school_defaults":
      return "School defaults";
    case "class_defaults":
      return "Class defaults";
    case "transport_defaults":
      return "Transport defaults";
    case "student_override":
      return "Student override";
    default:
      return "Configuration";
  }
}

function toInstallmentScheduleItem(payload: Array<{ label: string; dueDateLabel: string }>) {
  return payload.map((item, index) => ({
    label: item.label,
    dueDateLabel: item.dueDateLabel,
    dueDate: `preview-${index}`,
  }));
}

function applyProposedPayloadToSetupData(
  scope: ConfigChangeScope,
  payload: ConfigPayloadByScope[ConfigChangeScope],
  setupData: FeeSetupPageData,
): FeeSetupPageData {
  const nextSetupData = {
    ...setupData,
    globalPolicy: {
      ...setupData.globalPolicy,
      installmentSchedule: [...setupData.globalPolicy.installmentSchedule],
      acceptedPaymentModes: [...setupData.globalPolicy.acceptedPaymentModes],
      customFeeHeads: [...setupData.globalPolicy.customFeeHeads],
    },
    schoolDefault: {
      ...setupData.schoolDefault,
      customFeeHeadAmounts: { ...setupData.schoolDefault.customFeeHeadAmounts },
    },
    classDefaults: setupData.classDefaults.map((item) => ({
      ...item,
      customFeeHeadAmounts: { ...item.customFeeHeadAmounts },
    })),
    transportDefaults: setupData.transportDefaults.map((item) => ({ ...item })),
    studentOverrides: setupData.studentOverrides.map((item) => ({
      ...item,
      customFeeHeadAmounts: { ...item.customFeeHeadAmounts },
    })),
  } satisfies FeeSetupPageData;

  if (scope === "global_policy") {
    const globalPayload = payload as GlobalPolicyChangePayload;
    nextSetupData.globalPolicy = {
      ...nextSetupData.globalPolicy,
      academicSessionLabel: globalPayload.academicSessionLabel,
      calculationModel: globalPayload.calculationModel,
      installmentSchedule: toInstallmentScheduleItem(globalPayload.installmentSchedule),
      installmentCount: globalPayload.installmentSchedule.length,
      lateFeeFlatAmount: globalPayload.lateFeeFlatAmount,
      lateFeeLabel: `Flat Rs ${globalPayload.lateFeeFlatAmount}`,
      newStudentAcademicFeeAmount: globalPayload.newStudentAcademicFeeAmount,
      oldStudentAcademicFeeAmount: globalPayload.oldStudentAcademicFeeAmount,
      acceptedPaymentModes: globalPayload.acceptedPaymentModes.map((mode) => ({
        value: mode,
        label: formatPaymentModeLabel(mode),
      })),
      receiptPrefix: globalPayload.receiptPrefix,
      customFeeHeads: globalPayload.customFeeHeads,
      notes: globalPayload.notes,
    };
  }

  if (scope === "school_defaults") {
    const schoolPayload = payload as SchoolDefaultsChangePayload;
    nextSetupData.schoolDefault = {
      ...nextSetupData.schoolDefault,
      tuitionFee: schoolPayload.tuitionFee,
      transportFee: schoolPayload.transportFee,
      booksFee: schoolPayload.booksFee,
      admissionActivityMiscFee: schoolPayload.admissionActivityMiscFee,
      customFeeHeadAmounts: schoolPayload.customFeeHeadAmounts,
      studentTypeDefault: schoolPayload.studentTypeDefault,
      transportAppliesDefault: schoolPayload.transportAppliesDefault,
      notes: schoolPayload.notes,
    };
  }

  if (scope === "class_defaults") {
    const classPayload = payload as ClassDefaultsChangePayload;
    const existingIndex = nextSetupData.classDefaults.findIndex(
      (item) => item.classId === classPayload.classId,
    );
    const classOption = nextSetupData.classOptions.find(
      (item) => item.id === classPayload.classId,
    );

    const nextClassDefault = {
      id:
        existingIndex >= 0
          ? nextSetupData.classDefaults[existingIndex].id
          : `preview-class-default-${classPayload.classId}`,
      classId: classPayload.classId,
      classLabel: classOption?.label ?? "Selected class",
      sessionLabel:
        classOption?.sessionLabel ?? nextSetupData.globalPolicy.academicSessionLabel,
      tuitionFee: classPayload.tuitionFee,
      transportFee: classPayload.transportFee,
      booksFee: classPayload.booksFee,
      admissionActivityMiscFee: classPayload.admissionActivityMiscFee,
      customFeeHeadAmounts: classPayload.customFeeHeadAmounts,
      annualTotal: calculateAnnualTotal(classPayload),
      studentTypeDefault: classPayload.studentTypeDefault,
      transportAppliesDefault: classPayload.transportAppliesDefault,
      notes: classPayload.notes,
      updatedAt:
        existingIndex >= 0
          ? nextSetupData.classDefaults[existingIndex].updatedAt
          : new Date().toISOString(),
    } satisfies ClassFeeDefault;

    if (existingIndex >= 0) {
      nextSetupData.classDefaults[existingIndex] = nextClassDefault;
    } else {
      nextSetupData.classDefaults = [nextClassDefault, ...nextSetupData.classDefaults];
    }
  }

  if (scope === "transport_defaults") {
    const transportPayload = payload as TransportDefaultsChangePayload;
    const existingIndex =
      transportPayload.routeId === null
        ? -1
        : nextSetupData.transportDefaults.findIndex(
            (item) => item.id === transportPayload.routeId,
          );

    const nextTransportDefault = {
      id:
        transportPayload.routeId ??
        `preview-route-${transportPayload.routeCode ?? transportPayload.routeName}`,
      routeCode: transportPayload.routeCode,
      routeName: transportPayload.routeName,
      defaultInstallmentAmount: transportPayload.defaultInstallmentAmount,
      annualFeeAmount: transportPayload.annualFeeAmount,
      isActive: transportPayload.isActive,
      notes: transportPayload.notes,
      updatedAt:
        existingIndex >= 0
          ? nextSetupData.transportDefaults[existingIndex].updatedAt
          : new Date().toISOString(),
    } satisfies TransportDefault;

    if (existingIndex >= 0) {
      nextSetupData.transportDefaults[existingIndex] = nextTransportDefault;
    } else {
      nextSetupData.transportDefaults = [nextTransportDefault, ...nextSetupData.transportDefaults];
    }
  }

  if (scope === "student_override") {
    const studentPayload = payload as StudentOverrideChangePayload;
    const existingIndex = nextSetupData.studentOverrides.findIndex(
      (item) => item.studentId === studentPayload.studentId,
    );
    const studentOption = nextSetupData.studentOptions.find(
      (item) => item.id === studentPayload.studentId,
    );

    const nextStudentOverride = {
      id:
        existingIndex >= 0
          ? nextSetupData.studentOverrides[existingIndex].id
          : `preview-override-${studentPayload.studentId}`,
      studentId: studentPayload.studentId,
      studentLabel: studentOption?.label ?? "Selected student",
      classLabel: studentOption?.classLabel ?? "Selected class",
      feeSettingId:
        existingIndex >= 0
          ? nextSetupData.studentOverrides[existingIndex].feeSettingId
          : "preview-fee-setting",
      customTuitionFeeAmount: studentPayload.customTuitionFeeAmount,
      customTransportFeeAmount: studentPayload.customTransportFeeAmount,
      customBooksFeeAmount: studentPayload.customBooksFeeAmount,
      customAdmissionActivityMiscFeeAmount:
        studentPayload.customAdmissionActivityMiscFeeAmount,
      customFeeHeadAmounts: studentPayload.customFeeHeadAmounts,
      customLateFeeFlatAmount: studentPayload.customLateFeeFlatAmount,
      otherAdjustmentHead: studentPayload.otherAdjustmentHead,
      otherAdjustmentAmount: studentPayload.otherAdjustmentAmount,
      lateFeeWaiverAmount: studentPayload.lateFeeWaiverAmount,
      discountAmount: studentPayload.discountAmount,
      studentTypeOverride: studentPayload.studentTypeOverride,
      transportAppliesOverride: studentPayload.transportAppliesOverride,
      reason: studentPayload.reason,
      notes: studentPayload.notes,
      updatedAt:
        existingIndex >= 0
          ? nextSetupData.studentOverrides[existingIndex].updatedAt
          : new Date().toISOString(),
    } satisfies StudentFeeOverride;

    if (existingIndex >= 0) {
      nextSetupData.studentOverrides[existingIndex] = nextStudentOverride;
    } else {
      nextSetupData.studentOverrides = [nextStudentOverride, ...nextSetupData.studentOverrides];
    }
  }

  return nextSetupData;
}

async function loadScopedStudentIds(
  scope: ConfigChangeScope,
  payload: ConfigPayloadByScope[ConfigChangeScope],
  setupData: FeeSetupPageData,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("id, class_id, transport_route_id, class_ref:classes(session_label)")
    .eq("status", "active");

  if (error) {
    throw new Error(`Unable to load student scope for impact preview: ${error.message}`);
  }

  const sessionStudents = ((data ?? []) as SessionStudentRow[]).filter((item) => {
    const classRef = toSingleRecord(item.class_ref);
    return classRef?.session_label === setupData.globalPolicy.academicSessionLabel;
  });

  if (scope === "global_policy") {
    return sessionStudents.map((item) => item.id);
  }

  if (scope === "school_defaults") {
    const classIdsWithDefaults = new Set(setupData.classDefaults.map((item) => item.classId));
    return sessionStudents
      .filter((item) => !classIdsWithDefaults.has(item.class_id))
      .map((item) => item.id);
  }

  if (scope === "class_defaults") {
    const classPayload = payload as ClassDefaultsChangePayload;
    return sessionStudents
      .filter((item) => item.class_id === classPayload.classId)
      .map((item) => item.id);
  }

  if (scope === "transport_defaults") {
    const transportPayload = payload as TransportDefaultsChangePayload;

    if (!transportPayload.routeId) {
      return [];
    }

    return sessionStudents
      .filter((item) => item.transport_route_id === transportPayload.routeId)
      .map((item) => item.id);
  }

  const studentPayload = payload as StudentOverrideChangePayload;
  return sessionStudents
    .filter((item) => item.id === studentPayload.studentId)
    .map((item) => item.id);
}

function buildImpactPreview(payload: {
  scope: ConfigChangeScope;
  targetLabel: string;
  changedFields: ConfigChangeFieldDiff[];
  detailedPreview: Awaited<ReturnType<typeof previewLedgerGenerationDetailed>>;
}): ConfigChangeImpactPreview {
  const blockedFullyPaidInstallments = payload.detailedPreview.blockedInstallmentsForReview.filter(
    (item) => item.reasonCode === "fully_paid",
  ).length;
  const blockedPartiallyPaidInstallments =
    payload.detailedPreview.blockedInstallmentsForReview.filter(
      (item) => item.reasonCode === "partially_paid",
    ).length;
  const blockedAdjustedInstallments = payload.detailedPreview.blockedInstallmentsForReview.filter(
    (item) => item.reasonCode === "adjustment_posted",
  ).length;

  return {
    scope: payload.scope,
    scopeLabel: buildScopeLabel(payload.scope),
    targetLabel: payload.targetLabel,
    changedFields: payload.changedFields,
    studentsInScope: payload.detailedPreview.scopedStudents,
    studentsAffected: payload.detailedPreview.affectedStudents,
    installmentsToInsert: payload.detailedPreview.installmentsToInsert,
    installmentsToUpdate: payload.detailedPreview.installmentsToUpdate,
    installmentsToCancel: payload.detailedPreview.installmentsToCancel,
    blockedInstallments: payload.detailedPreview.lockedInstallments,
    blockedFullyPaidInstallments,
    blockedPartiallyPaidInstallments,
    blockedAdjustedInstallments,
    updatesLimitedToFutureUnpaid: true,
    rowsMarkedForReview: payload.detailedPreview.lockedInstallments,
  };
}

function buildScopeContext(
  scope: ConfigChangeScope,
  payload: ConfigPayloadByScope[ConfigChangeScope],
  setupData: FeeSetupPageData,
): ScopeContext {
  if (scope === "global_policy") {
    const globalPayload = payload as GlobalPolicyChangePayload;
    const beforePayload = buildGlobalPolicyPayloadFromSummary(setupData.globalPolicy);
    const changedFields = buildGlobalDiffs(beforePayload, globalPayload);

    return {
      targetLabel: "Canonical fee policy",
      targetRef: setupData.globalPolicy.id,
      beforeSnapshot: {
        exists: Boolean(setupData.globalPolicy.id),
        values: beforePayload,
      },
      proposedPayload: globalPayload,
      projectedSetupData: applyProposedPayloadToSetupData(scope, globalPayload, setupData),
      changedFields,
    };
  }

  if (scope === "school_defaults") {
    const schoolPayload = payload as SchoolDefaultsChangePayload;
    const beforePayload = buildSchoolDefaultsPayload(
      setupData.schoolDefault,
      setupData.globalPolicy.customFeeHeads,
    );
    const changedFields = buildSchoolDiffs(beforePayload, schoolPayload);

    return {
      targetLabel: "School-wide defaults",
      targetRef: setupData.schoolDefault.id,
      beforeSnapshot: {
        exists: Boolean(setupData.schoolDefault.id),
        values: beforePayload,
      },
      proposedPayload: schoolPayload,
      projectedSetupData: applyProposedPayloadToSetupData(scope, schoolPayload, setupData),
      changedFields,
    };
  }

  if (scope === "class_defaults") {
    const classPayload = payload as ClassDefaultsChangePayload;
    const existing =
      setupData.classDefaults.find((item) => item.classId === classPayload.classId) ?? null;
    const beforePayload = existing
      ? buildClassDefaultsPayload(existing, setupData.globalPolicy.customFeeHeads)
      : null;
    const classOption = setupData.classOptions.find((item) => item.id === classPayload.classId);
    const changedFields = buildClassDiffs(beforePayload, classPayload);

    return {
      targetLabel: classOption?.label ?? "Selected class",
      targetRef: classPayload.classId,
      beforeSnapshot: {
        exists: Boolean(existing),
        values: beforePayload,
      },
      proposedPayload: classPayload,
      projectedSetupData: applyProposedPayloadToSetupData(scope, classPayload, setupData),
      changedFields,
    };
  }

  if (scope === "transport_defaults") {
    const transportPayload = payload as TransportDefaultsChangePayload;
    const existing = transportPayload.routeId
      ? (setupData.transportDefaults.find((item) => item.id === transportPayload.routeId) ?? null)
      : null;
    const beforePayload = existing ? buildTransportDefaultsPayload(existing) : null;
    const changedFields = buildTransportDiffs(beforePayload, transportPayload);

    return {
      targetLabel: transportPayload.routeName,
      targetRef: transportPayload.routeId,
      beforeSnapshot: {
        exists: Boolean(existing),
        values: beforePayload,
      },
      proposedPayload: transportPayload,
      projectedSetupData: applyProposedPayloadToSetupData(scope, transportPayload, setupData),
      changedFields,
    };
  }

  const studentPayload = payload as StudentOverrideChangePayload;
  const existing =
    setupData.studentOverrides.find((item) => item.studentId === studentPayload.studentId) ?? null;
  const beforePayload = existing
    ? buildStudentOverridePayload(existing, setupData.globalPolicy.customFeeHeads)
    : null;
  const studentOption = setupData.studentOptions.find((item) => item.id === studentPayload.studentId);
  const changedFields = buildStudentDiffs(beforePayload, studentPayload);

  return {
    targetLabel: studentOption?.label ?? "Selected student",
    targetRef: studentPayload.studentId,
    beforeSnapshot: {
      exists: Boolean(existing),
      values: beforePayload,
    },
    proposedPayload: studentPayload,
    projectedSetupData: applyProposedPayloadToSetupData(scope, studentPayload, setupData),
    changedFields,
  };
}

function asScopePayload<S extends ConfigChangeScope>(
  payload: ConfigPayloadByScope[ConfigChangeScope],
) {
  return payload as ConfigPayloadByScope[S];
}

async function insertBlockedRows(
  batchId: string,
  blockedRows: BlockedInstallmentForReview[],
) {
  if (blockedRows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const rows = blockedRows.map((item) => ({
    batch_id: batchId,
    student_id: item.studentId,
    installment_id: item.installmentId,
    installment_label: item.installmentLabel,
    due_date: item.dueDate,
    amount_due: item.amountDue,
    paid_amount: item.paidAmount,
    adjustment_amount: item.adjustmentAmount,
    outstanding_amount: item.outstandingAmount,
    reason_code: item.reasonCode,
    reason_label: item.reasonLabel,
    action_needed: item.actionNeeded,
  }));

  const { error } = await supabase
    .from("config_change_blocked_installments")
    .insert(rows);

  if (error) {
    throw new Error(`Unable to record blocked rows for review: ${error.message}`);
  }
}

async function applyPayload(
  scope: ConfigChangeScope,
  payload: ConfigPayloadByScope[ConfigChangeScope],
) {
  if (scope === "global_policy") {
    const globalPayload = asScopePayload<"global_policy">(payload);
    await upsertGlobalFeePolicy({
      academicSessionLabel: globalPayload.academicSessionLabel,
      calculationModel: globalPayload.calculationModel,
      installmentSchedule: globalPayload.installmentSchedule,
      lateFeeFlatAmount: globalPayload.lateFeeFlatAmount,
      newStudentAcademicFeeAmount: globalPayload.newStudentAcademicFeeAmount,
      oldStudentAcademicFeeAmount: globalPayload.oldStudentAcademicFeeAmount,
      acceptedPaymentModes: globalPayload.acceptedPaymentModes,
      receiptPrefix: globalPayload.receiptPrefix,
      customFeeHeads: globalPayload.customFeeHeads,
      notes: globalPayload.notes,
    });
    return;
  }

  if (scope === "school_defaults") {
    const schoolPayload = asScopePayload<"school_defaults">(payload);
    await upsertSchoolFeeDefaults({
      tuitionFee: schoolPayload.tuitionFee,
      transportFee: schoolPayload.transportFee,
      booksFee: schoolPayload.booksFee,
      admissionActivityMiscFee: schoolPayload.admissionActivityMiscFee,
      customFeeHeadAmounts: schoolPayload.customFeeHeadAmounts,
      customFeeHeads: schoolPayload.customFeeHeadsCatalog,
      studentTypeDefault: schoolPayload.studentTypeDefault,
      transportAppliesDefault: schoolPayload.transportAppliesDefault,
      notes: schoolPayload.notes,
    });
    return;
  }

  if (scope === "class_defaults") {
    const classPayload = asScopePayload<"class_defaults">(payload);
    await upsertClassFeeDefault({
      classId: classPayload.classId,
      tuitionFee: classPayload.tuitionFee,
      transportFee: classPayload.transportFee,
      booksFee: classPayload.booksFee,
      admissionActivityMiscFee: classPayload.admissionActivityMiscFee,
      customFeeHeadAmounts: classPayload.customFeeHeadAmounts,
      customFeeHeads: classPayload.customFeeHeadsCatalog,
      studentTypeDefault: classPayload.studentTypeDefault,
      transportAppliesDefault: classPayload.transportAppliesDefault,
      notes: classPayload.notes,
    });
    return;
  }

  if (scope === "transport_defaults") {
    const transportPayload = asScopePayload<"transport_defaults">(payload);
    await upsertTransportDefault({
      routeId: transportPayload.routeId,
      routeCode: transportPayload.routeCode,
      routeName: transportPayload.routeName,
      defaultInstallmentAmount: transportPayload.defaultInstallmentAmount,
      annualFeeAmount: transportPayload.annualFeeAmount,
      isActive: transportPayload.isActive,
      notes: transportPayload.notes,
    });
    return;
  }

  const studentPayload = asScopePayload<"student_override">(payload);
  await upsertStudentFeeOverride({
    studentId: studentPayload.studentId,
    customTuitionFeeAmount: studentPayload.customTuitionFeeAmount,
    customTransportFeeAmount: studentPayload.customTransportFeeAmount,
    customBooksFeeAmount: studentPayload.customBooksFeeAmount,
    customAdmissionActivityMiscFeeAmount:
      studentPayload.customAdmissionActivityMiscFeeAmount,
    customFeeHeadAmounts: studentPayload.customFeeHeadAmounts,
    customFeeHeads: studentPayload.customFeeHeadsCatalog,
    customLateFeeFlatAmount: studentPayload.customLateFeeFlatAmount,
    otherAdjustmentHead: studentPayload.otherAdjustmentHead,
    otherAdjustmentAmount: studentPayload.otherAdjustmentAmount,
    lateFeeWaiverAmount: studentPayload.lateFeeWaiverAmount,
    discountAmount: studentPayload.discountAmount,
    studentTypeOverride: studentPayload.studentTypeOverride,
    transportAppliesOverride: studentPayload.transportAppliesOverride,
    reason: studentPayload.reason,
    notes: studentPayload.notes,
  });
}

export async function createConfigChangePreview<S extends ConfigChangeScope>(payload: {
  scope: S;
  proposedPayload: ConfigPayloadByScope[S];
}) {
  const setupData = await getFeeSetupPageData();
  const context = buildScopeContext(payload.scope, payload.proposedPayload, setupData);

  if (context.changedFields.length === 0) {
    throw new Error("No setting changes detected. Update at least one field before previewing.");
  }

  const scopedStudentIds = await loadScopedStudentIds(
    payload.scope,
    payload.proposedPayload,
    context.projectedSetupData,
  );
  const detailedPreview = await previewLedgerGenerationDetailed({
    setupData: context.projectedSetupData,
    scopedStudentIds,
  });
  const impactPreview = buildImpactPreview({
    scope: payload.scope,
    targetLabel: context.targetLabel,
    changedFields: context.changedFields,
    detailedPreview,
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_change_batches")
    .insert({
      change_scope: payload.scope,
      target_ref: context.targetRef,
      target_label: context.targetLabel,
      status: "preview_ready",
      before_payload: context.beforeSnapshot,
      proposed_payload: context.proposedPayload,
      changed_fields: context.changedFields,
      preview_summary: impactPreview,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save impact preview: ${error.message}`);
  }

  return {
    batchId: data.id as string,
    preview: impactPreview,
  };
}

export async function applyConfigChangeBatch(batchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_change_batches")
    .select("id, change_scope, status, before_payload, proposed_payload, preview_summary")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load configuration change batch: ${error.message}`);
  }

  if (!data) {
    throw new Error("Configuration change batch was not found.");
  }

  const batch = data as ConfigChangeBatchRow;

  if (batch.status !== "preview_ready") {
    throw new Error("This preview can no longer be applied. Create a new preview and try again.");
  }

  const scope = batch.change_scope;
  const proposedPayload = batch.proposed_payload as ConfigPayloadByScope[ConfigChangeScope];
  const previewSummary = (batch.preview_summary ?? null) as ConfigChangeImpactPreview | null;

  const currentSetupData = await getFeeSetupPageData();
  const currentContext = buildScopeContext(scope, proposedPayload, currentSetupData);

  if (!sameValue(currentContext.beforeSnapshot, batch.before_payload)) {
    await supabase
      .from("config_change_batches")
      .update({
        status: "stale",
        apply_notes:
          "Configuration changed after preview. Run a fresh preview before applying.",
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    throw new Error(
      "Another configuration update was saved after this preview. Please run preview again before applying.",
    );
  }

  try {
    await applyPayload(scope, proposedPayload);

    const updatedSetupData = await getFeeSetupPageData();
    const scopedStudentIds = await loadScopedStudentIds(
      scope,
      proposedPayload,
      updatedSetupData,
    );
    const ledgerResult = await generateSessionLedgersAction({
      scopedStudentIds,
    });

    await insertBlockedRows(batch.id, ledgerResult.blockedInstallmentsForReview);

    const applySummary = {
      studentsInScope: ledgerResult.scopedStudents,
      studentsAffected: ledgerResult.affectedStudents,
      installmentsToInsert: ledgerResult.installmentsToInsert,
      installmentsToUpdate: ledgerResult.installmentsToUpdate,
      installmentsToCancel: ledgerResult.installmentsToCancel,
      blockedInstallments: ledgerResult.lockedInstallments,
      blockedFullyPaidInstallments: ledgerResult.blockedInstallmentsForReview.filter(
        (item) => item.reasonCode === "fully_paid",
      ).length,
      blockedPartiallyPaidInstallments: ledgerResult.blockedInstallmentsForReview.filter(
        (item) => item.reasonCode === "partially_paid",
      ).length,
      blockedAdjustedInstallments: ledgerResult.blockedInstallmentsForReview.filter(
        (item) => item.reasonCode === "adjustment_posted",
      ).length,
    } satisfies Record<string, number>;

    const { error: updateError } = await supabase
      .from("config_change_batches")
      .update({
        status: "applied",
        apply_summary: applySummary,
        applied_at: new Date().toISOString(),
        apply_notes: "Applied safely: only unpaid rows were updated. Locked rows were marked for review.",
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    if (updateError) {
      throw new Error(`Configuration applied but batch log update failed: ${updateError.message}`);
    }

    return {
      preview: previewSummary,
      applied: applySummary,
      message: `Applied ${currentContext.targetLabel}: ${ledgerResult.installmentsToInsert} inserts, ${ledgerResult.installmentsToUpdate} updates, ${ledgerResult.installmentsToCancel} cancellations, and ${ledgerResult.lockedInstallments} blocked rows marked for review.`,
    };
  } catch (errorValue) {
    const message =
      errorValue instanceof Error
        ? errorValue.message
        : "Configuration apply failed after preview.";

    await supabase
      .from("config_change_batches")
      .update({
        status: "failed",
        apply_notes: message,
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    throw errorValue;
  }
}
