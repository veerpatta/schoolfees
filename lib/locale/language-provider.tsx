"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { NextIntlClientProvider } from "next-intl";

import { toast } from "@/components/ui/toast";
import { type AppLocale, supportedLocales } from "@/i18n/locales";
import { setLocaleAction } from "@/lib/locale/actions";

type MessageCatalog = Record<string, unknown>;

export type LanguageCatalogs = Partial<Record<AppLocale, MessageCatalog>>;

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
  // Only the active locale's catalog is required up front. Other catalogs
  // are dynamic-imported on demand the first time the user switches to them
  // (then memoized in component state). This keeps the initial JS payload
  // ~2/3 smaller per page load.
  catalogs: LanguageCatalogs;
  /**
   * The namespaces this route renders, decided server-side by
   * `namespacesForPath`. Passed through so a locale switch loads the same slice
   * the server sent, rather than silently gaining keys the first build did not
   * have — a difference that would only show up after somebody changed language.
   */
  namespaces?: readonly string[];
  children: React.ReactNode;
}

async function importCatalog(locale: AppLocale): Promise<MessageCatalog> {
  switch (locale) {
    case "en":
      return (await import("@/messages/en.json")).default as MessageCatalog;
    case "hi":
      return (await import("@/messages/hi.json")).default as MessageCatalog;
    case "hi-en":
      return (await import("@/messages/hi-en.json")).default as MessageCatalog;
  }
}

function pick(catalog: MessageCatalog, namespaces?: readonly string[]): MessageCatalog {
  if (!namespaces || namespaces.length === 0) {
    return catalog;
  }

  const picked: MessageCatalog = {};
  for (const namespace of namespaces) {
    if (namespace in catalog) {
      picked[namespace] = catalog[namespace];
    }
  }
  return picked;
}

export function LanguageProvider({
  initialLocale,
  catalogs,
  namespaces,
  children,
}: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [isSwitching, startTransition] = useTransition();
  const [loadedCatalogs, setLoadedCatalogs] =
    useState<LanguageCatalogs>(catalogs);

  const setLocale = useCallback(
    (next: AppLocale) => {
      if (next === locale) return;
      if (!(supportedLocales as readonly string[]).includes(next)) return;
      const previous = locale;
      setLocaleState(next);
      startTransition(async () => {
        try {
          await setLocaleAction(next);
        } catch {
          // The language flipped locally but never persisted, so it would
          // silently revert on the next page load. Put it back and say so
          // rather than let the user discover it later.
          setLocaleState(previous);
          toast({
            title: "Language not saved",
            description: "The app language could not be changed. Please try again.",
            tone: "danger",
          });
        }
      });
    },
    [locale],
  );

  useEffect(() => {
    if (loadedCatalogs[locale]) return;
    let cancelled = false;
    void importCatalog(locale).then((catalog) => {
      if (cancelled) return;
      setLoadedCatalogs((prev) => ({ ...prev, [locale]: pick(catalog, namespaces) }));
    });
    return () => {
      cancelled = true;
    };
  }, [locale, loadedCatalogs, namespaces]);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, isSwitching }),
    [locale, setLocale, isSwitching],
  );

  const activeMessages =
    loadedCatalogs[locale] ?? loadedCatalogs[initialLocale] ?? {};

  return (
    <LanguageContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={activeMessages}
        timeZone="Asia/Kolkata"
      >
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}
