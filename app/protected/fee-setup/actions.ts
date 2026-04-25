"use server";

import { revalidatePath } from "next/cache";

import {
  applyWorkbookFeeSetupBatch,
  createWorkbookFeeSetupPreview,
} from "@/lib/fees/workbook-setup-change";
import { upsertConventionalDiscountPolicies } from "@/lib/fees/conventional-discounts";
import type { WorkbookFeeSetupFormPayload } from "@/lib/fees/workbook-setup";
import {
  DEFAULT_FEE_HEAD_METADATA,
  normalizeFeeHeadChargeFrequency,
} from "@/lib/fees/fee-heads";
import type {
  ConventionalDiscountCalculationType,
  FeeHeadApplicationType,
  FeeHeadChargeFrequency,
  FeeSetupActionState,
} from "@/lib/fees/types";
import { requireStaffPermission } from "@/lib/supabase/session";
import { revalidateCoreFinancePaths } from "@/lib/system-sync/finance-sync";

function parseRequiredString(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function parseRequiredNonNegativeInt(value: FormDataEntryValue | null, label: string) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${label} must be a whole number greater than or equal to 0.`);
  }

  return numeric;
}

function parseDateList(formData: FormData, fieldName: string) {
  const values = formData
    .getAll(fieldName)
    .map((value) => value.toString().trim());

  if (values.length === 0) {
    throw new Error("Fee Setup requires at least 1 installment due date.");
  }

  values.forEach((value, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`Installment ${index + 1} due date is invalid.`);
    }
  });

  return values;
}

function parseRepeatedRows(
  formData: FormData,
  labelField: string,
  valueField: string,
  valueLabel: string,
) {
  const labels = formData.getAll(labelField).map((value) => value.toString().trim());
  const values = formData.getAll(valueField);

  if (labels.length !== values.length) {
    throw new Error("Fee Setup rows are out of sync. Refresh the page and try again.");
  }

  return labels.map((label, index) => ({
    label,
    value: parseRequiredNonNegativeInt(values[index] ?? null, `${label} ${valueLabel}`),
  }));
}

function parseFeeHeadApplicationType(value: FormDataEntryValue | null): FeeHeadApplicationType {
  const normalized = (value ?? "").toString().trim();

  switch (normalized) {
    case "installment_1_only":
    case "split_across_installments":
    case "optional_per_student":
      return normalized;
    default:
      return "annual_fixed";
  }
}

function parseFeeHeadChargeFrequency(value: FormDataEntryValue | null): FeeHeadChargeFrequency {
  return normalizeFeeHeadChargeFrequency((value ?? "").toString().trim());
}

function parseYesNo(value: FormDataEntryValue | null, defaultValue: boolean) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    return defaultValue;
  }

  return normalized === "yes";
}

function parseFeeHeadRows(formData: FormData) {
  const ids = formData.getAll("feeHeadId").map((value) => value.toString().trim());
  const labels = formData.getAll("feeHeadLabel").map((value) => value.toString().trim());
  const amounts = formData.getAll("feeHeadAmount");
  const applicationTypes = formData.getAll("feeHeadApplicationType");
  const refundableValues = formData.getAll("feeHeadIsRefundable");
  const chargeFrequencies = formData.getAll("feeHeadChargeFrequency");
  const mandatoryValues = formData.getAll("feeHeadIsMandatory");
  const workbookCalculationValues = formData.getAll("feeHeadIncludeInWorkbookCalculation");
  const activeValues = formData.getAll("feeHeadIsActive");
  const notes = formData.getAll("feeHeadNotes").map((value) => value.toString().trim());

  if (
    ids.length !== labels.length ||
    labels.length !== amounts.length ||
    labels.length !== applicationTypes.length ||
    labels.length !== refundableValues.length ||
    labels.length !== chargeFrequencies.length ||
    labels.length !== mandatoryValues.length ||
    labels.length !== workbookCalculationValues.length ||
    labels.length !== activeValues.length ||
    labels.length !== notes.length
  ) {
    throw new Error("Fee head rows are out of sync. Refresh the page and try again.");
  }

  return labels
    .map((label, index) => {
      const hasAnyValue =
        label ||
        ids[index] ||
        (amounts[index] ?? "").toString().trim() ||
        (notes[index] ?? "").trim();

      if (!hasAnyValue) {
        return null;
      }

      return {
        id: ids[index] || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        label: parseRequiredString(labels[index] ?? null, "Fee head label"),
        amount: parseRequiredNonNegativeInt(amounts[index] ?? null, `${label} amount`),
        applicationType: parseFeeHeadApplicationType(applicationTypes[index] ?? null),
        isRefundable: parseYesNo(
          refundableValues[index] ?? null,
          DEFAULT_FEE_HEAD_METADATA.isRefundable,
        ),
        chargeFrequency: parseFeeHeadChargeFrequency(chargeFrequencies[index] ?? null),
        isMandatory: parseYesNo(
          mandatoryValues[index] ?? null,
          DEFAULT_FEE_HEAD_METADATA.isMandatory,
        ),
        includeInWorkbookCalculation: parseYesNo(
          workbookCalculationValues[index] ?? null,
          DEFAULT_FEE_HEAD_METADATA.includeInWorkbookCalculation,
        ),
        isActive: parseYesNo(activeValues[index] ?? null, true),
        notes: notes[index] || null,
      };
    })
    .filter((row) => Boolean(row)) as WorkbookFeeSetupFormPayload["customFeeHeads"];
}

function parseConventionalDiscountRows(formData: FormData) {
  const ids = formData.getAll("conventionalPolicyId").map((value) => value.toString().trim());
  const codes = formData.getAll("conventionalPolicyCode").map((value) => value.toString().trim());
  const names = formData.getAll("conventionalPolicyName").map((value) => value.toString().trim());
  const types = formData
    .getAll("conventionalPolicyCalculationType")
    .map((value) => value.toString().trim());
  const fixedAmounts = formData.getAll("conventionalPolicyFixedAmount");
  const percentages = formData.getAll("conventionalPolicyPercentage");
  const activeValues = formData
    .getAll("conventionalPolicyIsActive")
    .map((value) => value.toString().trim());

  return codes.map((code, index) => {
    const calculationType = (
      ["tuition_zero", "tuition_percentage", "tuition_fixed_amount"].includes(
        types[index] ?? "",
      )
        ? types[index]
        : "tuition_zero"
    ) as ConventionalDiscountCalculationType;
    const fixedValue = Number((fixedAmounts[index] ?? "").toString().trim());
    const percentageValue = Number((percentages[index] ?? "").toString().trim());

    return {
      id: ids[index] || null,
      code,
      displayName: parseRequiredString(names[index] ?? null, "Discount name"),
      calculationType,
      fixedTuitionAmount:
        calculationType === "tuition_fixed_amount" && Number.isFinite(fixedValue)
          ? Math.max(0, Math.trunc(fixedValue))
          : null,
      percentage:
        calculationType === "tuition_percentage" && Number.isFinite(percentageValue)
          ? Math.max(0, Math.min(100, percentageValue))
          : null,
      isActive: activeValues[index] !== "no",
      sortOrder: index + 1,
    };
  });
}

function parseWorkbookFeeSetupForm(formData: FormData): WorkbookFeeSetupFormPayload {
  const classRows = parseRepeatedRows(
    formData,
    "classLabel",
    "classAnnualTuition",
    "annual tuition",
  );
  const routeRows = parseRepeatedRows(
    formData,
    "routeName",
    "routeAnnualFee",
    "annual transport fee",
  );

  return {
    academicSessionLabel: parseRequiredString(
      formData.get("academicSessionLabel"),
      "Academic session",
    ),
    installmentDates: parseDateList(formData, "installmentDueDate"),
    lateFeeFlatAmount: parseRequiredNonNegativeInt(
      formData.get("lateFeeFlatAmount"),
      "Flat late fee",
    ),
    newStudentAcademicFeeAmount: parseRequiredNonNegativeInt(
      formData.get("newStudentAcademicFeeAmount"),
      "New student academic fee",
    ),
    oldStudentAcademicFeeAmount: parseRequiredNonNegativeInt(
      formData.get("oldStudentAcademicFeeAmount"),
      "Old student academic fee",
    ),
    customFeeHeads: parseFeeHeadRows(formData),
    classRows: classRows.map((item) => ({
      label: item.label,
      annualTuition: item.value,
    })),
    routeRows: routeRows.map((item) => ({
      routeName: item.label,
      annualFee: item.value,
    })),
  };
}

function parseIntent(formData: FormData) {
  const intent = (formData.get("_intent") ?? "preview").toString().trim();
  return intent === "apply" ? "apply" : "preview";
}

function parseUuid(value: FormDataEntryValue | null, label: string) {
  const normalized = parseRequiredString(value, label);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function toErrorState(error: unknown): FeeSetupActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save Fee Setup right now. Please try again.",
    changeBatchId: null,
    preview: null,
  };
}

function toPreviewState(payload: {
  batchId: string;
  preview: NonNullable<FeeSetupActionState["preview"]>;
  message: string;
}): FeeSetupActionState {
  return {
    status: "preview",
    message: payload.message,
    changeBatchId: payload.batchId,
    preview: payload.preview,
  };
}

function toSuccessState(message: string): FeeSetupActionState {
  return {
    status: "success",
    message,
    changeBatchId: null,
    preview: null,
  };
}

function revalidateFeeSetupSurface() {
  revalidatePath("/");
  revalidatePath("/auth/login");
  revalidatePath("/protected");
  revalidatePath("/protected/fee-setup");
  revalidatePath("/protected/fee-setup/generate");
  revalidatePath("/protected/fee-structure");
  revalidatePath("/protected/master-data");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/collections");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
  revalidatePath("/protected/settings");
  revalidatePath("/protected/setup");
  revalidatePath("/protected/students");
  revalidatePath("/protected/students/new");
  revalidatePath("/protected/imports");
  revalidateCoreFinancePaths();
}

export async function saveWorkbookFeeSetupAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireStaffPermission("fees:write");

    const payload = parseWorkbookFeeSetupForm(formData);
    const conventionalDiscountPolicies = parseConventionalDiscountRows(formData);

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Review batch");
      const result = await applyWorkbookFeeSetupBatch(batchId, payload);
      await upsertConventionalDiscountPolicies({
        academicSessionLabel: payload.academicSessionLabel,
        policies: conventionalDiscountPolicies,
      });
      revalidateFeeSetupSurface();
      return toSuccessState(result.message);
    }

    const previewResult = await createWorkbookFeeSetupPreview(payload);
    const preview = previewResult.preview;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: `Draft review saved: ${preview.studentsAffected} students affected, ${preview.installmentsToUpdate + preview.installmentsToInsert + preview.installmentsToCancel} installment rows changing, and ${preview.blockedInstallments} rows held for review. Publish Live Setup only after checking the summary below.`,
    });
  } catch (error) {
    return toErrorState(error);
  }
}
