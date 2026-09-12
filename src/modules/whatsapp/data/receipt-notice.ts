import "server-only";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import {
  parentFacingFilename,
  storeNoticeDocument,
  type StoredDocument,
} from "@/modules/whatsapp/data/document-store";
import { describeReceiptCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v3";
import { describeReceiptDocumentCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v5";
import { isNoticeLanguage, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { createAbsoluteUrl } from "@/platform/env";
import { formatDdMmYyyy, istTodayIso } from "@/platform/helpers/date";

/**
 * "Your payment reached us." — with the receipt attached.
 *
 * The office's most common inbound WhatsApp is a parent asking whether the money
 * arrived. This answers it before it is asked, and it is the only message in
 * this system a family is pleased to receive. Since 2026-09-12 it also carries
 * the receipt itself as a PDF, so the parent keeps the document rather than a
 * promise of one.
 *
 * **It can never fail a posting.** Every path returns a reason rather than
 * throwing, the caller wraps it in a try/catch anyway, and it runs strictly
 * after `post_student_payment_with_adjustments` has returned success, inside
 * `after()`, outside any transaction. The money is in the drawer and the
 * receipt is printed whatever happens here.
 *
 * Off by default. `app_settings.whatsapp_receipt_notice_enabled` has to be
 * `'true'` AND the template has to be approved. A feature that starts messaging
 * parents the moment it deploys is not a feature, it is an incident.
 */

export type ReceiptNoticeResult =
  | { sent: true; providerMessageId: string | null; documentAttached: boolean }
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
  /**
   * Who asked for this send.
   *
   * `auto` is the posting path and obeys `whatsapp_receipt_notice_enabled`,
   * because switching that on messages every paying parent from then on and
   * nobody should be able to do that by accident.
   *
   * `manual` is a staff member pressing Send on a receipt, and skips the
   * toggle — the toggle governs whether the school messages parents BY DEFAULT,
   * not whether a person may choose to. Everything else is identical, including
   * the no-call and cadence exclusions and the one-notice-per-receipt index: a
   * manual send is a different trigger, not a different set of rules.
   */
  trigger?: "auto" | "manual";
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
 * Render the receipt and put it on the shelf Meta can fetch from.
 *
 * Returns null on any failure, and that is the designed outcome rather than an
 * error path: the caller then sends the approved body-only `_v3` campaign with
 * the identical seven parameters. A PDF problem degrades the message; it must
 * never suppress it.
 *
 * The renderer is imported dynamically, copying
 * `receipts/[receiptId]/pdf/route.ts` — it exists so a font or logo failure is
 * caught HERE, at call time, instead of crashing the function at module load.
 * That matters more in this file than in a route: this one runs inside the
 * payment posting's `after()`.
 */
async function renderAndStoreReceipt(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  receiptId: string;
  sessionLabel: string;
}): Promise<{ document: StoredDocument; filename: string } | null> {
  try {
    const { getReceiptDetailWith } = await import("@/modules/receipts/data/queries");
    // The admin client the posting action already holds. `getReceiptDetail`
    // would build a cookie client, which has no session inside `after()`.
    const receipt = await getReceiptDetailWith(args.supabase, args.receiptId);
    if (!receipt) return null;

    const { renderReceiptPdf } = await import("@/modules/receipts/domain/receipt-pdf");
    const buffer = await renderReceiptPdf({
      receipt,
      verifyUrl: createAbsoluteUrl(`/r/${encodeURIComponent(receipt.receiptNumber)}`),
    });

    const document = await storeNoticeDocument({
      supabase: args.supabase,
      sessionLabel: args.sessionLabel,
      kind: "receipt",
      id: args.receiptId,
      pdf: new Uint8Array(buffer),
    });
    if (!document) return null;

    return {
      document,
      // Deliberately NOT `receiptPdfFilename`, which is a staff-facing name
      // built from the admission number. What a parent sees in their chat list
      // should read like something handed across the counter.
      filename: parentFacingFilename({
        kind: "receipt",
        studentName: receipt.studentFullName ?? "",
        receiptNumber: receipt.receiptNumber,
      }),
    };
  } catch (caught) {
    console.warn("[whatsapp-receipt] could not prepare the PDF", args.receiptId, caught);
    return null;
  }
}

/**
 * Send one receipt notice. Best-effort throughout.
 *
 * The row is claimed on `(receipt_id, notice_kind)` before the provider call,
 * exactly as a reminder claims its day, so a retried posting cannot send a
 * second copy — the partial unique index decides the race rather than a
 * check-then-send.
 *
 * **Render before claim, never after.** A render that fails after the claim is
 * permanently unrecoverable: the index now says this receipt was notified, and
 * nothing will ever try again. So the document is produced first, and the claim
 * records which campaign that decision produced.
 */
export async function sendReceiptNotice(
  args: ReceiptNoticeArgs,
): Promise<ReceiptNoticeResult> {
  const { supabase, receiptId, receiptNumber, studentId, sessionLabel, staffId } = args;

  if (args.trigger !== "manual" && !(await isReceiptNoticeEnabled(supabase))) {
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

  // The document campaign if it is Live, otherwise the body-only one it was
  // derived from. Both build the SAME seven parameters from the same function.
  const documentCampaign = describeReceiptDocumentCampaign(language);
  const bodyCampaign = describeReceiptCampaign(language);
  if (!bodyCampaign) return { sent: false, reason: "No receipt campaign for that language." };
  if (!bodyCampaign.approved && !documentCampaign?.approved) {
    return {
      sent: false,
      reason: `${bodyCampaign.campaignName} is awaiting Meta approval.`,
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

  // Render and upload BEFORE the claim — see the note on this function.
  const prepared =
    documentCampaign?.approved
      ? await renderAndStoreReceipt({ supabase, receiptId, sessionLabel })
      : null;

  // One decision, made once, and both the claim and the send read it. Splitting
  // this would let the row record a campaign the provider was never told about.
  const campaign = prepared && documentCampaign ? documentCampaign : bodyCampaign;
  if (!campaign.approved) {
    return { sent: false, reason: `${campaign.campaignName} is awaiting Meta approval.` };
  }
  const templateParams = campaign.buildParams(values);

  // Claim on (receipt_id, notice_kind) BEFORE the provider call. The partial
  // unique index is what actually stops a retried posting sending a second copy.
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
      // The PATH, never the signed URL. The signature expires within the hour;
      // a stored dead link is worse than none, because a retry would then send
      // a document the parent cannot open. `retryFailedSendsAction` re-signs.
      document_path: prepared?.document.path ?? null,
      // Both stated explicitly rather than left to a column default.
      //
      // `sent_on` used to default to the IST date, which collided with the DAY
      // index for a family paying twice in one day — and the 23505 was then
      // reported as "already sent for this receipt", which was untrue and
      // suppressed a notice for a receipt nobody had been told about. Since
      // `20260912165421` the day index is partial on `receipt_id is null`, so a
      // receipt-shaped notice is guarded by the receipt index alone; passing
      // the value is what makes that intent legible at the call site.
      sent_on: istTodayIso(),
      notice_kind: "receipt",
      sent_by: staffId,
    })
    .select("id")
    .single();

  if (claimError) {
    // 23505 can now only mean the receipt+kind index: this receipt has already
    // had a RECEIPT notice. That is the guard working, not a failure — and the
    // sentence is worded from the key we claimed on rather than guessed from
    // the driver's message, so it cannot go stale if the indexes change again.
    if (claimError.code === "23505") {
      return { sent: false, reason: "A receipt notice for this receipt has already been sent." };
    }
    return { sent: false, reason: `Could not claim the notice: ${claimError.message}` };
  }

  const result = await sendAisensyCampaignMessage({
    campaignName: campaign.campaignName,
    destination,
    userName: values.parentName,
    templateParams,
    source: "veerpatta-fees-app/receipt",
    ...(prepared
      ? { media: { url: prepared.document.signedUrl, filename: prepared.filename } }
      : {}),
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
    ? {
        sent: true,
        providerMessageId: result.messageId ?? null,
        documentAttached: Boolean(prepared),
      }
    : { sent: false, reason: result.error };
}
