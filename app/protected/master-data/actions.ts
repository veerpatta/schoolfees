"use server";

import { revalidatePath } from "next/cache";

import type { ClassStatus, PaymentMode } from "@/lib/db/types";
import {
  createAcademicSession,
  createClass,
  createFeeHead,
  createRoute,
  deleteAcademicSession,
  deleteClass,
  deleteFeeHead,
  deleteRoute,
  setPaymentModeActive,
  updateAcademicSession,
  updateClass,
  updateFeeHead,
  updateRoute,
} from "@/lib/master-data/data";
import { requireStaffPermission } from "@/lib/supabase/session";

export type MasterDataActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function toSuccess(message: string): MasterDataActionState {
  return { status: "success", message };
}

function toError(error: unknown): MasterDataActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save master data right now. Please try again.",
  };
}

function parseRequiredString(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();
  return normalized || null;
}

function parseClassStatus(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (normalized === "active" || normalized === "inactive" || normalized === "archived") {
    return normalized satisfies ClassStatus;
  }

  throw new Error("Status is invalid.");
}

function parseBoolean(value: FormDataEntryValue | null) {
  return (value ?? "").toString().trim() === "yes";
}

function parseRequiredUuid(value: FormDataEntryValue | null, label: string) {
  const normalized = parseRequiredString(value, label);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const numeric = Number((value ?? "0").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error("Sort order must be a whole number greater than or equal to 0.");
  }

  return numeric;
}

function parseRequiredNonNegativeInt(value: FormDataEntryValue | null, label: string) {
  const numeric = Number((value ?? "0").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${label} must be a whole number greater than or equal to 0.`);
  }

  return numeric;
}

function parsePaymentMode(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (
    normalized === "cash" ||
    normalized === "upi" ||
    normalized === "bank_transfer" ||
    normalized === "cheque"
  ) {
    return normalized satisfies PaymentMode;
  }

  throw new Error("Payment mode is invalid.");
}

function revalidateMasterDataSurface() {
  revalidatePath("/protected/master-data");
  revalidatePath("/protected/setup");
  revalidatePath("/protected/students");
  revalidatePath("/protected/students/new");
  revalidatePath("/protected/fee-setup");
  revalidatePath("/protected/fee-setup/generate");
  revalidatePath("/protected/imports");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/collections");
  revalidatePath("/protected/finance-controls");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
  revalidatePath("/protected/settings");
}

export async function createSessionAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await createAcademicSession({
      sessionLabel: parseRequiredString(formData.get("sessionLabel"), "Session label"),
      status: parseClassStatus(formData.get("sessionStatus")),
      isCurrent: parseBoolean(formData.get("isCurrentSession")),
      notes: parseOptionalString(formData.get("sessionNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Academic session created.");
  } catch (error) {
    return toError(error);
  }
}

export async function updateSessionAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await updateAcademicSession({
      id: parseRequiredUuid(formData.get("sessionId"), "Session"),
      sessionLabel: parseRequiredString(formData.get("sessionLabel"), "Session label"),
      status: parseClassStatus(formData.get("sessionStatus")),
      isCurrent: parseBoolean(formData.get("isCurrentSession")),
      notes: parseOptionalString(formData.get("sessionNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Academic session updated.");
  } catch (error) {
    return toError(error);
  }
}

export async function deleteSessionAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await deleteAcademicSession(parseRequiredUuid(formData.get("sessionId"), "Session"));
    revalidateMasterDataSurface();
    return toSuccess("Academic session deleted.");
  } catch (error) {
    return toError(error);
  }
}

export async function createClassAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await createClass({
      sessionLabel: parseRequiredString(formData.get("sessionLabel"), "Session"),
      className: parseRequiredString(formData.get("className"), "Class name"),
      section: parseOptionalString(formData.get("section")),
      streamName: parseOptionalString(formData.get("streamName")),
      sortOrder: parseSortOrder(formData.get("sortOrder")),
      status: parseClassStatus(formData.get("classStatus")),
      notes: parseOptionalString(formData.get("classNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Class created.");
  } catch (error) {
    return toError(error);
  }
}

export async function updateClassAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await updateClass({
      id: parseRequiredUuid(formData.get("classId"), "Class"),
      sessionLabel: parseRequiredString(formData.get("sessionLabel"), "Session"),
      className: parseRequiredString(formData.get("className"), "Class name"),
      section: parseOptionalString(formData.get("section")),
      streamName: parseOptionalString(formData.get("streamName")),
      sortOrder: parseSortOrder(formData.get("sortOrder")),
      status: parseClassStatus(formData.get("classStatus")),
      notes: parseOptionalString(formData.get("classNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Class updated.");
  } catch (error) {
    return toError(error);
  }
}

export async function deleteClassAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await deleteClass(parseRequiredUuid(formData.get("classId"), "Class"));
    revalidateMasterDataSurface();
    return toSuccess("Class deleted.");
  } catch (error) {
    return toError(error);
  }
}

export async function createRouteAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await createRoute({
      routeCode: parseOptionalString(formData.get("routeCode")),
      routeName: parseRequiredString(formData.get("routeName"), "Route name"),
      defaultInstallmentAmount: parseRequiredNonNegativeInt(
        formData.get("defaultInstallmentAmount"),
        "Default installment amount",
      ),
      isActive: parseBoolean(formData.get("routeIsActive")),
      notes: parseOptionalString(formData.get("routeNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Route created.");
  } catch (error) {
    return toError(error);
  }
}

export async function updateRouteAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");

    await updateRoute({
      id: parseRequiredUuid(formData.get("routeId"), "Route"),
      routeCode: parseOptionalString(formData.get("routeCode")),
      routeName: parseRequiredString(formData.get("routeName"), "Route name"),
      defaultInstallmentAmount: parseRequiredNonNegativeInt(
        formData.get("defaultInstallmentAmount"),
        "Default installment amount",
      ),
      isActive: parseBoolean(formData.get("routeIsActive")),
      notes: parseOptionalString(formData.get("routeNotes")),
    });

    revalidateMasterDataSurface();
    return toSuccess("Route updated.");
  } catch (error) {
    return toError(error);
  }
}

export async function deleteRouteAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await deleteRoute(parseRequiredUuid(formData.get("routeId"), "Route"));
    revalidateMasterDataSurface();
    return toSuccess("Route deleted.");
  } catch (error) {
    return toError(error);
  }
}

export async function createFeeHeadAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await createFeeHead(parseRequiredString(formData.get("feeHeadLabel"), "Fee head label"));
    revalidateMasterDataSurface();
    return toSuccess("Fee head created.");
  } catch (error) {
    return toError(error);
  }
}

export async function updateFeeHeadAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await updateFeeHead({
      id: parseRequiredString(formData.get("feeHeadId"), "Fee head"),
      label: parseRequiredString(formData.get("feeHeadLabel"), "Fee head label"),
      isActive: parseBoolean(formData.get("feeHeadIsActive")),
    });
    revalidateMasterDataSurface();
    return toSuccess("Fee head updated.");
  } catch (error) {
    return toError(error);
  }
}

export async function deleteFeeHeadAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await deleteFeeHead(parseRequiredString(formData.get("feeHeadId"), "Fee head"));
    revalidateMasterDataSurface();
    return toSuccess("Fee head deleted.");
  } catch (error) {
    return toError(error);
  }
}

export async function setPaymentModeActiveAction(
  _previous: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  try {
    await requireStaffPermission("settings:write");
    await setPaymentModeActive({
      paymentMode: parsePaymentMode(formData.get("paymentMode")),
      isActive: parseBoolean(formData.get("modeIsActive")),
    });
    revalidateMasterDataSurface();
    return toSuccess("Payment mode updated.");
  } catch (error) {
    return toError(error);
  }
}
