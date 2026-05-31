"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { buildWaMeLink, renderWhatsappTemplate } from "@/lib/whatsapp-templates/render";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";
import type { ReceiptDetail } from "@/lib/receipts/types";

type Props = {
  receipt: Pick<
    ReceiptDetail,
    "receiptNumber" | "totalAmount" | "studentFullName" | "fatherName" | "fatherPhone" | "parentEmail" | "classLabel"
  >;
  templates: WhatsappTemplate[];
};

const DEFAULT_BODY = [
  "Namaste {{fatherName}} ji,",
  "",
  "We have received your payment for {{studentName}} ({{className}}).",
  "Receipt number: {{receiptNumber}}, Amount: {{amount}}.",
  "",
  "Thank you for your prompt payment.",
  "",
  "— — —",
  "",
  "नमस्ते,",
  "",
  "{{studentName}} ({{className}}) की आपकी फीस प्राप्त हो गई है।",
  "रसीद संख्या: {{receiptNumber}}, राशि: {{amount}}।",
  "",
  "समय पर भुगतान के लिए धन्यवाद।",
  "",
  "Regards / सादर,",
  "{{schoolName}}",
].join("\n");

export function ReceiptShareActions({ receipt, templates }: Props) {
  const t = useTranslations("Receipts");
  const receiptTemplates = templates.filter(
    (template) => template.category === "receipt" && template.isActive,
  );
  const initialTemplateId = receiptTemplates[0]?.id ?? "__default__";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(initialTemplateId);

  const activeBody =
    receiptTemplates.find((template) => template.id === activeId)?.body ?? DEFAULT_BODY;

  const vars = {
    studentName: receipt.studentFullName,
    fatherName: receipt.fatherName ?? "Parent",
    className: receipt.classLabel,
    receiptNumber: receipt.receiptNumber,
    amount: formatInr(receipt.totalAmount),
    schoolName: schoolProfile.shortName,
  };

  const rendered = renderWhatsappTemplate(activeBody, vars);
  const hasPhone = Boolean(receipt.fatherPhone);
  const hasEmail = Boolean(receipt.parentEmail);
  const mailtoHref = hasEmail
    ? `mailto:${encodeURIComponent(receipt.parentEmail!)}?subject=${encodeURIComponent(
        `Receipt ${receipt.receiptNumber} — ${schoolProfile.shortName}`,
      )}&body=${encodeURIComponent(
        `${rendered}\n\n(Please find the official receipt PDF attached.)`,
      )}`
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
