"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { NextIntlClientProvider } from "next-intl";

import { type AppLocale, supportedLocales } from "@/i18n/locales";
import { setLocaleAction } from "@/lib/locale/actions";

type MessageCatalog = Record<string, unknown>;

export type LanguageCatalogs = Record<AppLocale, MessageCatalog>;

interface LanguageContextValue {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  isSwitching: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used inside <LanguageProvider>");
  }
  return ctx;
}

interface LanguageProviderProps {
  initialLocale: AppLocale;
  catalogs: LanguageCatalogs;
  children: React.ReactNode;
}

export function LanguageProvider({
  initialLocale,
  catalogs,
  children,
}: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [isSwitching, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: AppLocale) => {
      if (next === locale) return;
      if (!(supportedLocales as readonly string[]).includes(next)) return;
      setLocaleState(next);
      startTransition(() => {
        void setLocaleAction(next);
      });
    },
    [locale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, isSwitching }),
    [locale, setLocale, isSwitching],
  );

  const activeMessages = catalogs[locale] ?? catalogs[initialLocale];

  return (
    <LanguageContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={activeMessages}>
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}
