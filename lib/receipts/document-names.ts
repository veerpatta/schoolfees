/**
 * Filenames for the parent-facing receipt artefacts.
 *
 * Deliberately free of `server-only` and of every PDF/React import: the share
 * sheet is a client component and needs the same names the server routes send
 * in `Content-Disposition`, or a downloaded file and a shared file disagree.
 *
 * The receipt number is the identity here, never the student's display name —
 * a name puts Devanagari (and whatever the office typed) into a filename that
 * then travels to a parent's phone.
 */

/** Anything outside this set is replaced, so the name survives any filesystem. */
function safeReceiptNumber(receiptNumber: string): string {
  return receiptNumber.replace(/[^A-Za-z0-9._-]/g, "-");
}

type NameableReceipt = {
  receiptNumber: string;
  /** True once reversals cancel the receipt in full. */
  isVoided?: boolean;
};

/**
 * The REVERSED- prefix is part of the guard, not decoration: a reversed receipt
 * that reaches a parent's downloads folder should say so before it is opened.
 */
export function receiptPdfFilename(receipt: NameableReceipt): string {
  return `${receipt.isVoided ? "REVERSED-" : ""}receipt-${safeReceiptNumber(receipt.receiptNumber)}.pdf`;
}

/** The 1080x1080 share card. Same naming rule as the PDF. */
export function receiptCardFilename(receipt: NameableReceipt): string {
  return `${receipt.isVoided ? "REVERSED-" : ""}receipt-${safeReceiptNumber(receipt.receiptNumber)}.png`;
}
