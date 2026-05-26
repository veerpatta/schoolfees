import type { ReceiptDetail } from "@/lib/receipts/types";
import { ReceiptDocumentV2 } from "@/components/receipts/receipt-document-v2";

/**
 * Translator function used by ReceiptDocument and ReceiptDocumentV2.
 * Compatible with both `getTranslations("Receipts")` (server) and
 * `useTranslations("Receipts")` (client) — both return a callable with
 * this shape.
 */
export type ReceiptTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

type ReceiptDocumentMode = "print" | "draft" | "saved";

type ReceiptDocumentProps = {
  receipt: ReceiptDetail;
  /** Translator scoped to the Receipts namespace. Required. */
  t: ReceiptTranslator;
  className?: string;
  mode?: ReceiptDocumentMode;
  /**
   * Accepted for backwards compatibility with call sites that haven't been
   * scrubbed yet. Has no effect — the receipt always renders the simplified
   * V2 layout.
   */
  density?: "full" | "compact";
  /**
   * When false, the per-receipt `@page` size rule is omitted so the surrounding
   * page can control pagination (e.g. batch reprint of family receipts on A4
   * with one receipt per page).
   */
  embedPageStyles?: boolean;
};

/**
 * Public receipt component. Renders the simplified V2 layout for every call
 * site — the old verbose layout was deprecated in May 2026 and the env-flag
 * gating it has been removed. Call sites keep using `<ReceiptDocument …/>`;
 * the prop contract is unchanged.
 */
export function ReceiptDocument({
  receipt,
  t,
  className,
  mode = "print",
  embedPageStyles = true,
}: ReceiptDocumentProps) {
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
