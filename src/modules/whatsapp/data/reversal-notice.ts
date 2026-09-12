import "server-only";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import { describeReversalCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v5";
import { isNoticeLanguage, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { formatDdMmYyyy, istTodayIso } from "@/platform/helpers/date";

/**
 * "That payment came back off."
 *
 * A reversal is completely invisible to a family today. They believe they have
 * paid — they are holding a receipt that says so — and the first they hear is a
 * reminder, or a defaulter call, or a child being asked about fees at school.
 * This is the message that should exist before any of those.
 *
 * Body-only. There is no document: the receipt the parent holds is exactly the
 * thing that is now wrong, and attaching it would say the opposite of the
 * message.
 *
 * **It can never fail a reversal.** Same contract as the receipt notice: every
 * path returns a reason rather than throwing, it runs inside `after()` once the
 * reversal has already succeeded, and the caller swallows anything that escapes.
 *
 * Deliberately NOT hooked to two other paths that also move money backwards:
 *
 *   - `undo_recent_payment` — ten minutes, and the parent is still at the
 *     counter. A message about a mistake the cashier is fixing in front of them
 *     is noise at best.
 *   - the write-off close-out — a discount-mode receipt that moves no cash.
 *     Announcing a reversal of money that never arrived would be a lie.
 */

export type ReversalNoticeResult =
  | { sent: true; providerMessageId: string | null }
  | { sent: false; reason: string };

export type ReversalNoticeArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  /** The receipt that was reversed. Half of the idempotency key. */
  receiptId: string;
  receiptNumber: string;
  studentId: string;
  sessionLabel: string;
  /** The money taken back off the ledger. */
  amountReversed: number;
  /** ISO. Rendered DD-MM-YYYY for the message. */
  reversedOn: string;
  staffId: string | null;
};

/**
 * Is the toggle on?
 *
 * Its own key, not the receipt one. Turning receipts on is a decision about
 * messaging every paying parent; turning reversal notices on is a decision
 * about telling a handful of families bad news. Someone may well want one
 * without the other, and folding them together would make that impossible.
 */
export async function isReversalNoticeEnabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_reversal_notice_enabled")
      .maybeSingle();
    return String(data?.value ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * Send one reversal notice.
 *
 * Claimed on `(receipt_id, notice_kind)`, which is why `20260912165421` re-keyed
 * that index: a receipt may legitimately produce one "payment received" and,
 * later, one "payment reversed". Under the old `(receipt_id)` key the second
 * would have been reported as a duplicate of the first and never sent.
 */
export async function sendReversalNotice(
  args: ReversalNoticeArgs,
): Promise<ReversalNoticeResult> {
  const { supabase, receiptId, receiptNumber, studentId, sessionLabel, staffId } = args;

  if (!(await isReversalNoticeEnabled(supabase))) {
    return { sent: false, reason: "Reversal notices are switched off." };
  }

  const { data: financial, error: financialError } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, student_name, father_name, father_phone, mother_phone, inst1_pending, inst2_pending, inst3_pending, inst4_pending",
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

  const campaign = describeReversalCampaign(language);
  if (!campaign) return { sent: false, reason: "No reversal campaign for that language." };
  if (!campaign.approved) {
    return { sent: false, reason: `${campaign.campaignName} is awaiting Meta approval.` };
  }

  // Read AFTER the reversal, from the ledger, so the figure is what the family
  // now owes rather than what they owed plus the amount — which would be wrong
  // whenever the reversal also released a discount or a waiver.
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
    receiptNumber,
    amountReversed: args.amountReversed,
    reversedOn: formatDdMmYyyy(args.reversedOn),
    remainingBalance,
  };
  const templateParams = campaign.buildParams(values);

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
      document_path: null,
      sent_on: istTodayIso(),
      notice_kind: "reversal",
      sent_by: staffId,
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      // Reversing an already-reversed receipt is refused upstream, so this is
      // a retried request rather than a second reversal. Either way the family
      // has been told once, which is the right number of times.
      return { sent: false, reason: "A reversal notice for this receipt has already been sent." };
    }
    return { sent: false, reason: `Could not claim the notice: ${claimError.message}` };
  }

  const result = await sendAisensyCampaignMessage({
    campaignName: campaign.campaignName,
    destination,
    userName: values.parentName,
    templateParams,
    source: "veerpatta-fees-app/reversal",
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
