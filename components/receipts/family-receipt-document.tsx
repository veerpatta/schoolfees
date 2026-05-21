import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";

type FamilyReceiptDocumentProps = {
  familyPaymentId: string;
  receipts: ReceiptDetail[];
};

export function FamilyReceiptDocument({ familyPaymentId, receipts }: FamilyReceiptDocumentProps) {
  const totalPaid = receipts.reduce((sum, receipt) => sum + receipt.totalAmount, 0);
  const balanceDue = receipts.reduce((sum, receipt) => sum + receipt.outstandingAfterReceipt, 0);

  return (
    <article className="receipt-print-page relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card p-5 text-foreground shadow-sm print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none">
      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }

        @media print {
          .receipt-print-page {
            width: 190mm;
            height: 277mm;
            max-height: 277mm;
            overflow: hidden;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
      <div className="security-strip absolute inset-x-0 top-0 h-2 bg-foreground/85" />
      <div className="relative z-10 space-y-3 pt-2">
        <header className="rounded-lg border border-border bg-card p-4">
          <p className="text-lg font-semibold uppercase text-foreground">{schoolProfile.name}</p>
          <p className="text-sm text-muted-foreground">Family Fee Statement / परिवार शुल्क विवरण</p>
          <p className="mt-1 text-xs text-muted-foreground">Family payment ID: {familyPaymentId}</p>
        </header>

        <section className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-3">
            <p className="text-[10px] font-medium text-muted-foreground">Family Paid Today / आज परिवार जमा</p>
            <p className="mt-1 text-2xl font-semibold text-accent-soft-foreground">{formatInr(totalPaid)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
            <p className="text-[10px] font-medium text-muted-foreground">Receipts / रसीदें</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{receipts.length}</p>
          </div>
          <div className="rounded-lg border bg-success-soft px-3 py-3">
            <p className="text-[10px] font-medium text-muted-foreground">Family Balance Due / शेष राशि</p>
            <p className="mt-1 text-2xl font-semibold text-success-soft-foreground">{formatInr(balanceDue)}</p>
          </div>
        </section>

        <section className="space-y-2">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-lg border border-border bg-card/95 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{receipt.studentFullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {receipt.classLabel} · SR {receipt.admissionNo} · Receipt {receipt.receiptNumber}
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">{formatInr(receipt.totalAmount)}</p>
              </div>
              {receipt.conventionalDiscountAssignments.length > 0 ? (
                <div className="mt-2 rounded-md border border-accent/20 bg-accent-soft/60 px-2 py-1 text-xs text-accent-soft-foreground">
                  {receipt.conventionalDiscountAssignments.map((assignment) => (
                    <p key={assignment.assignmentId}>
                      {assignment.policyDisplayName}: {formatInr(assignment.beforeTuitionAmount)} to{" "}
                      {formatInr(assignment.resultingTuitionAmount)}
                    </p>
                  ))}
                </div>
              ) : null}
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1">Installment / किस्त</th>
                    <th className="py-1 text-right">Allocated / आज जमा</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.breakdown.slice(0, 3).map((item) => (
                    <tr key={item.paymentId} className="border-t border-border">
                      <td className="py-1">{item.installmentLabel}</td>
                      <td className="py-1 text-right font-semibold">{formatInr(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </div>
    </article>
  );
}
