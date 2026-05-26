"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { composeDefaulterDraft } from "@/lib/defaulters/whatsapp-template";
import { buildWaMeLink } from "@/lib/whatsapp-templates/render";
import { logWhatsAppSendAttempts } from "@/app/protected/defaulters/actions";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type RowSubset = Pick<
  DefaulterSummaryRow,
  "fullName" | "classLabel" | "totalPending" | "oldestDueDate" | "overdueAmount"
> & {
  fatherPhone?: string | null;
};

type Props = {
  row: RowSubset;
  open: boolean;
  onClose: () => void;
  /** Session used for auto-logging. Pass undefined to disable auto-log. */
  sessionLabel?: string;
  /** Student id to auto-log against on send. */
  autoLogStudentId?: string;
};

export function WhatsAppDraftModal({
  row,
  open,
  onClose,
  sessionLabel,
  autoLogStudentId,
}: Props) {
  const t = useTranslations("Defaulters");
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [logged, setLogged] = useState(false);

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

  function maybeAutoLog() {
    if (!autoLogStudentId || !sessionLabel) return;
    startTransition(async () => {
      const result = await logWhatsAppSendAttempts({
        sessionLabel,
        studentIds: [autoLogStudentId],
      });
      if (result.ok) {
        setLogged(true);
        router.refresh();
      }
    });
  }

  function handleOpenInWhatsApp() {
    if (row.fatherPhone) {
      window.open(buildWaMeLink(row.fatherPhone, draft), "_blank", "noopener");
      maybeAutoLog();
    } else {
      handleCopy();
      maybeAutoLog();
    }
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

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
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

          <Button
            type="button"
            variant="accent"
            className="gap-2"
            onClick={handleOpenInWhatsApp}
            disabled={pending}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            {row.fatherPhone ? t("whatsappOpen") : t("whatsappCopyAndLog")}
          </Button>
        </div>

        {logged ? (
          <p className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-center text-xs text-success-soft-foreground">
            {t("whatsappAutoLogged")}
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {autoLogStudentId && sessionLabel
              ? t("whatsappWillAutoLog")
              : t("whatsappDisclaimer")}
          </p>
        )}
      </div>
    </Sheet>
  );
}
