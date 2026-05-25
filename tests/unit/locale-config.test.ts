import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  localeLabels,
  supportedLocales,
} from "@/i18n/locales";

const REPO_ROOT = process.cwd();

function readMessageCatalog(locale: string) {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "messages", `${locale}.json`), "utf-8"),
  ) as Record<string, Record<string, string>>;
}

describe("i18n config", () => {
  it("ships English, Hindi, and Hinglish as the supported locales", () => {
    expect(supportedLocales).toEqual(["en", "hi", "hi-en"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALE_COOKIE_NAME).toBe("vpps_locale");
  });

  it("provides a human label for every supported locale", () => {
    for (const locale of supportedLocales) {
      expect(localeLabels[locale]).toBeTruthy();
    }
  });

  it("treats only the three known codes as supported", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("hi")).toBe(true);
    expect(isSupportedLocale("hi-en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe("i18n message catalogs", () => {
  const english = readMessageCatalog("en");

  it("ships a non-empty English catalog", () => {
    expect(Object.keys(english).length).toBeGreaterThan(0);
    expect(english.Locale?.label).toBeTruthy();
    expect(english.Common?.save).toBeTruthy();
    expect(english.Navigation?.dashboard).toBeTruthy();
  });

  it("Hindi and Hinglish catalogs cover every English key", () => {
    for (const locale of ["hi", "hi-en"] as const) {
      const catalog = readMessageCatalog(locale);
      for (const [namespace, keys] of Object.entries(english)) {
        expect(catalog[namespace], `${locale} is missing namespace ${namespace}`).toBeTruthy();
        for (const key of Object.keys(keys)) {
          expect(
            catalog[namespace]?.[key],
            `${locale}.${namespace}.${key} is missing or empty`,
          ).toBeTruthy();
        }
      }
    }
  });
});
