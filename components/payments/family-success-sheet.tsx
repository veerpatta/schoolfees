import Link from "next/link";

import { Button } from "@/components/ui/button";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { FamilyPaymentActionState } from "@/lib/payments/types";

type FamilySuccessSheetProps = {
  state: FamilyPaymentActionState;
  sessionLabel?: string;
};

export function FamilySuccessSheet({ state, sessionLabel }: FamilySuccessSheetProps) {
  if (state.status !== "success" || !state.familyPaymentId) {
    return null;
  }

  const receiptHref = appendSessionParam(
    `/protected/receipts/family/${state.familyPaymentId}`,
    sessionLabel,
  );

  return (
    <div className="rounded-lg border border-success/30 bg-success-soft p-4 text-sm text-success-soft-foreground">
      <p className="font-semibold">{state.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.receiptNumbers.map((receiptNumber) => (
          <span key={receiptNumber} className="rounded-md border border-success/20 bg-card px-2 py-1">
            {receiptNumber}
          </span>
        ))}
      </div>
      <Button asChild className="mt-3" size="sm">
        <Link href={receiptHref}>Print Family Statement</Link>
      </Button>
    </div>
  );
}
