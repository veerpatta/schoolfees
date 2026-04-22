"use server";

import { revalidatePath } from "next/cache";

import { getFeeSetupPageData } from "@/lib/fees/data";
import {
  applyConfigChangeBatch,
  createConfigChangePreview,
} from "@/lib/fees/config-change";
import type { FeeHeadDefinition, FeeSetupActionState } from "@/lib/fees/types";
import type { PaymentMode } from "@/lib/db/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function parseRequiredNonNegativeInt(
  value: FormDataEntryValue | null,
  fieldLabel: string,
) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be a whole number greater than or equal to 0.`);
  }

  return numeric;
}

function parseOptionalNonNegativeInt(
  value: FormDataEntryValue | null,
  fieldLabel: string,
) {
  const raw = (value ?? "").toString().trim();

  if (!raw) {
    return null;
  }

  const numeric = Number(raw);

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be blank or a whole number greater than or equal to 0.`);
  }

  return numeric;
}

function parseBooleanSelect(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();

  if (normalized === "yes") {
    return true;
  }

  if (normalized === "no") {
    return false;
  }

  throw new Error(`${fieldLabel} selection is invalid.`);
}

function parseOptionalBooleanSelect(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    return null;
  }

  if (normalized === "yes") {
    return true;
  }

  if (normalized === "no") {
    return false;
  }

  throw new Error("Override selection is invalid.");
}

function parseStudentType(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();

  if (normalized === "new" || normalized === "existing") {
    return normalized;
  }

  throw new Error(`${fieldLabel} selection is invalid.`);
}

function parseOptionalStudentType(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    return null;
  }

  if (normalized === "new" || normalized === "existing") {
    return normalized;
  }

  throw new Error("Student type override selection is invalid.");
}

function parseCustomFeeHeads(formData: FormData, idField: string, labelField: string) {
  const ids = formData.getAll(idField).map((value) => value.toString());
  const labels = formData.getAll(labelField).map((value) => value.toString());

  return labels.reduce<FeeHeadDefinition[]>((acc, rawLabel, index) => {
    const label = rawLabel.trim();

    if (!label) {
      return acc;
    }

    const id = (ids[index] ?? "").toString().trim();
    acc.push({
      id: id || label,
      label,
    });
    return acc;
  }, []);
}

function parseCustomFeeHeadAmounts(
  formData: FormData,
  idField: string,
  amountField: string,
) {
  const ids = formData.getAll(idField).map((value) => value.toString().trim());
  const amounts = formData.getAll(amountField).map((value) => value.toString().trim());

  return amounts.reduce<Record<string, number>>((acc, rawAmount, index) => {
    const id = ids[index];

    if (!id || !rawAmount) {
      return acc;
    }

    const numeric = Number(rawAmount);

    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new Error("Custom fee head amounts must be whole numbers greater than or equal to 0.");
    }

    if (numeric > 0) {
      acc[id] = numeric;
    }

    return acc;
  }, {});
}

function parseInstallmentSchedule(formData: FormData) {
  const labels = formData.getAll("scheduleLabel").map((value) => value.toString());
  const dueDateLabels = formData
    .getAll("scheduleDueDateLabel")
    .map((value) => value.toString());

  const schedule = labels.reduce<Array<{ label: string; dueDateLabel: string }>>(
    (acc, rawLabel, index) => {
      const label = rawLabel.trim();
      const dueDateLabel = (dueDateLabels[index] ?? "").trim();

      if (!label && !dueDateLabel) {
        return acc;
      }

      if (!label || !dueDateLabel) {
        throw new Error("Each installment row needs both a label and a due date.");
      }

      acc.push({
        label,
        dueDateLabel,
      });
      return acc;
    },
    [],
  );

  if (schedule.length === 0) {
    throw new Error("Add at least one installment row.");
  }

  return schedule;
}

function parseAcceptedPaymentModes(formData: FormData) {
  const values = formData
    .getAll("acceptedPaymentModes")
    .map((value) => value.toString().trim())
    .filter(Boolean);

  const allowedValues = new Set<PaymentMode>([
    "cash",
    "upi",
    "bank_transfer",
    "cheque",
  ]);

  const modes = values.reduce<PaymentMode[]>((acc, value) => {
    if (!allowedValues.has(value as PaymentMode)) {
      throw new Error("Accepted payment modes include an invalid value.");
    }

    acc.push(value as PaymentMode);
    return acc;
  }, []);

  if (modes.length === 0) {
    throw new Error("Select at least one accepted payment mode.");
  }

  return modes;
}

function parseUuid(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${fieldLabel} is invalid.`);
  }

  return normalized;
}

function parseIntent(formData: FormData) {
  const intent = (formData.get("_intent") ?? "preview").toString().trim();
  return intent === "apply" ? "apply" : "preview";
}

async function requireAdminForFeeWrite() {
  await requireStaffPermission("fees:write");
}

function toErrorState(error: unknown): FeeSetupActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save fee setup right now. Please try again.",
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

function previewMessage(payload: {
  target: string;
  studentsAffected: number;
  installmentsAffected: number;
  blocked: number;
}) {
  return `Impact preview ready for ${payload.target}: ${payload.studentsAffected} students, ${payload.installmentsAffected} installment rows (${payload.blocked} blocked for review). Confirm apply to proceed.`;
}

function revalidateFeePolicySurface() {
  revalidatePath("/");
  revalidatePath("/auth/login");
  revalidatePath("/protected");
  revalidatePath("/protected/fee-setup");
  revalidatePath("/protected/fee-setup/generate");
  revalidatePath("/protected/fee-structure");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/collections");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
  revalidatePath("/protected/settings");
}

export async function saveGlobalPolicyAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Preview batch");
      const result = await applyConfigChangeBatch(batchId);
      revalidateFeePolicySurface();
      return toSuccessState(result.message);
    }

    const previewResult = await createConfigChangePreview({
      scope: "global_policy",
      proposedPayload: {
        academicSessionLabel: (formData.get("academicSessionLabel") ?? "").toString().trim(),
        installmentSchedule: parseInstallmentSchedule(formData),
        lateFeeFlatAmount: parseRequiredNonNegativeInt(
          formData.get("lateFeeFlatAmount"),
          "Late fee",
        ),
        acceptedPaymentModes: parseAcceptedPaymentModes(formData),
        receiptPrefix: (formData.get("receiptPrefix") ?? "").toString().trim().toUpperCase(),
        customFeeHeads: parseCustomFeeHeads(
          formData,
          "globalCustomFeeHeadId",
          "globalCustomFeeHeadLabel",
        ),
        notes: (formData.get("globalNotes") ?? "").toString().trim() || null,
      },
    });

    const preview = previewResult.preview;
    const installmentsAffected =
      preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel +
      preview.blockedInstallments;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: previewMessage({
        target: preview.targetLabel,
        studentsAffected: preview.studentsAffected,
        installmentsAffected,
        blocked: preview.blockedInstallments,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveSchoolDefaultsAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Preview batch");
      const result = await applyConfigChangeBatch(batchId);
      revalidateFeePolicySurface();
      return toSuccessState(result.message);
    }

    const setupData = await getFeeSetupPageData();
    const customFeeHeads = setupData.globalPolicy.customFeeHeads;

    const previewResult = await createConfigChangePreview({
      scope: "school_defaults",
      proposedPayload: {
        tuitionFee: parseRequiredNonNegativeInt(formData.get("tuitionFee"), "Tuition fee"),
        transportFee: parseRequiredNonNegativeInt(formData.get("transportFee"), "Transport fee"),
        booksFee: parseRequiredNonNegativeInt(formData.get("booksFee"), "Books fee"),
        admissionActivityMiscFee: parseRequiredNonNegativeInt(
          formData.get("admissionActivityMiscFee"),
          "Admission/activity/misc fee",
        ),
        customFeeHeadAmounts: parseCustomFeeHeadAmounts(
          formData,
          "schoolCustomFeeHeadId",
          "schoolCustomFeeHeadAmount",
        ),
        studentTypeDefault: parseStudentType(
          formData.get("studentTypeDefault"),
          "Student type default",
        ),
        transportAppliesDefault: parseBooleanSelect(
          formData.get("transportAppliesDefault"),
          "Transport applies default",
        ),
        notes: (formData.get("notes") ?? "").toString().trim() || null,
        customFeeHeadsCatalog: customFeeHeads,
      },
    });

    const preview = previewResult.preview;
    const installmentsAffected =
      preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel +
      preview.blockedInstallments;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: previewMessage({
        target: preview.targetLabel,
        studentsAffected: preview.studentsAffected,
        installmentsAffected,
        blocked: preview.blockedInstallments,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveClassDefaultsAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Preview batch");
      const result = await applyConfigChangeBatch(batchId);
      revalidateFeePolicySurface();
      return toSuccessState(result.message);
    }

    const setupData = await getFeeSetupPageData();
    const customFeeHeads = setupData.globalPolicy.customFeeHeads;

    const previewResult = await createConfigChangePreview({
      scope: "class_defaults",
      proposedPayload: {
        classId: parseUuid(formData.get("classId"), "Class"),
        tuitionFee: parseRequiredNonNegativeInt(formData.get("tuitionFee"), "Tuition fee"),
        transportFee: parseRequiredNonNegativeInt(formData.get("transportFee"), "Transport fee"),
        booksFee: parseRequiredNonNegativeInt(formData.get("booksFee"), "Books fee"),
        admissionActivityMiscFee: parseRequiredNonNegativeInt(
          formData.get("admissionActivityMiscFee"),
          "Admission/activity/misc fee",
        ),
        customFeeHeadAmounts: parseCustomFeeHeadAmounts(
          formData,
          "classCustomFeeHeadId",
          "classCustomFeeHeadAmount",
        ),
        studentTypeDefault: parseStudentType(
          formData.get("studentTypeDefault"),
          "Student type default",
        ),
        transportAppliesDefault: parseBooleanSelect(
          formData.get("transportAppliesDefault"),
          "Transport applies default",
        ),
        notes: (formData.get("notes") ?? "").toString().trim() || null,
        customFeeHeadsCatalog: customFeeHeads,
      },
    });

    const preview = previewResult.preview;
    const installmentsAffected =
      preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel +
      preview.blockedInstallments;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: previewMessage({
        target: preview.targetLabel,
        studentsAffected: preview.studentsAffected,
        installmentsAffected,
        blocked: preview.blockedInstallments,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveTransportDefaultsAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Preview batch");
      const result = await applyConfigChangeBatch(batchId);
      revalidateFeePolicySurface();
      return toSuccessState(result.message);
    }

    const routeId = (formData.get("routeId") ?? "").toString().trim();
    const routeCode = (formData.get("routeCode") ?? "").toString().trim();
    const routeName = (formData.get("routeName") ?? "").toString().trim();

    if (!routeName) {
      throw new Error("Route name is required.");
    }

    const previewResult = await createConfigChangePreview({
      scope: "transport_defaults",
      proposedPayload: {
        routeId: routeId || null,
        routeCode: routeCode || null,
        routeName,
        defaultInstallmentAmount: parseRequiredNonNegativeInt(
          formData.get("defaultInstallmentAmount"),
          "Route default installment amount",
        ),
        isActive: parseBooleanSelect(formData.get("isActive"), "Route status"),
        notes: (formData.get("notes") ?? "").toString().trim() || null,
      },
    });

    const preview = previewResult.preview;
    const installmentsAffected =
      preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel +
      preview.blockedInstallments;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: previewMessage({
        target: preview.targetLabel,
        studentsAffected: preview.studentsAffected,
        installmentsAffected,
        blocked: preview.blockedInstallments,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveStudentOverrideAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("changeBatchId"), "Preview batch");
      const result = await applyConfigChangeBatch(batchId);
      revalidateFeePolicySurface();
      return toSuccessState(result.message);
    }

    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!reason) {
      throw new Error("Reason is required for student override entries.");
    }

    const setupData = await getFeeSetupPageData();
    const customFeeHeads = setupData.globalPolicy.customFeeHeads;

    const previewResult = await createConfigChangePreview({
      scope: "student_override",
      proposedPayload: {
        studentId: parseUuid(formData.get("studentId"), "Student"),
        customTuitionFeeAmount: parseOptionalNonNegativeInt(
          formData.get("customTuitionFeeAmount"),
          "Custom tuition fee",
        ),
        customTransportFeeAmount: parseOptionalNonNegativeInt(
          formData.get("customTransportFeeAmount"),
          "Custom transport fee",
        ),
        customBooksFeeAmount: parseOptionalNonNegativeInt(
          formData.get("customBooksFeeAmount"),
          "Custom books fee",
        ),
        customAdmissionActivityMiscFeeAmount: parseOptionalNonNegativeInt(
          formData.get("customAdmissionActivityMiscFeeAmount"),
          "Custom admission/activity/misc fee",
        ),
        customFeeHeadAmounts: parseCustomFeeHeadAmounts(
          formData,
          "studentCustomFeeHeadId",
          "studentCustomFeeHeadAmount",
        ),
        customLateFeeFlatAmount: parseOptionalNonNegativeInt(
          formData.get("customLateFeeFlatAmount"),
          "Custom late fee",
        ),
        discountAmount: parseRequiredNonNegativeInt(formData.get("discountAmount"), "Discount amount"),
        studentTypeOverride: parseOptionalStudentType(formData.get("studentTypeOverride")),
        transportAppliesOverride: parseOptionalBooleanSelect(formData.get("transportAppliesOverride")),
        reason,
        notes: (formData.get("notes") ?? "").toString().trim() || null,
        customFeeHeadsCatalog: customFeeHeads,
      },
    });

    const preview = previewResult.preview;
    const installmentsAffected =
      preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel +
      preview.blockedInstallments;

    return toPreviewState({
      batchId: previewResult.batchId,
      preview,
      message: previewMessage({
        target: preview.targetLabel,
        studentsAffected: preview.studentsAffected,
        installmentsAffected,
        blocked: preview.blockedInstallments,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}
