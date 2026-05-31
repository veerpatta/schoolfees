import type { ReceiptTranslator } from "@/lib/i18n/bilingual-receipt";

/**
 * Maps a raw fee-head label (e.g. "Tuition fee", "Transport fee") to a
 * localized label via a single-locale Receipts translator. Falls back to the
 * raw label when nothing matches, so unknown heads still render.
 *
 * Shared by the on-screen receipt and the fee-statement PDF so both agree on
 * how a fee head reads in each language.
 */
export function localizedFeeLabel(rawLabel: string, t: ReceiptTranslator): string {
  const normalized = rawLabel.toLowerCase();
  if (normalized.includes("tuition")) return t("feeLabelTuition");
  if (normalized.includes("transport")) return t("feeLabelTransport");
  if (normalized.includes("academic")) return t("feeLabelAcademic");
  if (normalized.includes("late")) return t("feeLabelLate");
  if (normalized.includes("discount") || normalized.includes("waiver")) {
    return t("feeLabelDiscount");
  }
  if (normalized.includes("book")) return t("feeLabelBooks");
  if (normalized === "other fees") return t("feeLabelOther");
  return rawLabel;
}
