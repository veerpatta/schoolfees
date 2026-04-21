"use server";

import { revalidatePath } from "next/cache";

import {
  createStaffAccount,
  resetStaffAccountPassword,
  updateStaffAccount,
  type StaffFormActionState,
} from "@/lib/staff-management/data";
import { isStaffRole } from "@/lib/auth/roles";
import { requireStaffPermission } from "@/lib/supabase/session";

function getRequiredString(
  value: FormDataEntryValue | null,
  fieldLabel: string,
) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${fieldLabel} is required.`);
  }

  return normalized;
}

function getOptionalString(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();
  return normalized ? normalized : undefined;
}

function getRole(value: FormDataEntryValue | null) {
  const normalized = getRequiredString(value, "Role");

  if (!isStaffRole(normalized)) {
    throw new Error("Role is invalid.");
  }

  return normalized;
}

function getBoolean(value: FormDataEntryValue | null) {
  return (value ?? "").toString() === "on";
}

function toActionError(error: unknown): StaffFormActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save staff changes right now.",
    generatedPassword: null,
  };
}

function revalidateStaffRoutes() {
  revalidatePath("/protected/staff");
  revalidatePath("/protected/settings");
}

export async function createStaffAccountAction(
  _previous: StaffFormActionState,
  formData: FormData,
): Promise<StaffFormActionState> {
  try {
    await requireStaffPermission("staff:manage");

    const result = await createStaffAccount({
      fullName: getRequiredString(formData.get("fullName"), "Full name"),
      email: getRequiredString(formData.get("email"), "Email"),
      role: getRole(formData.get("role")),
      password: getOptionalString(formData.get("password")),
      notes: getOptionalString(formData.get("notes")) ?? null,
    });

    revalidateStaffRoutes();

    return {
      status: "success",
      message:
        result.mode === "created"
          ? "Staff account created successfully."
          : "Existing staff account updated successfully.",
      generatedPassword: result.generatedPassword,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateStaffAccountAction(
  userId: string,
  _previous: StaffFormActionState,
  formData: FormData,
): Promise<StaffFormActionState> {
  try {
    const actor = await requireStaffPermission("staff:manage");

    await updateStaffAccount({
      actorUserId: actor.id ?? actor.sub ?? "",
      userId,
      fullName: getRequiredString(formData.get("fullName"), "Full name"),
      role: getRole(formData.get("role")),
      isActive: getBoolean(formData.get("isActive")),
      notes: getOptionalString(formData.get("notes")) ?? null,
    });

    revalidateStaffRoutes();

    return {
      status: "success",
      message: "Staff access updated successfully.",
      generatedPassword: null,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetStaffPasswordAction(
  userId: string,
  _previous: StaffFormActionState,
  formData: FormData,
): Promise<StaffFormActionState> {
  try {
    await requireStaffPermission("staff:manage");

    await resetStaffAccountPassword({
      userId,
      password: getRequiredString(formData.get("password"), "New password"),
    });

    revalidateStaffRoutes();

    return {
      status: "success",
      message: "Password reset successfully.",
      generatedPassword: null,
    };
  } catch (error) {
    return toActionError(error);
  }
}
