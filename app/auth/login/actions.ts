"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
} from "@/i18n/locales";
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
  let targetHref: string | null = null;

  try {
    const email = getRequiredString(formData.get("email"), "Email").toLowerCase();
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
      // preferred_locale rides along on the profile read we already do, so
      // seeding the language costs nothing extra at sign-in.
      .select("is_active, role, preferred_locale")
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

    // Sign-in is where the account language meets a new device. The cookie
    // stays the per-request read path (no query per page); this is the one
    // moment it needs reconciling against the account, and it is exactly what
    // makes "every device you use shows this language" true.
    const accountLocale = (profileData as { preferred_locale?: string | null } | null)
      ?.preferred_locale;
    if (isSupportedLocale(accountLocale)) {
      const cookieStore = await cookies();
      cookieStore.set({
        name: LOCALE_COOKIE_NAME,
        value: accountLocale,
        path: "/",
        maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
        sameSite: "lax",
      });
    }

    const appRole = resolveStaffRole(
      (profileData as { role?: string | null } | null)?.role ?? null,
    );
    targetHref =
      next === "/protected" ? getDefaultProtectedHref(appRole) : next;

    revalidatePath("/", "layout");
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.",
    };
  }

  redirect(targetHref);
}

export async function logoutAction() {
  const supabase = await createClient();

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
