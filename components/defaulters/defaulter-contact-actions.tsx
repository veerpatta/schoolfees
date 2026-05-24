"use client";

import { useState } from "react";
import { MessageSquare, Phone } from "lucide-react";

import { ContactPopover } from "@/components/defaulters/contact-popover";
import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type Props = {
  row: Pick<
    DefaulterSummaryRow,
    | "studentId"
    | "fullName"
    | "classLabel"
    | "fatherPhone"
    | "totalPending"
    | "overdueAmount"
    | "oldestDueDate"
  >;
  sessionLabel: string;
};

export function DefaulterContactActions({ row, sessionLabel }: Props) {
  const [modal, setModal] = useState<"contact" | "whatsapp" | null>(null);

  return (
    <>
      {row.fatherPhone ? (
        <a
          href={`tel:${row.fatherPhone}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground min-h-10 hover:bg-surface-3 transition-colors"
        >
          <Phone className="size-4 text-success" aria-hidden="true" />
          {row.fatherPhone}
        </a>
      ) : null}

      <button
        type="button"
        onClick={() => setModal("whatsapp")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm font-medium text-success-soft-foreground transition-colors hover:bg-success-soft/80"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        WhatsApp
      </button>

      <button
        type="button"
        onClick={() => setModal("contact")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
      >
        Log contact
      </button>

      <ContactPopover
        studentId={row.studentId}
        studentName={row.fullName}
        sessionLabel={sessionLabel}
        open={modal === "contact"}
        onClose={() => setModal(null)}
      />

      <WhatsAppDraftModal
        row={row}
        open={modal === "whatsapp"}
        onClose={() => setModal(null)}
      />
    </>
  );
}

/** Desktop-only compact action buttons (no phone number inline). */
export function DefaulterContactActionsCompact({
  row,
  sessionLabel,
}: Props) {
  const [modal, setModal] = useState<"contact" | "whatsapp" | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setModal("whatsapp")}
        className="text-sm font-semibold text-success-soft-foreground hover:text-success-soft-foreground"
      >
        WhatsApp
      </button>

      <button
        type="button"
        onClick={() => setModal("contact")}
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        Log contact
      </button>

      <ContactPopover
        studentId={row.studentId}
        studentName={row.fullName}
        sessionLabel={sessionLabel}
        open={modal === "contact"}
        onClose={() => setModal(null)}
      />

      <WhatsAppDraftModal
        row={row}
        open={modal === "whatsapp"}
        onClose={() => setModal(null)}
      />
    </>
  );
}
