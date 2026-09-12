"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  SendReceiptButton,
  type SendReceiptState,
} from "@/modules/receipts/ui/send-receipt-button";
import type { ReceiptDetail } from "@/modules/receipts/domain/types";

/**
 * The receipt page's phone action bar.
 *
 * The receipt page's actions have always lived in the `PageHeader` — a wrapping
 * row of small outline buttons that reads well at a desk and is four cramped
 * chips on a 360px screen. On a phone the thing staff came to do is send the
 * receipt to the parent, so it gets the bar and print becomes secondary.
 *
 * Fixed rather than sticky, and safe-area padded only: `/protected/receipts` is
 * a mobile takeover route (`platform/config/navigation.ts`), so there is no tab
 * bar to clear and `--mobile-bottom-nav-offset` would float this above the home
 * indicator. Same reasoning and the same literals as the student profile's bar.
 *
 * Send used to open a share sheet: pick a scope, pick a phone, hand the typing
 * and the attaching to whoever was holding the device, record nothing. It is
 * now one press that sends the receipt PDF from the school's own number and
 * writes the send down — so there is nothing left for a sheet to ask.
 */

type Props = {
  receipt: ReceiptDetail;
  /** `receipts:print`. Gates both the WhatsApp send and the print link. */
  canPrintReceipts: boolean;
  printHref: string;
  sendReceiptAction: (
    state: SendReceiptState,
    formData: FormData,
  ) => Promise<SendReceiptState>;
};

export function MobileReceiptActionBar({
  receipt,
  canPrintReceipts,
  printHref,
  sendReceiptAction,
}: Props) {
  const t = useTranslations("Receipts");

  return (
    <div
      data-mobile-receipt-actions="true"
      className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:hidden print:hidden"
      style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
    >
      {canPrintReceipts ? (
        <>
          <SendReceiptButton
            receiptId={receipt.id}
            action={sendReceiptAction}
            surface="phone"
          />
          <Link
            href={printHref}
            target="_blank"
            rel="noopener"
            className="focus-ring grid h-14 flex-1 place-items-center rounded-2xl border border-border bg-surface-2 text-[13px] font-extrabold text-foreground active:scale-[0.98]"
          >
            {t("printA4Action")}
          </Link>
        </>
      ) : null}
    </div>
  );
}
