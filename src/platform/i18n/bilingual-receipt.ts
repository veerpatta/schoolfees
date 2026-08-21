import { createTranslator } from "next-intl";

// Compact en + hi catalog holding ONLY the `Receipts` namespace. Importing the
// full `messages/{en,hi}.json` here would bundle ~190 KB of unrelated strings
// into the client preview sheet; this slice is ~18 KB. A unit test
// (`tests/unit/receipts-bilingual-catalog.test.ts`) keeps it byte-for-byte in
// sync with the source dictionaries so the two never drift.
import receiptsBilingual from "@/messages/receipts-bilingual.json";

const enMessages = { Receipts: receiptsBilingual.en };
const hiMessages = { Receipts: receiptsBilingual.hi };

/**
 * Translator function scoped to the `Receipts` namespace.
 * Compatible with `getTranslations("Receipts")` / `useTranslations("Receipts")`.
 */
export type ReceiptTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * A locale-independent translator for **parent-facing** documents.
 *
 * Parent documents (receipts, fee statements) always render English AND
 * Devanagari Hindi together, regardless of the staff member's UI locale.
 * They therefore must NOT read the `vpps_locale` cookie — they pull from the
 * static `en` and `hi` catalogs directly.
 *
 *   - `en(key)`  → English only
 *   - `hi(key)`  → Hindi only
 *   - `both(key)` → "English\nहिंदी" (plain-text spots: PDF, WhatsApp/email)
 */
export type BilingualReceiptTranslator = {
  en: ReceiptTranslator;
  hi: ReceiptTranslator;
  both: (key: string, values?: Record<string, string | number>) => string;
};

function namespaceTranslator(
  locale: "en" | "hi",
  // next-intl types the catalog tightly; we only need the loose call shape.
  messages: Record<string, unknown>,
): ReceiptTranslator {
  const t = createTranslator({
    locale,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    namespace: "Receipts",
  });
  return ((key: string, values?: Record<string, string | number>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any)(key, values)) as ReceiptTranslator;
}

/**
 * Build the bilingual translator for receipts / fee statements. Pure and
 * synchronous, so it works identically in Server Components, Route Handlers,
 * and Client Components.
 */
export function createBilingualReceiptTranslator(): BilingualReceiptTranslator {
  const en = namespaceTranslator("en", enMessages as Record<string, unknown>);
  const hi = namespaceTranslator("hi", hiMessages as Record<string, unknown>);

  return {
    en,
    hi,
    both: (key, values) => `${en(key, values)}\n${hi(key, values)}`,
  };
}
