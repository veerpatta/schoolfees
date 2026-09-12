"use server";

import { sendReceiptNotice } from "@/modules/whatsapp/data/receipt-notice";
import { getReceiptDetail } from "@/modules/receipts/data/queries";
import { istTodayIso } from "@/platform/helpers/date";
import { isUuid } from "@/platform/helpers/uuid";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";

/**
 * What a one-tap receipt send reports back.
 *
 * Declared here and mirrored (not imported) by the button, because
 * `src/modules` may not import `src/app`.
 */
export type SendReceiptActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Send a receipt to the parent on WhatsApp, with the PDF attached.
 *
 * The normal path is automatic — posting a payment sends this without anyone
 * asking. This is the button for everything else: a payment posted before the
 * automatic send was switched on, a family whose number was added afterwards, a
 * send that failed at the provider.
 *
 * What it replaces is the share sheet that used to sit on every receipt
 * surface: a `wa.me` link with pre-written text, plus a separate download of
 * the PDF that the staff member then had to attach by hand. Nothing about it
 * was recorded, so "was this family sent their receipt?" had no answer.
 *
 * `receipts:print` rather than `receipts:view`, matching the PDF route: this
 * produces the parent-facing artefact, and a role that may look a receipt up is
 * not automatically a role that may issue one.
 *
 * Sending twice is refused by the `(receipt_id, notice_kind)` index rather than
 * by a dialog — a double-tap reports "already sent" instead of messaging a
 * parent twice.
 */
export async function sendReceiptOnWhatsappAction(
  _prevState: SendReceiptActionState,
  formData: FormData,
): Promise<SendReceiptActionState> {
  const receiptId = (formData.get("receiptId") ?? "").toString().trim();
  if (!isUuid(receiptId)) {
    return { status: "error", message: "No receipt given." };
  }

  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("receipts:print");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "You do not have permission to send receipts." };
  }

  try {
    // Read through the caller's own session, so RLS still decides what this
    // staff member may see. Only the send itself runs as admin, because the
    // private document bucket carries no staff policy at all.
    const receipt = await getReceiptDetail(receiptId);
    if (!receipt) {
      return { status: "error", message: "That receipt was not found." };
    }

    const result = await sendReceiptNotice({
      supabase: createAdminClient(),
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      studentId: receipt.studentId,
      sessionLabel: receipt.sessionLabel,
      amountPaid: receipt.totalAmount,
      paymentDate: receipt.paymentDate,
      staffId,
      trigger: "manual",
    });

    if (!result.sent) {
      return { status: "error", message: result.reason };
    }

    return {
      status: "success",
      message: result.documentAttached
        ? "Receipt sent on WhatsApp with the PDF attached."
        : "Receipt sent on WhatsApp. The PDF could not be attached.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not send the receipt.",
    };
  }
}

/**
 * Tell a family that a payment of theirs was reversed.
 *
 * Deliberately NOT automatic. A receipt notice fires on its own because a
 * posting is unambiguous — money arrived, and the parent is glad to hear so. A
 * reversal is not: most of them are the office correcting its own entry, wrong
 * child or wrong amount or entered twice, and the family may never have known.
 * Sending "your payment came back off" the moment a clerk fixes a typo would
 * manufacture alarm the reversal itself did not cause.
 *
 * So a person decides, once they know the family actually needs to know — and
 * `whatsapp_reversal_notice_enabled` still has to be on, because a school that
 * has decided never to send these should not have the button work at all.
 *
 * `payments:reverse_any`: whoever may reverse a receipt is who may tell the
 * family about it. Once per receipt, held by the `(receipt_id, notice_kind)`
 * index rather than by a dialog.
 */
export async function sendReversalNoticeAction(
  _prevState: SendReceiptActionState,
  formData: FormData,
): Promise<SendReceiptActionState> {
  const receiptId = (formData.get("receiptId") ?? "").toString().trim();
  if (!isUuid(receiptId)) {
    return { status: "error", message: "No receipt given." };
  }

  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("payments:reverse_any");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "You do not have permission to send this." };
  }

  try {
    const receipt = await getReceiptDetail(receiptId);
    if (!receipt) {
      return { status: "error", message: "That receipt was not found." };
    }
    if (!receipt.isVoided) {
      // The guard that matters: this message says a payment came back off. On a
      // receipt that still stands, it would be false.
      return {
        status: "error",
        message: "This receipt has not been reversed, so there is nothing to announce.",
      };
    }

    const { sendReversalNotice } = await import("@/modules/whatsapp/data/reversal-notice");
    const result = await sendReversalNotice({
      supabase: createAdminClient(),
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      studentId: receipt.studentId,
      sessionLabel: receipt.sessionLabel,
      amountReversed: receipt.totalAmount,
      reversedOn: istTodayIso(),
      staffId,
    });

    if (!result.sent) {
      return { status: "error", message: result.reason };
    }

    return { status: "success", message: "The family has been told on WhatsApp." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not send that notice.",
    };
  }
}
