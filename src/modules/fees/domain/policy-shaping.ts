import "server-only";

import type { PaymentMode } from "@/platform/db/types";
import {
  buildDefaultFeePolicySummary,
  buildInstallmentDueDate,
  formatPaymentModeLabel,
  normalizeFeeHeadId,
} from "@/platform/config/fee-rules";
import {
  DEFAULT_FEE_HEAD_METADATA,
  normalizeFeeHeadDefinition,
  parseFeeHeadCatalog,
} from "@/modules/fees/domain/fee-heads";
import type { FeeHeadDefinition, FeePolicySnapshot, FeePolicySummary, FeeSetupStudentOption, InstallmentScheduleItem, SchoolFeeDefault } from "@/modules/fees/domain/types";
import type { GlobalPolicyRow, StudentRow } from "@/modules/fees/domain/policy-rows";

export function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function buildClassLabel(value: {
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

export function titleCaseFromKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function toWholeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

export function parseCustomAmountMap(value: Record<string, unknown> | null) {
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

export function parseCustomLabelMap(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, raw]) => {
    if (typeof raw !== "string") {
      return acc;
    }

    const label = raw.trim();
    if (key.trim() && label) {
      acc[key] = label;
    }

    return acc;
  }, {});
}

export function normalizeCatalog(
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

export function toFeePolicySummary(
  row: GlobalPolicyRow,
  defaults = buildDefaultFeePolicySummary(),
  activeSessionLabel?: string | null,
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
    academicFeeDistribution:
      row.academic_fee_distribution === "equal" ? "equal" : "first_only",
    acceptedPaymentModes: (
      row.accepted_payment_modes ?? defaults.acceptedPaymentModes.map((item) => item.value)
    ).map((value) => ({
      value,
      label: formatPaymentModeLabel(value),
    })),
    receiptPrefix: row.receipt_prefix?.trim() || defaults.receiptPrefix,
    customFeeHeads: parseFeeHeadCatalog(row.custom_fee_heads),
    notes: row.notes ?? defaults.notes,
    isActive:
      typeof activeSessionLabel === "string" &&
      activeSessionLabel.trim().length > 0 &&
      academicSessionLabel.trim().toLowerCase() === activeSessionLabel.trim().toLowerCase(),
    updatedAt: row.updated_at,
  };
}

export function parseInstallmentSchedule(
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

export function createEmptySchoolDefault(): SchoolFeeDefault {
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

export function calculateAnnualTotal(
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

export function snapshotToSummary(snapshot: FeePolicySnapshot): FeePolicySummary {
  return {
    id: snapshot.id,
    academicSessionLabel: snapshot.academicSessionLabel,
    calculationModel: snapshot.calculationModel,
    installmentCount: snapshot.installmentCount,
    installmentSchedule: snapshot.installmentSchedule,
    lateFeeFlatAmount: snapshot.lateFeeFlatAmount,
    lateFeeLabel: snapshot.lateFeeLabel,
    newStudentAcademicFeeAmount: snapshot.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: snapshot.oldStudentAcademicFeeAmount,
    academicFeeDistribution: snapshot.academicFeeDistribution,
    acceptedPaymentModes: snapshot.acceptedPaymentModes,
    receiptPrefix: snapshot.receiptPrefix,
    customFeeHeads: snapshot.customFeeHeads,
    notes: snapshot.notes,
  };
}

export function buildStudentOptions(studentRows: StudentRow[]): FeeSetupStudentOption[] {
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

export function buildPolicyPayload(payload: {
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
    academic_fee_distribution: payload.academicFeeDistribution,
    custom_fee_heads: dedupedCatalog,
    accepted_payment_modes: dedupedModes,
    receipt_prefix: payload.receiptPrefix.trim(),
    notes: payload.notes,
    is_active: true,
  };
}

export /**
 * @param allowUncatalogedHeads Student-level named fee heads ("Uniform adj.")
 *   are ad-hoc by design and never appear in the school-wide catalog on
 *   `fee_policy_configs.custom_fee_heads`. Without this, every such head is
 *   silently filtered out and the override row is written with `{}`.
 */
function buildOtherFeeHeadPayload(
  customFeeHeads: FeeHeadDefinition[],
  amounts: Record<string, number>,
  allowUncatalogedHeads = false,
) {
  const allowedIds = new Set(customFeeHeads.map((item) => item.id));

  return Object.entries(amounts).reduce<Record<string, number>>((acc, [id, amount]) => {
    const normalizedId = normalizeFeeHeadId(id);
    // amount <= 0 is dropped on purpose: v_workbook_student_financials sums
    // this map with ::integer and would happily count a negative, while the TS
    // resolver drops it — a silent SQL/TS divergence. Reductions belong in the
    // explicitly signed other_adjustment_amount column instead.
    if (!normalizedId || amount <= 0) {
      return acc;
    }

    if (!allowUncatalogedHeads && !allowedIds.has(normalizedId)) {
      return acc;
    }

    acc[normalizedId] = amount;
    return acc;
  }, {});
}

export /**
 * Columns on student_fee_overrides that were added by later migrations. A build
 * can reach an environment whose migration has not run yet, so writes drop these
 * and retry rather than failing outright.
 */
const OPTIONAL_OVERRIDE_COLUMNS = [
  "notes",
  "custom_other_fee_head_labels",
] as const;

export function stripMissingOverrideColumn(
  values: Record<string, unknown>,
  errorMessage: string,
): Record<string, unknown> | null {
  for (const column of OPTIONAL_OVERRIDE_COLUMNS) {
    if (!(column in values)) {
      continue;
    }

    // Postgres says `column "x" of relation ...`; PostgREST's schema cache says
    // `Could not find the 'x' column`. Match either without matching a bare
    // occurrence of a common word like "notes" elsewhere in the message.
    const mentionsColumn =
      errorMessage.includes(`student_fee_overrides.${column}`) ||
      errorMessage.includes(`'${column}' column`) ||
      errorMessage.includes(`"${column}"`);

    if (mentionsColumn) {
      const next = { ...values };
      delete next[column];
      return next;
    }
  }

  return null;
}

export /** Keeps the label map in lockstep with whatever amounts actually got written. */
function buildOtherFeeHeadLabelPayload(
  amountPayload: Record<string, number>,
  labels: Record<string, unknown> | null | undefined,
) {
  const normalized = parseCustomLabelMap(labels);

  const result = Object.keys(amountPayload).reduce<Record<string, string>>(
    (acc, id) => {
      const label = normalized[id];
      if (label) {
        acc[id] = label;
      }
      return acc;
    },
    {},
  );

  return Object.keys(result).length > 0 ? result : null;
}

