import { formatRupeesPlain } from "@/lib/helpers/currency";

/**
 * The approved WhatsApp template: its slots, its fixed wording, and the one
 * function that fills them.
 *
 * Deliberately free of `server-only`, because the reminders screen renders a
 * live preview as staff type. That also means this file must never
 * value-import `./aisensy` or `./fee-reminders`: both carry
 * `import "server-only"`, and `tests/scan/checks/client-boundary.mjs` seeds its
 * graph from every `"use client"` module and fails on the first such edge.
 */

/**
 * The deadline printed inside the approved template body.
 *
 * "Fees Collection August" reads `अंतिम तिथि: 25 अगस्त 2026` and warns of a
 * 1,000-rupee-per-installment late fee "after that". There is no date variable
 * to override. From the 26th the message is factually wrong, so the screen
 * warns and the server action refuses. Approve a replacement template before
 * moving this date.
 */
export const FEE_REMINDER_TEMPLATE_DEADLINE = "2026-08-25";

/**
 * The same deadline as the template body prints it, kept next to the ISO date
 * so the two cannot drift. The preview used to hardcode this string on its own,
 * which meant moving FEE_REMINDER_TEMPLATE_DEADLINE would have left the preview
 * quoting the old date.
 */
export const FEE_REMINDER_DEADLINE_LABEL = "25 अगस्त 2026";

/**
 * The installments the approved template's wording actually names: it says
 * "किश्त 1 एवं किश्त 2" in fixed text. Filter on anything else and the message
 * will still claim installments 1 and 2, so the screen warns when the selection
 * differs.
 */
export const TEMPLATE_INSTALLMENTS = [1, 2] as const;

/**
 * Slot order inside the template, confirmed on 2026-08-20 by sending P1..P4
 * markers to a staff number and reading what arrived:
 *
 *   प्रिय P1,                       -> parent name
 *   P2 (P3) की ... किश्त 1 एवं 2    -> student name, class
 *   देय राशि: रु. P4                -> amount, plain grouped digits; the
 *                                      template supplies the "रु." itself
 *
 * Four slots. Sending five is rejected with "Template params does not match
 * the campaign", which is how the count was established.
 */
export const FEE_REMINDER_PARAM_ORDER = [
  "parentName",
  "studentName",
  "studentClass",
  "dueAmount",
] as const;

/** Everything the template needs to say something true about one family. */
export type ReminderTemplateValues = {
  parentName: string;
  studentName: string;
  studentClass: string;
  dueAmount: number;
};

/**
 * Values for the template's four slots, in the order the template expects.
 *
 * A four-tuple rather than `string[]` so the count that AiSensy enforces is
 * also enforced here. Not `readonly` — `AisensySendArgs.templateParams` is a
 * mutable `string[]`, and a readonly tuple would not be assignable to it.
 */
export function buildReminderParams(
  values: ReminderTemplateValues,
): [string, string, string, string] {
  return [
    values.parentName,
    values.studentName,
    values.studentClass,
    formatRupeesPlain(values.dueAmount),
  ];
}

/**
 * The approved body, filled — for preview only. WhatsApp sends whatever Meta
 * approved, not this text, and the real message carries a UPI link and the
 * office number below what is reproduced here.
 *
 * Built FROM `buildReminderParams` rather than beside it, so the preview and
 * the message can never quote different values. Anything that changes the
 * params changes the preview in the same breath.
 */
export function renderReminderPreview(
  values: ReminderTemplateValues & { sessionLabel: string },
): string {
  const [parentName, studentName, studentClass, amount] = buildReminderParams(values);

  return [
    "*फीस सूचना - किश्त 1 एवं 2*",
    `प्रिय ${parentName},`,
    "",
    `श्री वीर पत्ता सीनियर सेकेंडरी स्कूल की ओर से सूचित किया जाता है कि ${studentName} (${studentClass}) की सत्र ${values.sessionLabel} की किश्त 1 एवं किश्त 2 की फीस अभी बकाया है।`,
    "",
    `देय राशि: रु. ${amount}`,
    `अंतिम तिथि: ${FEE_REMINDER_DEADLINE_LABEL}`,
  ].join("\n");
}
