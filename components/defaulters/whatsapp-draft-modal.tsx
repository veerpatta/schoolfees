"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { composeDefaulterDraft } from "@/lib/defaulters/whatsapp-template";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type RowSubset = Pick<
  DefaulterSummaryRow,
  "fullName" | "classLabel" | "totalPending" | "oldestDueDate" | "overdueAmount"
>;

type Props = {
  row: RowSubset;
  open: boolean;
  onClose: () => void;
};

export function WhatsAppDraftModal({ row, open, onClose }: Props) {
  const t = useTranslations("Defaulters");
  const [copied, setCopied] = useState(false);

  const dueLabel =
    row.overdueAmount > 0
      ? t("whatsappOverdueLabel", { amount: formatInr(row.overdueAmount) })
      : row.oldestDueDate
        ? t("whatsappDueLabel", { date: row.oldestDueDate })
        : t("whatsappTotalDues");

  const draft = composeDefaulterDraft({
    studentName: row.fullName,
    className: row.classLabel,
    outstandingAmount: row.totalPending,
    dueLabel,
    schoolName: schoolProfile.shortName,
  });

  function handleCopy() {
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("whatsappTitle")}
      description={t("whatsappDescription", { name: row.fullName })}
      size="md"
    >
      <div className="space-y-4">
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-4 font-sans text-sm leading-relaxed text-foreground">
          {draft}
        </pre>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="size-4 text-success" aria-hidden="true" />
              {t("whatsappCopied")}
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              {t("whatsappCopy")}
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("whatsappDisclaimer")}
        </p>
      </div>
    </Sheet>
  );
}
