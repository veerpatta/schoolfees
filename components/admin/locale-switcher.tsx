"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { setLocaleAction } from "@/lib/locale/actions";
import {
  localeLabels,
  supportedLocales,
  type AppLocale,
} from "@/i18n/locales";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const shortLabels: Record<AppLocale, string> = {
  en: "EN",
  hi: "हि",
  "hi-en": "HG",
};

export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Locale");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2 focus-ring"
        aria-label={t("label")}
      >
        <Globe className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="tabular-nums">{shortLabels[locale] ?? "EN"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("menuHeading")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLocales.map((option) => (
          <form key={option} action={setLocaleAction.bind(null, option)}>
            <DropdownMenuItem asChild>
              <button
                type="submit"
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-current={option === locale ? "true" : undefined}
              >
                <span>{localeLabels[option]}</span>
                {option === locale ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {t("current")}
                  </span>
                ) : null}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
