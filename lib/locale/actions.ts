"use server";

import { cookies } from "next/headers";

import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type AppLocale,
} from "@/i18n/locales";
import { createClient } from "@/lib/supabase/server";

/**
 * Persists the staff's chosen app locale in two places.
 *
 * The `vpps_locale` cookie stays the READ path: `i18n/request.ts` reads it on
 * every request, and keeping that a cookie lookup rather than a query is why
 * a language choice costs no database round trip per page.
 *
 * `users.preferred_locale` is the DURABLE store — it is what makes the phone
 * design's promise true ("saved to your login, every device shows this
 * language"). It is reconciled back into the cookie by the protected layout
 * when a session starts on a device that has no cookie yet.
 *
 * Deliberately does NOT call revalidatePath: that would re-fetch every
 * Supabase query in `/protected` on every language click. The client provider
 * has already switched instantly; this only records the choice.
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
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
  });

  // The RPC is SECURITY DEFINER over `where id = auth.uid()`, so it must run
  // on the USER's client — auth.uid() is null under the service-role key and
  // the update would silently match no rows.
  try {
    const supabase = await createClient();
    await supabase.rpc("set_my_preferred_locale", { p_locale: locale });
  } catch {
    // A signed-out user, or a transient database blip, must never break the
    // language switch. The cookie above already carries the choice for this
    // device; only cross-device persistence is lost.
  }
}
