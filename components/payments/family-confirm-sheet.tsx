import { formatInr } from "@/lib/helpers/currency";
import type { FamilyPaymentEntryPageData } from "@/lib/payments/types";

type FamilyConfirmSheetProps = {
  childRows: FamilyPaymentEntryPageData["children"];
};

export function FamilyConfirmSheet({ childRows }: FamilyConfirmSheetProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm">
      <p className="font-semibold text-foreground">Receipt summary</p>
      <div className="mt-2 space-y-2">
        {childRows.map((child) => (
          <div key={child.studentId} className="flex items-center justify-between gap-3">
            <span>
              {child.fullName} ({child.admissionNo})
            </span>
            <span className="font-semibold">{formatInr(child.defaultAllocatedAmount)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        One receipt will be created per child in the same family payment transaction.
      </p>
    </div>
  );
}
