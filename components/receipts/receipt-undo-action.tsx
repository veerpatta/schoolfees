"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { undoRecentPaymentAction } from "@/app/protected/payments/actions";

const UNDO_WINDOW_MS = 10 * 60_000;

function remainingMs(createdAt: string) {
  return Math.max(0, new Date(createdAt).getTime() + UNDO_WINDOW_MS - Date.now());
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type ReceiptUndoActionProps = {
  receiptId: string;
  studentId: string;
  sessionLabel: string;
  receiptNumber: string;
  /** receipts.created_at — the 10-minute window anchors here, matching the RPC. */
  createdAt: string;
};

/**
 * Admin-only "Undo this payment" on the receipt detail page. Renders nothing
 * once the 10-minute window has passed. The RPC re-checks permission and the
 * window server-side; this is only the surface.
 */
export function ReceiptUndoAction({
  receiptId,
  studentId,
  sessionLabel,
  receiptNumber,
  createdAt,
}: ReceiptUndoActionProps) {
  const router = useRouter();
  const [msLeft, setMsLeft] = useState(() => remainingMs(createdAt));
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setMsLeft(remainingMs(createdAt)), 1000);
    return () => window.clearInterval(timer);
  }, [createdAt]);

  if (msLeft <= 0) {
    return null;
  }

  function runUndo() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("receiptId", receiptId);
      formData.set("studentId", studentId);
      formData.set("sessionLabel", sessionLabel);
      formData.set("reason", `Payment undone from receipt page (${receiptNumber})`);
      const result = await undoRecentPaymentAction(formData);
      toast({
        title: result.ok ? "Payment undone" : "Undo failed",
        description: result.message,
      });
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Undo this payment · {formatCountdown(msLeft)}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Reverse receipt {receiptNumber} in full?
      </span>
      <Button type="button" variant="destructive" disabled={pending} onClick={runUndo}>
        {pending ? "Undoing..." : "Yes, undo"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </span>
  );
}
