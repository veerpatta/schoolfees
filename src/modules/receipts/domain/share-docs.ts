import { receiptCardFilename, receiptPdfFilename } from "@/modules/receipts/domain/document-names";

/**
 * Which files a receipt share carries, and in which order.
 *
 * Pure and separate from the component because both of its rules are easy to
 * break by accident and neither is visible in a screenshot:
 *
 *  - **The card comes first.** `selectShareStrategy` degrades to `files[0]`
 *    when a browser refuses the pair, and the card is the one that renders
 *    inside the WhatsApp chat instead of arriving as a file to open.
 *  - **The PDF is conditional on `receipts:print`.** The card route gates on
 *    `receipts:view`, the PDF route on `receipts:print`, and three of the five
 *    roles hold only the former. Including the PDF for them would 403 halfway
 *    through preparing the share.
 */

export type ReceiptShareDoc = {
  id: "card" | "pdf";
  url: string;
  fileName: string;
  mimeType: "image/png" | "application/pdf";
  label: string;
};

export function buildReceiptShareDocs({
  receipt,
  canSendReceiptPdf,
  labels,
}: {
  receipt: { id: string; receiptNumber: string; isVoided?: boolean };
  canSendReceiptPdf: boolean;
  labels: { card: string; pdf: string };
}): ReceiptShareDoc[] {
  const docs: ReceiptShareDoc[] = [
    {
      id: "card",
      url: `/protected/receipts/${receipt.id}/card`,
      fileName: receiptCardFilename(receipt),
      mimeType: "image/png",
      label: labels.card,
    },
  ];

  if (canSendReceiptPdf) {
    docs.push({
      id: "pdf",
      url: `/protected/receipts/${receipt.id}/pdf`,
      fileName: receiptPdfFilename(receipt),
      mimeType: "application/pdf",
      label: labels.pdf,
    });
  }

  return docs;
}
