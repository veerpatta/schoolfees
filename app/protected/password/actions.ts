"use server";

import { revalidatePath } from "next/cache";

import {
  validateStaffPassword,
  type StaffFormActionState,
} from "@/lib/staff-management/data";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

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

export async function changeOwnPasswordAction(
  _previous: StaffFormActionState,
  formData: FormData,
): Promise<StaffFormActionState> {
  try {
    const staff = await requireAuthenticatedStaff();
    const currentPassword = getRequiredString(
      formData.get("currentPassword"),
      "Current password",
    );
    const newPassword = getRequiredString(
      formData.get("newPassword"),
      "New password",
    );
    const confirmPassword = getRequiredString(
      formData.get("confirmPassword"),
      "Confirm password",
    );

    if (newPassword !== confirmPassword) {
      throw new Error("New password and confirmation do not match.");
    }

    validateStaffPassword(newPassword);

    if (!staff.email) {
      throw new Error("Current staff email is unavailable.");
    }

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: staff.email,
      password: currentPassword,
    });

    if (verifyError) {
      throw new Error("Current password is incorrect.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw updateError;
    }

    revalidatePath("/protected/password");

    return {
      status: "success",
      message: "Password changed successfully.",
      generatedPassword: null,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to change password right now.",
      generatedPassword: null,
    };
  }
}
