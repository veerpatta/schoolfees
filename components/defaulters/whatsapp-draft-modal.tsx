"use client";

import { useState } from "react";
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
  const [copied, setCopied] = useState(false);

  const dueLabel =
    row.overdueAmount > 0
      ? `Overdue ${formatInr(row.overdueAmount)}`
      : row.oldestDueDate
        ? `Due ${row.oldestDueDate}`
        : "Total dues";

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
      title="WhatsApp draft"
      description={`Message template for ${row.fullName}`}
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
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              Copy to clipboard
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Copy this text and paste into WhatsApp. The app does not send
          messages.
        </p>
      </div>
    </Sheet>
  );
}
