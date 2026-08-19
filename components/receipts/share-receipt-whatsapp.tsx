"use client";

import { useTranslations } from "next-intl";

import {
  DocumentShareSheet,
  type ShareScope,
} from "@/components/shared/document-share-sheet";
import { buildStudentPhoneEntries } from "@/components/students/phone-entries";
import { buildReceiptShareDocs } from "@/lib/receipts/share-docs";
import { buildReceiptShareMessage } from "@/lib/receipts/share-message";

/**
 * The receipt half of the one-tap send: builds the scopes, then hands off to
 * the shared sheet.
 *
 * It renders only the sheet. Every surface that uses it (the success screen,
 * the receipt page's phone bar, the preview sheet) already owns a button in its
 * own layout, so a trigger here would be a second one.
 */

export type ShareReceiptTarget = {
  /** Named `id` to match ReceiptDetail, so a receipt is assignable as-is. */
  id: string;
  receiptNumber: string;
  studentFullName: string;
  fatherName: string | null;
  classLabel: string;
  totalAmount: number;
  isVoided?: boolean;
  fatherPhone: string | null;
  motherPhone?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ShareReceiptTarget;
  /**
   * `receipts:print`. Required rather than defaulting to true: the PDF route
   * gates on print, not view, so three of the five roles cannot fetch it. A
   * fail-open default here would 403 for them mid-prefetch.
   */
  canSendReceiptPdf: boolean;
  /** The admin-authored template body for this send, when one is active. */
  templateBody?: string | null;
  /**
   * A fully-composed message to send instead of rendering one here.
   *
   * For the Payment Desk only, which already builds this string as part of
   * posting. Loading the template catalogue on the hottest route in the app to
   * regenerate text that already exists would be a poor trade. Ignored for a
   * reversed receipt, which never borrows a confirmation message.
   */
  messageOverride?: string | null;
  /**
   * Pre-built extra scopes (student / family fee statement) appended after the
   * receipt. Built by the caller because they need student-side data this
   * component does not carry.
   */
  extraScopes?: ShareScope[];
};

export function ShareReceiptWhatsApp({
  open,
  onOpenChange,
  receipt,
  canSendReceiptPdf,
  templateBody,
  messageOverride,
  extraScopes = [],
}: Props) {
  const t = useTranslations("MobileApp");

  const docs = buildReceiptShareDocs({
    receipt,
    canSendReceiptPdf,
    labels: { card: t("shareDocCard"), pdf: t("shareDocPdf") },
  });

  const receiptScope: ShareScope = {
    id: "receipt",
    label: t("shareScopeReceipt"),
    docs,
    message:
      // The override never applies to a reversed receipt: there is no wording
      // of "payment received" that is true for one, so buildReceiptShareMessage
      // swaps in the reversal notice regardless of what the caller passed.
      messageOverride && !receipt.isVoided
        ? messageOverride
        : buildReceiptShareMessage({ receipt, templateBody }),
    shareTitle: t("shareOneTapSheetTitle", { number: receipt.receiptNumber }),
    caution: receipt.isVoided
      ? {
          title: t("shareReversedCautionTitle"),
          body: t("shareReversedCautionBody"),
          ackLabel: t("shareReversedAck"),
        }
      : null,
  };

  return (
    <DocumentShareSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("shareOneTapSheetTitle", { number: receipt.receiptNumber })}
      scopes={[receiptScope, ...extraScopes]}
      phones={buildStudentPhoneEntries(
        { fatherPhone: receipt.fatherPhone, motherPhone: receipt.motherPhone ?? null },
        { father: t("phoneLabelFather"), mother: t("phoneLabelMother") },
      )}
    />
  );
}
