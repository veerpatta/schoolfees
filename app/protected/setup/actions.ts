"use server";

import { revalidatePath } from "next/cache";

import type { ClassStatus, PaymentMode } from "@/lib/db/types";
import { requireStaffPermission } from "@/lib/supabase/session";
import {
  markSetupStageComplete,
  saveSetupClassDefaults,
  saveSetupClasses,
  saveSetupPolicy,
  saveSetupRoutes,
  saveSetupSchoolDefaults,
} from "@/lib/setup/data";
import type {
  SaveSetupClassDefaultInput,
  SaveSetupClassRowInput,
  SaveSetupRouteRowInput,
  SetupActionState,
} from "@/lib/setup/types";

function toErrorState(error: unknown): SetupActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save setup changes right now. Please try again.",
  };
}

function toSuccessState(message: string): SetupActionState {
  return {
    status: "success",
    message,
  };
}

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

function parseClassStatus(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (normalized === "active" || normalized === "inactive" || normalized === "archived") {
    return normalized satisfies ClassStatus;
  }

  throw new Error("Class status is invalid.");
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

function parseInstallmentDueDateLabels(formData: FormData) {
  const values = formData
    .getAll("installmentDueDateLabel")
    .map((value) => value.toString().trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("Add at least one installment due date.");
  }

  return values;
}

function parseSetupClassRows(formData: FormData) {
  const ids = formData.getAll("classId").map((value) => value.toString().trim());
  const classNames = formData
    .getAll("className")
    .map((value) => value.toString().trim());
  const sections = formData.getAll("section").map((value) => value.toString().trim());
  const streamNames = formData
    .getAll("streamName")
    .map((value) => value.toString().trim());
  const sortOrders = formData.getAll("sortOrder");
  const statuses = formData.getAll("classStatus");
  const notes = formData.getAll("classNotes").map((value) => value.toString().trim());

  return classNames.reduce<SaveSetupClassRowInput[]>((acc, className, index) => {
    const section = sections[index] ?? "";
    const streamName = streamNames[index] ?? "";
    const note = notes[index] ?? "";
    const hasAnyValue =
      className || section || streamName || note || (ids[index] ?? "").trim();

    if (!hasAnyValue) {
      return acc;
    }

    if (!className) {
      throw new Error("Each class row must include a class name.");
    }

    acc.push({
      id: ids[index] || null,
      className,
      section: section || null,
      streamName: streamName || null,
      sortOrder: parseRequiredNonNegativeInt(sortOrders[index] ?? "0", "Sort order"),
      status: parseClassStatus(statuses[index] ?? "active"),
      notes: note || null,
    });
    return acc;
  }, []);
}

function parseSetupRouteRows(formData: FormData) {
  const ids = formData.getAll("routeId").map((value) => value.toString().trim());
  const routeCodes = formData
    .getAll("routeCode")
    .map((value) => value.toString().trim());
  const routeNames = formData
    .getAll("routeName")
    .map((value) => value.toString().trim());
  const defaultAmounts = formData.getAll("routeDefaultInstallmentAmount");
  const statuses = formData.getAll("routeIsActive").map((value) => value.toString().trim());
  const notes = formData.getAll("routeNotes").map((value) => value.toString().trim());

  return routeNames.reduce<SaveSetupRouteRowInput[]>((acc, routeName, index) => {
    const routeCode = routeCodes[index] ?? "";
    const note = notes[index] ?? "";
    const hasAnyValue =
      routeName || routeCode || note || (ids[index] ?? "").trim();

    if (!hasAnyValue) {
      return acc;
    }

    if (!routeName) {
      throw new Error("Each route row must include a route name.");
    }

    acc.push({
      id: ids[index] || null,
      routeCode: routeCode || null,
      routeName,
      defaultInstallmentAmount: parseRequiredNonNegativeInt(
        defaultAmounts[index] ?? "0",
        "Route default installment amount",
      ),
      isActive: statuses[index] !== "no",
      notes: note || null,
    });
    return acc;
  }, []);
}

function parseSetupClassDefaultRows(formData: FormData) {
  const classIds = formData
    .getAll("defaultClassId")
    .map((value) => value.toString().trim());
  const tuitionFees = formData.getAll("defaultTuitionFee");
  const transportFees = formData.getAll("defaultTransportFee");
  const booksFees = formData.getAll("defaultBooksFee");
  const miscFees = formData.getAll("defaultAdmissionActivityMiscFee");

  return classIds.reduce<SaveSetupClassDefaultInput[]>((acc, classId, index) => {
    if (!classId) {
      return acc;
    }

    acc.push({
      classId,
      tuitionFee: parseRequiredNonNegativeInt(tuitionFees[index] ?? "0", "Tuition fee"),
      transportFee: parseRequiredNonNegativeInt(
        transportFees[index] ?? "0",
        "Transport fee",
      ),
      booksFee: parseRequiredNonNegativeInt(booksFees[index] ?? "0", "Books fee"),
      admissionActivityMiscFee: parseRequiredNonNegativeInt(
        miscFees[index] ?? "0",
        "Admission/activity/misc fee",
      ),
    });
    return acc;
  }, []);
}

function revalidateSetupSurface() {
  revalidatePath("/protected");
  revalidatePath("/protected/setup");
  revalidatePath("/protected/fee-setup");
  revalidatePath("/protected/fee-setup/generate");
  revalidatePath("/protected/imports");
  revalidatePath("/protected/collections");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/settings");
}

export async function saveSetupPolicyAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await saveSetupPolicy({
      academicSessionLabel: (formData.get("academicSessionLabel") ?? "").toString().trim(),
      installmentDueDateLabels: parseInstallmentDueDateLabels(formData),
      lateFeeFlatAmount: parseRequiredNonNegativeInt(
        formData.get("lateFeeFlatAmount"),
        "Late fee",
      ),
      acceptedPaymentModes: parseAcceptedPaymentModes(formData),
      receiptPrefix: (formData.get("receiptPrefix") ?? "").toString().trim() || null,
    });
    revalidateSetupSurface();
    return toSuccessState("Academic session and collection policy saved.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveSetupClassesAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await saveSetupClasses(
      (formData.get("sessionLabel") ?? "").toString().trim(),
      parseSetupClassRows(formData),
    );
    revalidateSetupSurface();
    return toSuccessState("Class list saved for the active academic session.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveSetupRoutesAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await saveSetupRoutes(parseSetupRouteRows(formData));
    revalidateSetupSurface();
    return toSuccessState("Transport routes saved.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveSetupSchoolDefaultsAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await saveSetupSchoolDefaults({
      tuitionFee: parseRequiredNonNegativeInt(formData.get("tuitionFee"), "Tuition fee"),
      transportFee: parseRequiredNonNegativeInt(formData.get("transportFee"), "Transport fee"),
      booksFee: parseRequiredNonNegativeInt(formData.get("booksFee"), "Books fee"),
      admissionActivityMiscFee: parseRequiredNonNegativeInt(
        formData.get("admissionActivityMiscFee"),
        "Admission/activity/misc fee",
      ),
    });
    revalidateSetupSurface();
    return toSuccessState("School-wide defaults saved.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveSetupClassDefaultsAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await saveSetupClassDefaults(parseSetupClassDefaultRows(formData));
    revalidateSetupSurface();
    return toSuccessState("Class-wise defaults saved.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function completeSetupStageAction(
  _previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  try {
    await requireStaffPermission("settings:write");
    await markSetupStageComplete(
      (formData.get("completionNotes") ?? "").toString().trim() || null,
    );
    revalidateSetupSurface();
    return toSuccessState("Setup stage marked complete. The collection desk is ready.");
  } catch (error) {
    return toErrorState(error);
  }
}
