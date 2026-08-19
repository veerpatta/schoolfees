"use client";

import { useTranslations } from "next-intl";

import type { ShareScope } from "@/components/shared/document-share-sheet";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";

/**
 * The two fee-statement scopes, built from a receipt.
 *
 * A receipt already knows the student and (since the family link was added to
 * `getReceiptDetail`) the family group for its own session, so the same sheet
 * that sends the receipt can also send either statement without a second fetch.
 *
 * A hook rather than a plain function so each call site is one line and the
 * translations cannot be wired up differently at each of the three surfaces.
 *
 * The amount used is `currentOutstanding` — what the student owes NOW, not what
 * was outstanding when this receipt was issued. A statement sent today should
 * agree with today's ledger, not with the moment of an old payment.
 */
export function useReceiptStatementScopes(receipt: ReceiptDetail): ShareScope[] {
  const t = useTranslations("MobileApp");

  const amount = formatInr(receipt.currentOutstanding);
  const settled = receipt.currentOutstanding <= 0;
  const pdfLabel = t("shareDocPdf");
  const shareTitle = t("shareFeeSheetTitle");

  const scopes: ShareScope[] = [
    {
      id: "student",
      label: t("shareScopeChild"),
      docs: [
        {
          id: "pdf",
          url: `/protected/students/${receipt.studentId}/fee-pdf`,
          fileName: `fee-statement-${receipt.studentId}.pdf`,
          mimeType: "application/pdf",
          label: pdfLabel,
        },
      ],
      message: t(settled ? "shareMessageSettled" : "shareMessagePending", {
        name: receipt.studentFullName,
        amount,
      }),
      shareTitle,
    },
  ];

  // Only for a student in a confirmed family group for THIS receipt's session.
  if (receipt.familyGroupId) {
    scopes.push({
      id: "family",
      label: t("shareScopeFamily"),
      docs: [
        {
          id: "pdf",
          url: `/protected/students/family/${receipt.familyGroupId}/fee-pdf`,
          fileName: `family-fee-statement-${receipt.familyGroupId}.pdf`,
          mimeType: "application/pdf",
          label: pdfLabel,
        },
      ],
      message: t(settled ? "shareMessageSettledFamily" : "shareMessagePendingFamily", {
        name: receipt.studentFullName,
        amount,
      }),
      shareTitle,
    });
  }

  return scopes;
}
