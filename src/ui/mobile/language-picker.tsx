"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { mobileLocaleOptions, type AppLocale } from "@/platform/i18n/locales";
import { useLang } from "@/platform/locale/language-provider";
import { cn } from "@/platform/utils";

/**
 * Settings → Language (mobile app v2).
 *
 * "One language at a time" is the v2 rule: the app chrome is never doubled
 * up with a second script. The choice is a big tap target with a sample
 * sentence written IN that language, so a clerk who cannot read the label can
 * still recognise the one they want.
 *
 * The phone offers English and हिन्दी, per the design. Hinglish is still a
 * supported locale (fully translated, chosen by real accounts) — it just is
 * not offered here. If it IS the active locale we render its row anyway:
 * hiding it would leave the group with nothing selected and no way back.
 *
 * The printed receipt deliberately stays bilingual — parents read it, and they
 * are not the ones who picked this setting.
 */

const nativeName: Record<AppLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  "hi-en": "Hinglish",
};

const sample: Record<AppLocale, string> = {
  en: "Collect a fee · Pending · Receipts",
  hi: "फीस जमा करें · बाकी · रसीदें",
  "hi-en": "Fees jama karein · Baaki · Rasidein",
};

export function LanguagePicker({ className }: { className?: string }) {
  const { locale, setLocale, isSwitching } = useLang();
  const t = useTranslations("MobileApp");

  const options: AppLocale[] = mobileLocaleOptions.includes(locale)
    ? [...mobileLocaleOptions]
    : [...mobileLocaleOptions, locale];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="radiogroup" aria-label="App language" className="flex flex-col gap-2">
        {options.map((option) => {
          const selected = option === locale;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isSwitching}
              onClick={() => {
                if (!selected) setLocale(option);
              }}
              className={cn(
                "focus-ring flex min-h-14 items-center gap-3 rounded-[14px] border-2 px-3.5 text-left transition-colors",
                "disabled:opacity-60",
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-card active:bg-surface-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {selected ? <Check className="size-4" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[14px] font-extrabold leading-tight",
                    selected ? "text-accent-soft-foreground" : "text-foreground",
                  )}
                >
                  {nativeName[option]}
                </span>
                <span className="block truncate text-[11.5px] font-medium text-muted-foreground">
                  {sample[option]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {t("languageNote")}
      </p>
    </div>
  );
}
