import { normalizeFeeHeadId } from "@/lib/config/fee-rules";
import type {
  FeeHeadApplicationType,
  FeeHeadChargeFrequency,
  FeeHeadDefinition,
} from "@/lib/fees/types";

export const DEFAULT_FEE_HEAD_METADATA = {
  isRefundable: false,
  chargeFrequency: "one_time",
  isMandatory: true,
  includeInWorkbookCalculation: false,
} as const satisfies Pick<
  FeeHeadDefinition,
  | "isRefundable"
  | "chargeFrequency"
  | "isMandatory"
  | "includeInWorkbookCalculation"
>;

function toWholeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

export function normalizeFeeHeadApplicationType(value: unknown): FeeHeadApplicationType {
  switch (value) {
    case "installment_1_only":
    case "split_across_installments":
    case "optional_per_student":
      return value;
    default:
      return "annual_fixed";
  }
}

export function normalizeFeeHeadChargeFrequency(value: unknown): FeeHeadChargeFrequency {
  return value === "recurring" ? "recurring" : "one_time";
}

export function normalizeFeeHeadDefinition(entry: unknown): FeeHeadDefinition | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";

  if (!label) {
    return null;
  }

  const rawId = typeof record.id === "string" ? record.id : label;
  const id = normalizeFeeHeadId(rawId) || normalizeFeeHeadId(label);

  if (!id) {
    return null;
  }

  return {
    id,
    label,
    amount: toWholeNumber(record.amount),
    applicationType: normalizeFeeHeadApplicationType(record.applicationType),
    isRefundable: record.isRefundable === true,
    chargeFrequency: normalizeFeeHeadChargeFrequency(record.chargeFrequency),
    isMandatory: record.isMandatory !== false,
    includeInWorkbookCalculation: record.includeInWorkbookCalculation === true,
    isActive: record.isActive !== false,
    notes: typeof record.notes === "string" ? record.notes.trim() || null : null,
  };
}

export function parseFeeHeadCatalog(value: unknown): FeeHeadDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeFeeHeadDefinition(entry))
    .filter((entry): entry is FeeHeadDefinition => {
      if (!entry || seen.has(entry.id)) {
        return false;
      }

      seen.add(entry.id);
      return true;
    });
}

export function serializeFeeHeadDefinition(item: FeeHeadDefinition) {
  return {
    id: item.id,
    label: item.label,
    amount: item.amount,
    applicationType: item.applicationType,
    isRefundable: item.isRefundable,
    chargeFrequency: item.chargeFrequency,
    isMandatory: item.isMandatory,
    includeInWorkbookCalculation: item.includeInWorkbookCalculation,
    isActive: item.isActive,
    notes: item.notes,
  };
}
