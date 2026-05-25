"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type AppLocale,
} from "@/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the staff's chosen app locale in the `vpps_locale` cookie. The
 * cookie is read by `i18n/request.ts` on the next request to load the right
 * message catalog. Server actions revalidate the protected workspace so the
 * fresh locale renders immediately.
 *
 * No-ops on unsupported values rather than throwing — the dropdown is the only
 * legitimate caller and ships a fixed set of options.
 */
export async function setLocaleAction(locale: AppLocale | string) {
  if (!isSupportedLocale(locale)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: LOCALE_COOKIE_NAME,
    value: locale,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });

  revalidatePath("/protected", "layout");
}
