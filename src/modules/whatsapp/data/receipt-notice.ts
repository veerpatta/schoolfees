import "server-only";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import { describeReceiptCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v3";
import { isNoticeLanguage, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { formatDdMmYyyy } from "@/platform/helpers/date";

/**
 * "Your payment reached us."
 *
 * The office's most common inbound WhatsApp is a parent asking whether the money
 * arrived. This answers it before it is asked, and it is the only message in
 * this system a family is pleased to receive.
 *
 * **It can never fail a posting.** Every path returns a reason rather than
 * throwing, the caller wraps it in a try/catch anyway, and it runs strictly
 * after `post_student_payment_with_adjustments` has returned success and outside
 * any transaction. The money is in the drawer and the receipt is printed
 * whatever happens here.
 *
 * Off by default. `app_settings.whatsapp_receipt_notice_enabled` has to be
 * `'true'` AND the template has to be approved. A feature that starts messaging
 * parents the moment it deploys is not a feature, it is an incident.
 */

export type ReceiptNoticeResult =
  | { sent: true; providerMessageId: string | null }
  | { sent: false; reason: string };

export type ReceiptNoticeArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  receiptId: string;
  receiptNumber: string;
  studentId: string;
  sessionLabel: string;
  amountPaid: number;
  /** ISO. Rendered DD-MM-YYYY for the message. */
  paymentDate: string;
  staffId: string | null;
};

/** Is the toggle on? Reads the same key/value store the active session uses. */
export async function isReceiptNoticeEnabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_receipt_notice_enabled")
      .maybeSingle();
    return String(data?.value ?? "").toLowerCase() === "true";
  } catch {
    // Unreadable setting reads as OFF. The failure mode of guessing "on" is
    // messaging every paying parent without anyone having asked for it.
    return false;
  }
}

/**
 * Send one receipt notice. Best-effort throughout.
 *
 * The row is claimed on `receipt_id` before the provider call, exactly as a
 * reminder claims its day, so a retried posting cannot send a second copy — the
 * partial unique index decides the race rather than a check-then-send.
 */
export async function sendReceiptNotice(
  args: ReceiptNoticeArgs,
): Promise<ReceiptNoticeResult> {
  const { supabase, receiptId, receiptNumber, studentId, sessionLabel, staffId } = args;

  if (!(await isReceiptNoticeEnabled(supabase))) {
    return { sent: false, reason: "Receipt notices are switched off." };
  }

  // One read for everything about this family: the number to use, the language
  // they read, whether they may be contacted at all, and what is left owing.
  const { data: financial, error: financialError } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, student_name, father_name, father_phone, mother_phone, class_label, inst1_pending, inst2_pending, inst3_pending, inst4_pending",
    )
    .eq("session_label", sessionLabel)
    .eq("student_id", studentId)
    .maybeSingle();

  if (financialError || !financial) {
    return { sent: false, reason: "Could not read the student's ledger." };
  }

  const { data: flags } = await supabase
    .from("student_collection_flags")
    .select("no_call, whatsapp_cadence, whatsapp_language")
    .eq("session_label", sessionLabel)
    .eq("student_id", studentId)
    .maybeSingle();

  // The same two exclusions the reminders honour. A family who asked not to be
  // contacted did not ask only about reminders, and `never` means never.
  if (flags?.no_call === true) {
    return { sent: false, reason: "This family is flagged no-call." };
  }
  if (flags?.whatsapp_cadence === "never") {
    return { sent: false, reason: "This family's WhatsApp cadence is set to never." };
  }

  const destination =
    toWhatsappDestination(financial.father_phone) ??
    toWhatsappDestination(financial.mother_phone);
  if (!destination) {
    return { sent: false, reason: "No usable WhatsApp number on record." };
  }

  const language: NoticeLanguage = isNoticeLanguage(flags?.whatsapp_language)
    ? (flags.whatsapp_language as NoticeLanguage)
    : "hi";

  const campaign = describeReceiptCampaign(language);
  if (!campaign) return { sent: false, reason: "No receipt campaign for that language." };
  if (!campaign.approved) {
    return {
      sent: false,
      reason: `${campaign.campaignName} is awaiting Meta approval.`,
    };
  }

  // What is left AFTER this payment. Read from the ledger rather than computed
  // from the amount, so a discount or an adjustment applied in the same posting
  // is reflected — and so the figure agrees with the receipt the parent holds.
  const remainingBalance =
    Number(financial.inst1_pending ?? 0) +
    Number(financial.inst2_pending ?? 0) +
    Number(financial.inst3_pending ?? 0) +
    Number(financial.inst4_pending ?? 0);

  const titleCase = (value: string | null | undefined) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase())
      .trim();

  const values = {
    parentName: titleCase(financial.father_name) || "अभिभावक",
    studentName: titleCase(financial.student_name),
    studentClass: String(financial.class_label ?? ""),
    receiptNumber,
    amountPaid: args.amountPaid,
    paymentDate: formatDdMmYyyy(args.paymentDate),
    remainingBalance,
  };
  const templateParams = campaign.buildParams(values);

  // Claim on receipt_id BEFORE the provider call. The partial unique index is
  // what actually stops a retried posting sending a second copy.
  const { data: claim, error: claimError } = await supabase
    .from("whatsapp_reminder_sends")
    .insert({
      student_id: studentId,
      session_label: sessionLabel,
      campaign_name: campaign.campaignName,
      destination,
      due_amount: remainingBalance,
      template_params: templateParams,
      status: "pending",
      language,
      destination_role: "primary",
      receipt_id: receiptId,
      sent_by: staffId,
    })
    .select("id")
    .single();

  if (claimError) {
    // 23505 on the receipt index: this receipt has already been notified. That
    // is the guard working, not a failure.
    if (claimError.code === "23505") {
      return { sent: false, reason: "A notice for this receipt has already been sent." };
    }
    return { sent: false, reason: `Could not claim the notice: ${claimError.message}` };
  }

  const result = await sendAisensyCampaignMessage({
    campaignName: campaign.campaignName,
    destination,
    userName: values.parentName,
    templateParams,
    source: "veerpatta-fees-app/receipt",
  });

  await supabase
    .from("whatsapp_reminder_sends")
    .update({
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.ok ? result.messageId : null,
      error_message: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  return result.ok
    ? { sent: true, providerMessageId: result.messageId ?? null }
    : { sent: false, reason: result.error };
}
