import type { ReceiptDetail } from "@/lib/receipts/types";
import { ReceiptDocumentV2 } from "@/components/receipts/receipt-document-v2";
import { ReceiptDocumentV3 } from "@/components/receipts/receipt-document-v3";
import type { BilingualReceiptTranslator } from "@/lib/i18n/bilingual-receipt";

/**
 * Re-exported for call sites and tests. The receipt itself is fed a
 * locale-independent BILINGUAL translator (English + Devanagari Hindi); this
 * single-locale shape is the building block (`bt.en` / `bt.hi`).
 */
export type { ReceiptTranslator } from "@/lib/i18n/bilingual-receipt";

type ReceiptDocumentMode = "print" | "draft" | "saved";

type ReceiptDocumentProps = {
  receipt: ReceiptDetail;
  /** Bilingual translator (English + Hindi). Required. Always renders both. */
  t: BilingualReceiptTranslator;
  className?: string;
  mode?: ReceiptDocumentMode;
  /**
   * Accepted for backwards compatibility with call sites that haven't been
   * scrubbed yet. Has no effect.
   */
  density?: "full" | "compact";
  /**
   * When false, the per-receipt `@page` size rule is omitted so the surrounding
   * page can control pagination (e.g. batch reprint of family receipts on A4
   * with one receipt per page).
   */
  embedPageStyles?: boolean;
  /**
   * "v3" (default) is the Ledger Calm 2.0 layout; "v2" keeps the previous
   * simplified layout available for reprint parity.
   */
  layout?: "v2" | "v3";
  /** Absolute verify URL rendered as the footer QR (v3 only). */
  verifyUrl?: string | null;
  /** Pre-rendered QR SVG markup for `verifyUrl` (v3 only). */
  verifyQrSvg?: string | null;
};

/**
 * Public receipt component. Renders the Ledger Calm 2.0 V3 layout by default;
 * pass `layout="v2"` to reproduce the earlier simplified layout for reprints.
 */
export function ReceiptDocument({
  receipt,
  t,
  className,
  mode = "print",
  embedPageStyles = true,
  layout = "v3",
  verifyUrl = null,
  verifyQrSvg = null,
}: ReceiptDocumentProps) {
  if (layout === "v2") {
    return (
      <ReceiptDocumentV2
        receipt={receipt}
        t={t}
        className={className}
        mode={mode}
        embedPageStyles={embedPageStyles}
      />
    );
  }

  return (
    <ReceiptDocumentV3
      receipt={receipt}
      t={t}
      className={className}
      mode={mode}
      embedPageStyles={embedPageStyles}
      verifyUrl={verifyUrl}
      verifyQrSvg={verifyQrSvg}
    />
  );
}
