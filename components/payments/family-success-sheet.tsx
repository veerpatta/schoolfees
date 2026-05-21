import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { FamilyPaymentActionState } from "@/lib/payments/types";

type FamilySuccessSheetProps = {
  state: FamilyPaymentActionState;
};

export function FamilySuccessSheet({ state }: FamilySuccessSheetProps) {
  if (state.status !== "success" || !state.familyPaymentId) {
    return null;
  }

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
        <Link href={`/protected/receipts/family/${state.familyPaymentId}`}>Print Family Statement</Link>
      </Button>
    </div>
  );
}
