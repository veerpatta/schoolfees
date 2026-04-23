"use server";

import { revalidatePath } from "next/cache";

import {
  applyWorkbookFeeSetupBatch,
  createWorkbookFeeSetupPreview,
} from "@/lib/fees/workbook-setup-change";
import type { WorkbookFeeSetupFormPayload } from "@/lib/fees/workbook-setup";
import type { FeeSetupActionState } from "@/lib/fees/types";
import { requireStaffPermission } from "@/lib/supabase/session";

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
}

export async function saveWorkbookFeeSetupAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireStaffPermission("fees:write");

    const payload = parseWorkbookFeeSetupForm(formData);

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Review batch");
      const result = await applyWorkbookFeeSetupBatch(batchId, payload);
      revalidateFeeSetupSurface();
      return toSuccessState(result.message);
    }

    const previewResult = await createWorkbookFeeSetupPreview(payload);
    const preview = previewResult.preview;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: `Review ready: ${preview.studentsAffected} students affected, ${preview.installmentsToUpdate + preview.installmentsToInsert + preview.installmentsToCancel} installment rows changing, and ${preview.blockedInstallments} rows held for review. Apply only after checking the workbook summary below.`,
    });
  } catch (error) {
    return toErrorState(error);
  }
}
