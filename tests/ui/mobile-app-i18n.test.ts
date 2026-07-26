import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readMessages(locale: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"),
  ) as { MobileApp?: Record<string, string> };
}

/**
 * The phone app's own copy lives in the `MobileApp` namespace. The v2 design's
 * central promise is one language at a time, chosen per account — so an
 * English-only string on a phone screen is a bug, not a rough edge.
 *
 * Guards the retrofit trap: every key must exist in all three catalogues, with
 * matching placeholders, or a Hindi user gets an English fallback or a crash.
 */
describe("mobile app i18n", () => {
  const locales = ["en", "hi", "hi-en"] as const;

  it("defines the MobileApp namespace in every locale", () => {
    for (const locale of locales) {
      expect(readMessages(locale).MobileApp, `${locale} is missing MobileApp`).toBeDefined();
    }
  });

  it("keeps the same keys across every locale", () => {
    const en = Object.keys(readMessages("en").MobileApp ?? {}).sort();
    expect(en.length).toBeGreaterThan(20);

    for (const locale of locales.slice(1)) {
      expect(Object.keys(readMessages(locale).MobileApp ?? {}).sort(), locale).toEqual(en);
    }
  });

  it("keeps the same placeholders in every translation", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
    const en = readMessages("en").MobileApp ?? {};

    for (const locale of locales.slice(1)) {
      const other = readMessages(locale).MobileApp ?? {};
      for (const [key, value] of Object.entries(en)) {
        expect(placeholders(other[key] ?? ""), `${locale}.${key}`).toEqual(placeholders(value));
      }
    }
  });

  it("leaves no untranslated string in the phone home screen", () => {
    const source = readFileSync(
      join(process.cwd(), "components/dashboard/mobile-dashboard-screen.tsx"),
      "utf8",
    );
    // Every visible label goes through t(...); the only bare text left should
    // be JSX punctuation and class names.
    expect(source).toContain('getTranslations("MobileApp")');
    expect(source).not.toContain(">Collected today<");
    expect(source).not.toContain(">Pending by class<");
  });
});
