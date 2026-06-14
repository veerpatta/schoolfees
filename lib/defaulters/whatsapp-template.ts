/**
 * WhatsApp / SMS draft generator for defaulter outreach.
 *
 * The app generates the text and copies to the staff's clipboard — it does
 * NOT send messages. Sending requires explicit human action via the staff's
 * messaging tool of choice.
 *
 * Template placeholders:
 *   {studentName}, {className}, {amount}, {dueLabel}, {schoolName}, {paymentBlock}
 */

import { formatInr } from "@/lib/helpers/currency";

export type DefaulterDraftInput = {
  studentName: string;
  className: string;
  /** Amount in INR (paise NOT supported here — pass formatted rupees). */
  outstandingAmount: number;
  /** Human label: "Q1 due 20-04-2026", "Total dues", etc. */
  dueLabel: string;
  schoolName: string;
  /** Optional UPI intent link for direct parent payment. */
  paymentLink?: string;
  /** Short office-readable reference included in the UPI note. */
  paymentReference?: string;
  /** Optional template override; falls back to the canonical polite reminder. */
  template?: string;
};

export const DEFAULT_WHATSAPP_TEMPLATE = [
  "Namaste {studentName} ji,",
  "",
  "Gentle reminder: school fees of {amount} are pending for {className} ({dueLabel}).",
  "Kindly clear at your earliest convenience — feel free to call the fee office for any clarification.",
  "{paymentBlock}",
  "",
  "— — —",
  "",
  "नमस्ते,",
  "",
  "सूचना: {className} के लिए {studentName} की {amount} फीस बकाया है। कृपया शीघ्र जमा करें — किसी भी सहायता के लिए विद्यालय कार्यालय से संपर्क करें।",
  "{paymentBlock}",
  "",
  "Regards / सादर,",
  "{schoolName}",
].join("\n");

export type PaymentBlockInput = {
  paymentLink?: string;
  paymentReference?: string;
};

function paymentBlock(input: PaymentBlockInput) {
  if (!input.paymentLink) return "";
  const reference = input.paymentReference ? `Reference: ${input.paymentReference}` : "";
  return [
    "",
    "UPI payment link:",
    input.paymentLink,
    reference,
    "After payment, please share the UPI screenshot/UTR. Receipt will be posted from Payment Desk after office verification.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function appendPaymentBlockIfMissing(text: string, input: PaymentBlockInput) {
  const block = paymentBlock(input);
  if (!block || (input.paymentLink && text.includes(input.paymentLink))) {
    return text;
  }
  return `${text.trimEnd()}\n${block}`;
}

export function composeDefaulterDraft(input: DefaulterDraftInput): string {
  const template = input.template ?? DEFAULT_WHATSAPP_TEMPLATE;
  return template
    .replaceAll("{studentName}", input.studentName)
    .replaceAll("{className}", input.className)
    .replaceAll("{amount}", formatInr(input.outstandingAmount))
    .replaceAll("{dueLabel}", input.dueLabel)
    .replaceAll("{schoolName}", input.schoolName)
    .replaceAll("{paymentBlock}", paymentBlock(input));
}
