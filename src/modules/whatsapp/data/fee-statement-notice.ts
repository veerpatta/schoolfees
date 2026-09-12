import "server-only";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import {
  parentFacingFilename,
  storeNoticeDocument,
  type StoredDocument,
} from "@/modules/whatsapp/data/document-store";
import { describeFeeStatementCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v5";
import { isNoticeLanguage, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { istTodayIso } from "@/platform/helpers/date";

/**
 * "Here is everything, in one page."
 *
 * One tap on a student, and the family receives their full fee statement as a
 * PDF — every installment, what was received, what remains. It replaces the
 * click-to-share link that opened WhatsApp and handed the typing to whoever was
 * holding the phone, and unlike that link it is written down: who sent it, to
 * which number, on what day.
 *
 * Always staff-initiated, never automatic, and never batched. There is no
 * `app_settings` toggle for the same reason there is none on the Call button: a
 * person decided, and the decision is the authorisation.
 *
 * Unlike a receipt notice there is NO body-only fallback. A statement message
 * whose statement failed to render says "your full fee statement is attached"
 * with nothing attached, which is worse than a staff member seeing the failure
 * and trying again.
 */

export type FeeStatementNoticeResult =
  | { sent: true; providerMessageId: string | null; destination: string }
  | { sent: false; reason: string };

export type FeeStatementNoticeArgs = {
  /**
   * The ADMIN client, for the claim row and the private bucket.
   *
   * The document itself is rendered through the caller's own session — see
   * `renderAndStoreStatement` — because the fee statement is built from the
   * student workspace, which is RLS-scoped and has a signed-in staff member
   * behind it on every path that reaches here.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  studentId: string;
  sessionLabel: string;
  staffId: string | null;
};

/**
 * Render the statement and put it on the shelf Meta can fetch from.
 *
 * Dynamic imports for the same reason the receipt route uses them: a font or
 * logo failure surfaces here, where it is caught and reported to the staff
 * member, rather than crashing the function at module load.
 */
async function renderAndStoreStatement(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  studentId: string;
  sessionLabel: string;
  studentName: string;
}): Promise<{ document: StoredDocument; filename: string } | null> {
  try {
    const { getStudentWorkspaceData } = await import("@/modules/students/data/workspace");
    const workspace = await getStudentWorkspaceData(args.studentId, { skipCache: true });

    const { renderFeeStatementPdf, toFeePdfStudent } = await import(
      "@/modules/students/domain/fee-statement-pdf"
    );
    const pdfStudent = toFeePdfStudent(workspace);
    if (!pdfStudent) return null;

    const buffer = await renderFeeStatementPdf({
      students: [pdfStudent],
      sessionLabel: args.sessionLabel,
      title: `Fee statement: ${pdfStudent.fullName}`,
    });

    const document = await storeNoticeDocument({
      supabase: args.supabase,
      sessionLabel: args.sessionLabel,
      kind: "fee_statement",
      id: args.studentId,
      pdf: new Uint8Array(buffer),
    });
    if (!document) return null;

    return {
      document,
      filename: parentFacingFilename({
        kind: "fee_statement",
        studentName: args.studentName,
      }),
    };
  } catch (caught) {
    console.warn("[whatsapp-statement] could not prepare the PDF", args.studentId, caught);
    return null;
  }
}

/**
 * Send one fee statement. Returns a reason rather than throwing, so the screen
 * that called it can say what happened.
 *
 * The claim carries `receipt_id = null`, which since `20260912165421` puts it
 * under the DAY index — one statement per family per day, for free, with no new
 * column and no new index. That is exactly the rule a tappable button wants:
 * against a double-tap, and against two staff in two tabs.
 */
export async function sendFeeStatementNotice(
  args: FeeStatementNoticeArgs,
): Promise<FeeStatementNoticeResult> {
  const { supabase, studentId, sessionLabel, staffId } = args;

  const { data: financial, error: financialError } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, student_name, father_name, father_phone, mother_phone, class_label, inst1_pending, inst2_pending, inst3_pending, inst4_pending",
    )
    .eq("session_label", sessionLabel)
    .eq("student_id", studentId)
    .maybeSingle();

  if (financialError || !financial) {
    return { sent: false, reason: "Could not read this student's ledger." };
  }

  const { data: flags } = await supabase
    .from("student_collection_flags")
    .select("no_call, whatsapp_cadence, whatsapp_language")
    .eq("session_label", sessionLabel)
    .eq("student_id", studentId)
    .maybeSingle();

  // Honoured even though a person pressed the button. A family who asked not to
  // be contacted asked the school, not one feature — and the sentence below is
  // what tells the staff member why nothing went, so it is not a silent refusal.
  if (flags?.no_call === true) {
    return { sent: false, reason: "This family is flagged no-call, so nothing was sent." };
  }
  if (flags?.whatsapp_cadence === "never") {
    return { sent: false, reason: "This family's WhatsApp cadence is set to never." };
  }

  const destination =
    toWhatsappDestination(financial.father_phone) ??
    toWhatsappDestination(financial.mother_phone);
  if (!destination) {
    return { sent: false, reason: "No usable WhatsApp number on record for this family." };
  }

  const language: NoticeLanguage = isNoticeLanguage(flags?.whatsapp_language)
    ? (flags.whatsapp_language as NoticeLanguage)
    : "hi";

  const campaign = describeFeeStatementCampaign(language);
  if (!campaign) return { sent: false, reason: "No fee-statement campaign for that language." };
  if (!campaign.approved) {
    return {
      sent: false,
      reason: `${campaign.campaignName} is still awaiting Meta approval.`,
    };
  }

  const titleCase = (value: string | null | undefined) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase())
      .trim();

  // Fees only. A late fee is not a fee, and a statement that folded one in
  // would quote a number that appears nowhere else in this app.
  const pendingAmount =
    Number(financial.inst1_pending ?? 0) +
    Number(financial.inst2_pending ?? 0) +
    Number(financial.inst3_pending ?? 0) +
    Number(financial.inst4_pending ?? 0);

  const values = {
    parentName: titleCase(financial.father_name) || "अभिभावक",
    studentName: titleCase(financial.student_name),
    studentClass: String(financial.class_label ?? ""),
    sessionLabel,
    pendingAmount,
  };
  const templateParams = campaign.buildParams(values);

  // Render BEFORE the claim. A render that fails after the claim is
  // unrecoverable until tomorrow: the day index now says this family had their
  // statement.
  const prepared = await renderAndStoreStatement({
    supabase,
    studentId,
    sessionLabel,
    studentName: values.studentName,
  });
  if (!prepared) {
    return { sent: false, reason: "Could not build the statement PDF. Nothing was sent." };
  }

  const { data: claim, error: claimError } = await supabase
    .from("whatsapp_reminder_sends")
    .insert({
      student_id: studentId,
      session_label: sessionLabel,
      campaign_name: campaign.campaignName,
      destination,
      due_amount: pendingAmount,
      template_params: templateParams,
      status: "pending",
      language,
      destination_role: "primary",
      // Null on purpose: this is what puts the row under the day index.
      receipt_id: null,
      document_path: prepared.document.path,
      sent_on: istTodayIso(),
      notice_kind: "fee_statement",
      sent_by: staffId,
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      return {
        sent: false,
        reason: "This family has already been sent a statement today.",
      };
    }
    return { sent: false, reason: `Could not claim the notice: ${claimError.message}` };
  }

  const result = await sendAisensyCampaignMessage({
    campaignName: campaign.campaignName,
    destination,
    userName: values.parentName,
    templateParams,
    source: "veerpatta-fees-app/statement",
    media: { url: prepared.document.signedUrl, filename: prepared.filename },
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
    ? { sent: true, providerMessageId: result.messageId ?? null, destination }
    : { sent: false, reason: result.error };
}
