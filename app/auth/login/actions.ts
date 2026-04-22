"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveStaffRole } from "@/lib/auth/roles";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { sanitizeRedirectPath } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
};

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

export async function loginAction(
  _previous: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  try {
    const email = getRequiredString(formData.get("email"), "Email");
    const password = getRequiredString(formData.get("password"), "Password");
    const next = sanitizeRedirectPath(formData.get("next")?.toString());
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const { data: profileData } = await supabase
      .from("users")
      .select("is_active, role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (
      profileData &&
      (profileData as { is_active?: boolean | null }).is_active === false
    ) {
      await supabase.auth.signOut();
      return {
        status: "error",
        message:
          "This staff account is currently inactive. Contact the school admin.",
      };
    }

    const appRole = resolveStaffRole(
      (profileData as { role?: string | null } | null)?.role ?? null,
    );
    const targetHref = next === "/protected" ? getDefaultProtectedHref(appRole) : next;

    revalidatePath("/", "layout");
    redirect(targetHref);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.",
    };
  }
}

export async function logoutAction() {
  const supabase = await createClient();

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
