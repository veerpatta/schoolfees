"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ShareScope } from "@/components/shared/document-share-sheet";
import { buildStudentPhoneEntries } from "@/components/students/phone-entries";
import { formatInr } from "@/lib/helpers/currency";

/**
 * Share a student's (or a family's) fee statement with the parent.
 *
 * The mechanism this file used to own — prefetch on open, synchronous
 * `navigator.share`, the download + wa.me fallback — now lives in
 * `components/shared/document-share-sheet.tsx`, because the receipt surfaces
 * need exactly the same thing with different documents. What is left here is
 * the part that is actually about fee statements: which URLs, and what the
 * message says.
 *
 * The props are deliberately unchanged, so both existing call sites (the
 * student page and the phone profile's action bar) are untouched.
 *
 * There is no share *card* for a statement — the 1080x1080 PNG route exists
 * only for receipts — so these scopes are PDF-only by construction, not by
 * omission.
 */

/**
 * Loaded on demand. Nothing here is needed until someone taps Send, and a
 * static import puts the whole share stack into this route's initial JS (and,
 * once three routes use it, into the shared chunk every route pays for).
 */
const DocumentShareSheet = dynamic(
  () =>
    import("@/components/shared/document-share-sheet").then(
      (mod) => mod.DocumentShareSheet,
    ),
  { ssr: false },
);

type ShareFeeWhatsAppProps = {
  studentId: string;
  studentName: string;
  /** Present when the student belongs to a confirmed family group. */
  familyGroupId: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  pendingAmount: number;
  /**
   * Drop the card + its own trigger and render only the sheet, driven from
   * outside. The phone profile's bottom action bar owns the WhatsApp button
   * (mobile app v2 §STUDENT DETAIL), so it opens this sheet rather than
   * carrying a second copy of the share flow.
   */
  headless?: boolean;
  /** Controlled open state. Omit to let the card's own trigger own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ShareFeeWhatsApp({
  studentId,
  studentName,
  familyGroupId,
  fatherPhone,
  motherPhone,
  pendingAmount,
  headless = false,
  open: controlledOpen,
  onOpenChange,
}: ShareFeeWhatsAppProps) {
  const t = useTranslations("MobileApp");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const amount = formatInr(pendingAmount);
  const settled = pendingAmount <= 0;

  const scopes: ShareScope[] = [
    {
      id: "student",
      label: t("shareScopeChild"),
      docs: [
        {
          id: "pdf",
          url: `/protected/students/${studentId}/fee-pdf`,
          fileName: `fee-statement-${studentId}.pdf`,
          mimeType: "application/pdf",
          label: t("shareDocPdf"),
        },
      ],
      message: t(settled ? "shareMessageSettled" : "shareMessagePending", {
        name: studentName,
        amount,
      }),
      shareTitle: t("shareFeeSheetTitle"),
    },
    ...(familyGroupId
      ? [
          {
            id: "family",
            label: t("shareScopeFamily"),
            docs: [
              {
                id: "pdf",
                url: `/protected/students/family/${familyGroupId}/fee-pdf`,
                fileName: `family-fee-statement-${familyGroupId}.pdf`,
                mimeType: "application/pdf" as const,
                label: t("shareDocPdf"),
              },
            ],
            message: t(
              settled ? "shareMessageSettledFamily" : "shareMessagePendingFamily",
              { name: studentName, amount },
            ),
            shareTitle: t("shareFeeSheetTitle"),
          } satisfies ShareScope,
        ]
      : []),
  ];

  return (
    <section
      className={
        headless
          ? "contents"
          : "rounded-2xl border border-border bg-card p-5 shadow-xs no-print"
      }
    >
      {headless ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("shareFeeTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("shareFeeSubtitle")}</p>
          </div>
          <Button type="button" size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Share2 className="size-4" aria-hidden="true" />
            {t("shareFeeCta")}
          </Button>
        </div>
      )}

      {open ? (
        <DocumentShareSheet
          open={open}
          onOpenChange={setOpen}
          title={t("shareFeeSheetTitle")}
          scopes={scopes}
          phones={buildStudentPhoneEntries(
            { fatherPhone, motherPhone },
            { father: t("phoneLabelFather"), mother: t("phoneLabelMother") },
          )}
        />
      ) : null}
    </section>
  );
}
