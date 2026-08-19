"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { useReceiptStatementScopes } from "@/components/receipts/share-receipt-scopes";
import { activeReceiptTemplateBody } from "@/lib/receipts/share-message";
import type { ReceiptDetail } from "@/lib/receipts/types";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";

/**
 * The receipt page's phone action bar.
 *
 * The receipt page's actions have always lived in the `PageHeader` — a wrapping
 * row of small outline buttons that reads well at a desk and is four cramped
 * chips on a 360px screen. On a phone the thing staff came to do is send the
 * receipt to the parent, so it gets the bar and print becomes secondary.
 *
 * Fixed rather than sticky, and safe-area padded only: `/protected/receipts` is
 * a mobile takeover route (`lib/config/navigation.ts`), so there is no tab bar
 * to clear and `--mobile-bottom-nav-offset` would float this above the home
 * indicator. Same reasoning and the same literals as the student profile's bar.
 */

/**
 * Loaded on demand: nothing here is needed until Send is tapped, and a static
 * import drags the whole share stack into this route's initial JS.
 */
const ShareReceiptWhatsApp = dynamic(
  () =>
    import("@/components/receipts/share-receipt-whatsapp").then(
      (mod) => mod.ShareReceiptWhatsApp,
    ),
  { ssr: false },
);

type Props = {
  receipt: ReceiptDetail;
  /** `receipts:print`. Gates both the PDF attachment and the print link. */
  canPrintReceipts: boolean;
  printHref: string;
  whatsappTemplates: WhatsappTemplate[];
};

export function MobileReceiptActionBar({
  receipt,
  canPrintReceipts,
  printHref,
  whatsappTemplates,
}: Props) {
  const t = useTranslations("Receipts");
  const tm = useTranslations("MobileApp");
  const [shareOpen, setShareOpen] = useState(false);
  const statementScopes = useReceiptStatementScopes(receipt);

  return (
    <>
      <div
        data-mobile-receipt-actions="true"
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:hidden print:hidden"
        style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="focus-ring h-14 flex-1 rounded-2xl border border-success/30 bg-success-soft text-[13px] font-extrabold text-success-soft-foreground active:scale-[0.98]"
        >
          {tm("shareOneTapAction")}
        </button>
        {canPrintReceipts ? (
          <Link
            href={printHref}
            target="_blank"
            rel="noopener"
            className="focus-ring grid h-14 w-28 shrink-0 place-items-center rounded-2xl border border-border bg-surface-2 text-[13px] font-extrabold text-foreground active:scale-[0.98]"
          >
            {t("printA4Action")}
          </Link>
        ) : null}
      </div>

      {shareOpen ? (
        <ShareReceiptWhatsApp
          open={shareOpen}
          onOpenChange={setShareOpen}
          receipt={receipt}
          canSendReceiptPdf={canPrintReceipts}
          templateBody={activeReceiptTemplateBody(whatsappTemplates)}
          extraScopes={statementScopes}
        />
      ) : null}
    </>
  );
}
