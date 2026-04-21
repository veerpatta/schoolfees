"use server";

import { revalidatePath } from "next/cache";

import {
  upsertClassFeeDefault,
  upsertSchoolFeeDefaults,
  upsertStudentFeeOverride,
} from "@/lib/fees/data";
import {
  INITIAL_FEE_SETUP_ACTION_STATE,
  type FeeSetupActionState,
} from "@/lib/fees/types";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

function parseRequiredNonNegativeInt(value: FormDataEntryValue | null, fieldLabel: string) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be a whole number greater than or equal to 0.`);
  }

  return numeric;
}

function parseOptionalNonNegativeInt(value: FormDataEntryValue | null, fieldLabel: string) {
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

function parseOtherFeeHeads(rawValue: string) {
  if (!rawValue.trim()) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("Other fee heads must be valid JSON in object format.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Other fee heads must be a JSON object like {\"lab fee\": 500}.");
  }

  return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, value]) => {
      const normalizedKey = key.trim();

      if (!normalizedKey) {
        return acc;
      }

      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new Error(`Other fee head \"${normalizedKey}\" must be a non-negative whole number.`);
      }

      acc[normalizedKey] = value;
      return acc;
    },
    {},
  );
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

  throw new Error("Transport override selection is invalid.");
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

function parseDueDates(formData: FormData) {
  const dueDates = [
    (formData.get("dueDate1") ?? "").toString().trim(),
    (formData.get("dueDate2") ?? "").toString().trim(),
    (formData.get("dueDate3") ?? "").toString().trim(),
    (formData.get("dueDate4") ?? "").toString().trim(),
  ].filter(Boolean);

  if (dueDates.length === 0) {
    throw new Error("At least one installment due date is required.");
  }

  return dueDates;
}

async function requireAdminForFeeWrite() {
  const staff = await requireAuthenticatedStaff();

  if (staff.appRole !== "admin") {
    throw new Error("Only admin staff can update fee setup defaults.");
  }
}

function toErrorState(error: unknown): FeeSetupActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save fee setup right now. Please try again.",
  };
}

export async function saveSchoolDefaultsAction(
  _previous: FeeSetupActionState,
  formData: FormData,
): Promise<FeeSetupActionState> {
  try {
    await requireAdminForFeeWrite();

    await upsertSchoolFeeDefaults({
      tuitionFee: parseRequiredNonNegativeInt(formData.get("tuitionFee"), "Tuition fee"),
      transportFee: parseRequiredNonNegativeInt(formData.get("transportFee"), "Transport fee"),
      booksFee: parseRequiredNonNegativeInt(formData.get("booksFee"), "Books fee"),
      admissionActivityMiscFee: parseRequiredNonNegativeInt(
        formData.get("admissionActivityMiscFee"),
        "Admission/activity/misc fee",
      ),
      otherFeeHeads: parseOtherFeeHeads((formData.get("otherFeeHeads") ?? "").toString()),
      lateFeeFlatAmount: parseRequiredNonNegativeInt(formData.get("lateFeeFlatAmount"), "Late fee"),
      installmentCount: parseRequiredNonNegativeInt(formData.get("installmentCount"), "Installment count"),
      installmentDueDates: parseDueDates(formData),
      studentTypeDefault: parseStudentType(formData.get("studentTypeDefault"), "Student type default"),
      transportAppliesDefault: parseBooleanSelect(
        formData.get("transportAppliesDefault"),
        "Transport applies default",
      ),
      notes: (formData.get("notes") ?? "").toString().trim() || null,
    });

    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/fee-structure");

    return {
      status: "success",
      message: "School-wide fee defaults saved.",
    };
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

    const classId = (formData.get("classId") ?? "").toString().trim();

    if (!classId) {
      throw new Error("Class is required.");
    }

    await upsertClassFeeDefault({
      classId,
      tuitionFee: parseRequiredNonNegativeInt(formData.get("tuitionFee"), "Tuition fee"),
      transportFee: parseRequiredNonNegativeInt(formData.get("transportFee"), "Transport fee"),
      booksFee: parseRequiredNonNegativeInt(formData.get("booksFee"), "Books fee"),
      admissionActivityMiscFee: parseRequiredNonNegativeInt(
        formData.get("admissionActivityMiscFee"),
        "Admission/activity/misc fee",
      ),
      otherFeeHeads: parseOtherFeeHeads((formData.get("otherFeeHeads") ?? "").toString()),
      lateFeeFlatAmount: parseRequiredNonNegativeInt(formData.get("lateFeeFlatAmount"), "Late fee"),
      installmentCount: parseRequiredNonNegativeInt(formData.get("installmentCount"), "Installment count"),
      studentTypeDefault: parseStudentType(formData.get("studentTypeDefault"), "Student type default"),
      transportAppliesDefault: parseBooleanSelect(
        formData.get("transportAppliesDefault"),
        "Transport applies default",
      ),
      notes: (formData.get("notes") ?? "").toString().trim() || null,
    });

    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/fee-structure");

    return {
      status: "success",
      message: "Class fee defaults saved.",
    };
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

    const studentId = (formData.get("studentId") ?? "").toString().trim();

    if (!studentId) {
      throw new Error("Student is required.");
    }

    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!reason) {
      throw new Error("Reason is required for student override entries.");
    }

    await upsertStudentFeeOverride({
      studentId,
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
      customOtherFeeHeads: parseOtherFeeHeads(
        (formData.get("customOtherFeeHeads") ?? "").toString(),
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
    });

    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/fee-structure");

    return {
      status: "success",
      message: "Student fee override saved.",
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export const initialFeeSetupActionState = INITIAL_FEE_SETUP_ACTION_STATE;
