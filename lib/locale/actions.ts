"use server";

import { cookies } from "next/headers";

import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type AppLocale,
} from "@/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the staff's chosen app locale in the `vpps_locale` cookie. The
 * cookie is read by `i18n/request.ts` on the next request to seed the SSR
 * locale. Client switching happens instantly via the LanguageProvider — this
 * action only persists the choice, so it deliberately does NOT call
 * revalidatePath: that would re-fetch every Supabase query in `/protected`
 * on every language click.
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
}
