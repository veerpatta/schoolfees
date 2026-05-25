export const supportedLocales = ["en", "hi", "hi-en"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_COOKIE_NAME = "vpps_locale";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  "hi-en": "Hinglish",
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (supportedLocales as readonly string[]).includes(value)
  );
}
