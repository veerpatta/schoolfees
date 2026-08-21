export const supportedLocales = ["en", "hi", "hi-en"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_COOKIE_NAME = "vpps_locale";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  "hi-en": "Hinglish",
};

/**
 * The languages the phone app offers.
 *
 * Hinglish stays a supported locale — it is fully translated and existing
 * users must not be stranded — but the v2 design's Settings card offers two
 * options, so the phone picker reads from here rather than `supportedLocales`.
 * The desktop switcher still shows all three.
 */
export const mobileLocaleOptions: readonly AppLocale[] = ["en", "hi"];

export function isSupportedLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (supportedLocales as readonly string[]).includes(value)
  );
}
