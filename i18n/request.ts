import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { isLocaleSwitcherEnabled } from "@/lib/env";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type AppLocale,
} from "./locales";

/**
 * Resolves the active locale for the current request and loads its message
 * catalog. The locale is read from the `vpps_locale` cookie when the locale
 * switcher is enabled, otherwise English is forced.
 *
 * Wired in `next.config.ts` via `createNextIntlPlugin("./i18n/request.ts")`.
 */
export default getRequestConfig(async () => {
  let locale: AppLocale = DEFAULT_LOCALE;

  if (isLocaleSwitcherEnabled()) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    if (isSupportedLocale(cookieValue)) {
      locale = cookieValue;
    }
  }

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
