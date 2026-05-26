"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AppLocale, supportedLocales } from "@/i18n/locales";
import { useLang } from "@/lib/locale/language-provider";

// Full native name shown on the pill so non-technical staff recognise their
// language at a glance instead of decoding a two-letter code.
const pillLabel: Record<AppLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  "hi-en": "Hinglish",
};

// One-line preview rendered in the dropdown row, written in that language so
// the user can recognise the script and tone before committing.
const optionPreview: Record<AppLocale, string> = {
  en: "Today's collection ₹45,000",
  hi: "आज की वसूली ₹45,000",
  "hi-en": "Aaj ki vasooli ₹45,000",
};

export function LocaleSwitcher() {
  const { locale, setLocale, isSwitching } = useLang();
  const t = useTranslations("Locale");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 focus-ring disabled:opacity-60"
        aria-label={t("label")}
        disabled={isSwitching}
      >
        <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>{pillLabel[locale]}</span>
        <ChevronDown
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("menuHeading")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLocales.map((option) => {
          const isActive = option === locale;
          return (
            <DropdownMenuItem
              key={option}
              onSelect={(event) => {
                event.preventDefault();
                setLocale(option);
              }}
              aria-current={isActive ? "true" : undefined}
              className="flex items-start gap-3 py-2"
            >
              <Check
                aria-hidden="true"
                className={`mt-0.5 size-4 shrink-0 ${
                  isActive ? "text-accent" : "text-transparent"
                }`}
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {pillLabel[option]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {optionPreview[option]}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
