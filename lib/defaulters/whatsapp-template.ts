/**
 * WhatsApp / SMS draft generator for defaulter outreach.
 *
 * The app generates the text and copies to the staff's clipboard — it does
 * NOT send messages. Sending requires explicit human action via the staff's
 * messaging tool of choice.
 *
 * Template placeholders:
 *   {studentName}, {className}, {amount}, {dueLabel}, {schoolName}
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
  /** Optional template override; falls back to the canonical polite reminder. */
  template?: string;
};

export const DEFAULT_WHATSAPP_TEMPLATE = [
  "Namaste {studentName} ji,",
  "",
  "Gentle reminder: school fees of {amount} are pending for {className} ({dueLabel}).",
  "Kindly clear at your earliest convenience — feel free to call the fee office for any clarification.",
  "",
  "Regards,",
  "{schoolName}",
].join("\n");

export function composeDefaulterDraft(input: DefaulterDraftInput): string {
  const template = input.template ?? DEFAULT_WHATSAPP_TEMPLATE;
  return template
    .replaceAll("{studentName}", input.studentName)
    .replaceAll("{className}", input.className)
    .replaceAll("{amount}", formatInr(input.outstandingAmount))
    .replaceAll("{dueLabel}", input.dueLabel)
    .replaceAll("{schoolName}", input.schoolName);
}
