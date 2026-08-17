"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { ReceiptAdminReversalDialogProps } from "./receipt-admin-reversal-dialog";

/**
 * Reversing a receipt is rare and admin-only, but the confirm dialog it opens
 * pulls in a sheet, a select, an input, a textarea and two notices. Shipping
 * that to every visitor of every receipt page pushed `/protected/receipts` past
 * its gzip ceiling, and that ceiling only ever ratchets down.
 *
 * So the trigger is all that lives in the page bundle. The dialog arrives when
 * an admin actually asks for it.
 */
const ReceiptAdminReversalDialog = dynamic(
  () => import("./receipt-admin-reversal-dialog").then((mod) => mod.ReceiptAdminReversalDialog),
  { ssr: false },
);

type ReceiptAdminReversalActionProps = Omit<ReceiptAdminReversalDialogProps, "onClose"> & {
  triggerLabel?: string;
};

export function ReceiptAdminReversalAction({
  triggerLabel = "Reverse this receipt",
  ...dialogProps
}: ReceiptAdminReversalActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      {open ? (
        <ReceiptAdminReversalDialog {...dialogProps} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
