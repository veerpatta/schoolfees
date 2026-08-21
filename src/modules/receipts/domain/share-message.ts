import { formatInr } from "@/platform/helpers/currency";
import { schoolProfile } from "@/platform/config/school";
import { renderWhatsappTemplate } from "@/modules/whatsapp/domain/render";
import type { ReceiptDetail } from "@/modules/receipts/domain/types";

/**
 * The text that travels with a receipt to a parent.
 *
 * One source for both share surfaces — the desktop template sheet
 * (`components/receipts/receipt-share-actions.tsx`) and the phone's one-tap
 * send (`components/receipts/share-receipt-whatsapp.tsx`). They used to hold
 * their own copies of the body, which is how one of them would eventually
 * start saying something the other did not.
 *
 * Bodies are bilingual English + Devanagari **in the constant**, not in
 * `messages/*.json`, for the same reason `messages/receipts-bilingual.json`
 * exists: this is a parent-facing document. What it says must not depend on
 * which UI language the staff member happens to have selected.
 */

export const DEFAULT_RECEIPT_BODY = [
  "Namaste {{fatherName}} ji,",
  "",
  "We have received your payment for {{studentName}} ({{className}}).",
  "Receipt number: {{receiptNumber}}, Amount: {{amount}}.",
  "",
  "Thank you for your prompt payment.",
  "",
  "— — —",
  "",
  "नमस्ते,",
  "",
  "{{studentName}} ({{className}}) की आपकी फीस प्राप्त हो गई है।",
  "रसीद संख्या: {{receiptNumber}}, राशि: {{amount}}।",
  "",
  "समय पर भुगतान के लिए धन्यवाद।",
  "",
  "Regards / सादर,",
  "{{schoolName}}",
].join("\n");

/**
 * A reversed receipt is not proof of payment, so it never borrows the
 * confirmation body — not even with tokens substituted. There is no wording of
 * "we have received your payment" that is true for a receipt that has been
 * cancelled, which is why this is a separate constant and why
 * `buildReceiptShareMessage` ignores any chosen template when `isVoided`.
 */
export const REVERSED_RECEIPT_BODY = [
  "Namaste {{fatherName}} ji,",
  "",
  "Receipt {{receiptNumber}} for {{studentName}} ({{className}}) has been REVERSED.",
  "It is no longer proof of payment. Amount: {{amount}}.",
  "",
  "Please contact the school office.",
  "",
  "— — —",
  "",
  "नमस्ते,",
  "",
  "{{studentName}} ({{className}}) की रसीद {{receiptNumber}} रद्द कर दी गई है।",
  "यह अब भुगतान का प्रमाण नहीं है। राशि: {{amount}}।",
  "",
  "कृपया विद्यालय कार्यालय से संपर्क करें।",
  "",
  "Regards / सादर,",
  "{{schoolName}}",
].join("\n");

/**
 * The receipt template the office has made active, if any.
 *
 * One definition rather than a `.find()` repeated at each surface — the
 * previous arrangement had the receipt page reading the admin's template while
 * the same receipt opened from the list quietly used the built-in body, so one
 * receipt could produce two different messages.
 */
export function activeReceiptTemplateBody(
  templates: { category: string; isActive: boolean; body: string }[] | undefined | null,
): string | null {
  return (
    templates?.find((template) => template.category === "receipt" && template.isActive)
      ?.body ?? null
  );
}

export type ReceiptShareMessageSource = Pick<
  ReceiptDetail,
  "receiptNumber" | "totalAmount" | "studentFullName" | "fatherName" | "classLabel"
> &
  Pick<Partial<ReceiptDetail>, "isVoided">;

/** The tokens every receipt template may use. Shared so one authored template
 *  renders identically in the desktop sheet and the phone's one-tap send. */
export function receiptTemplateVars(
  receipt: ReceiptShareMessageSource,
): Record<string, string> {
  return {
    studentName: receipt.studentFullName,
    fatherName: receipt.fatherName ?? "Parent",
    className: receipt.classLabel,
    receiptNumber: receipt.receiptNumber,
    amount: formatInr(receipt.totalAmount),
    schoolName: schoolProfile.shortName,
  };
}

export function buildReceiptShareMessage({
  receipt,
  templateBody,
}: {
  receipt: ReceiptShareMessageSource;
  /** The admin-authored template chosen for this send, when there is one. */
  templateBody?: string | null;
}): string {
  const body = receipt.isVoided
    ? REVERSED_RECEIPT_BODY
    : (templateBody ?? DEFAULT_RECEIPT_BODY);
  return renderWhatsappTemplate(body, receiptTemplateVars(receipt));
}
