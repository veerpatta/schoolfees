"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Sheet } from "@/ui/primitives/sheet";
import { schoolProfile } from "@/platform/config/school";
import { buildWaMeLink } from "@/lib/whatsapp-templates/render";
import {
  DEFAULT_RECEIPT_BODY,
  buildReceiptShareMessage,
} from "@/lib/receipts/share-message";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";
import type { ReceiptDetail } from "@/lib/receipts/types";

type Props = {
  receipt: Pick<
    ReceiptDetail,
    | "receiptNumber"
    | "totalAmount"
    | "studentFullName"
    | "fatherName"
    | "fatherPhone"
    | "parentEmail"
    | "classLabel"
    | "isVoided"
  >;
  templates: WhatsappTemplate[];
};

export function ReceiptShareActions({ receipt, templates }: Props) {
  const t = useTranslations("Receipts");
  const tShare = useTranslations("MobileApp");
  const receiptTemplates = templates.filter(
    (template) => template.category === "receipt" && template.isActive,
  );
  const initialTemplateId = receiptTemplates[0]?.id ?? "__default__";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(initialTemplateId);

  const activeBody =
    receiptTemplates.find((template) => template.id === activeId)?.body ??
    DEFAULT_RECEIPT_BODY;

  // Shared with the phone's one-tap send, so the same receipt cannot compose
  // two different messages depending on which surface it was opened from. It
  // also substitutes the reversal notice for a voided receipt, whichever
  // template is selected above.
  const rendered = buildReceiptShareMessage({ receipt, templateBody: activeBody });
  const hasPhone = Boolean(receipt.fatherPhone);
  const hasEmail = Boolean(receipt.parentEmail);
  const mailtoHref = hasEmail
    ? `mailto:${encodeURIComponent(receipt.parentEmail!)}?subject=${encodeURIComponent(
        `Receipt ${receipt.receiptNumber} — ${schoolProfile.shortName}`,
      // No "PDF attached" line: a mailto: link cannot carry an attachment, and
      // the note under the buttons already tells staff to attach it themselves.
      // The body claimed otherwise for as long as this sheet has existed.
      )}&body=${encodeURIComponent(rendered)}`
    : null;

  const whatsappHref = hasPhone
    ? buildWaMeLink(receipt.fatherPhone!, rendered)
    : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setSheetOpen(true)}
        className="gap-2"
        title={hasPhone ? t("shareTitleHint") : t("shareDisabledHint")}
        disabled={!hasPhone && !hasEmail}
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        {t("shareAction")}
      </Button>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("shareSheetTitle", { number: receipt.receiptNumber })}
        description={t("shareSheetDescription")}
        size="full"
      >
        <div className="space-y-4">
          {/* Sharing a reversed receipt sends a parent a payment confirmation
              for money the school no longer holds. The document, the PDF and the
              share card all mark it; this sheet composed a cheerful "payment
              received" message regardless, so it says so before the send. */}
          {receipt.isVoided ? (
            <div
              role="alert"
              className="rounded-md bg-destructive-soft px-4 py-3 text-sm leading-6 text-destructive-soft-foreground"
            >
              {/* Was hardcoded English in a sheet every other string of which
                  is translated. Same two keys the phone's share sheet uses. */}
              <p className="font-semibold">{tShare("shareReversedCautionTitle")}</p>
              <p>{tShare("shareReversedCautionBody")}</p>
            </div>
          ) : null}
          {receiptTemplates.length > 0 ? (
            <div className="space-y-2">
              <label htmlFor="receipt-share-template" className="text-sm font-medium text-foreground">
                {t("shareTemplateLabel")}
              </label>
              <select
                id="receipt-share-template"
                value={activeId}
                onChange={(event) => setActiveId(event.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="__default__">{t("shareDefaultTemplateLabel")}</option>
                {receiptTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("sharePreviewLabel")}</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 font-sans text-sm text-foreground">
              {rendered}
            </pre>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              asChild
              variant="accent"
              disabled={!hasPhone}
              className="gap-2"
              title={hasPhone ? undefined : t("shareDisabledHint")}
            >
              {hasPhone ? (
                <a href={whatsappHref!} target="_blank" rel="noopener" onClick={() => setSheetOpen(false)}>
                  <MessageSquare className="size-4" aria-hidden="true" />
                  {t("shareWhatsappButton")}
                </a>
              ) : (
                <span>
                  <MessageSquare className="size-4" aria-hidden="true" />
                  {t("shareWhatsappNoPhone")}
                </span>
              )}
            </Button>

            <Button
              asChild
              variant="outline"
              disabled={!hasEmail}
              className="gap-2"
              title={hasEmail ? undefined : t("shareNoEmailHint")}
            >
              {hasEmail ? (
                <a href={mailtoHref!} onClick={() => setSheetOpen(false)}>
                  <Mail className="size-4" aria-hidden="true" />
                  {t("shareEmailButton")}
                </a>
              ) : (
                <span>
                  <Mail className="size-4" aria-hidden="true" />
                  {t("shareEmailNoEmail")}
                </span>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t("shareMailNote")}</p>
        </div>
      </Sheet>
    </>
  );
}
