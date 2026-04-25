import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptDetail } from "@/lib/receipts/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function paymentModeLabel(value: ReceiptDetail["paymentMode"]) {
  if (value === "upi") {
    return "UPI";
  }

  if (value === "bank_transfer") {
    return "Bank transfer";
  }

  if (value === "cheque") {
    return "Cheque";
  }

  return "Cash";
}

type ReceiptDocumentProps = {
  receipt: ReceiptDetail;
  className?: string;
};

export function ReceiptDocument({ receipt, className }: ReceiptDocumentProps) {
  const breakdownTotal = receipt.breakdown.reduce((sum, item) => sum + item.amount, 0);

  return (
    <article
      className={`mx-auto w-full max-w-4xl rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-slate-400 print:p-0 print:shadow-none ${className ?? ""}`.trim()}
    >
      <header className="border-b border-slate-300 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold uppercase tracking-wide">{schoolProfile.name}</p>
            <p className="text-sm text-slate-600">Installment receipt</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              Academic session {receipt.sessionLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Receipt no</p>
            <p className="text-lg font-semibold">{receipt.receiptNumber}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 border-b border-slate-300 py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Student name</p>
          <p className="font-medium">{receipt.studentFullName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">SR no</p>
          <p className="font-medium">{receipt.admissionNo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Class</p>
          <p className="font-medium">{receipt.classLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Father</p>
          <p className="font-medium">{receipt.fatherName || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Phone</p>
          <p className="font-medium">{receipt.fatherPhone || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Route</p>
          <p className="font-medium">{receipt.transportRouteLabel}</p>
        </div>
      </section>

      <section className="grid gap-3 border-b border-slate-300 py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Payment date</p>
          <p className="font-medium">{formatDate(receipt.paymentDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Payment mode</p>
          <p className="font-medium">{paymentModeLabel(receipt.paymentMode)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Reference no</p>
          <p className="font-medium">{receipt.referenceNumber || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Received by</p>
          <p className="font-medium">{receipt.receivedBy || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Student status</p>
          <p className="font-medium">{receipt.studentStatusLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Recorded by</p>
          <p className="font-medium">{receipt.createdByName || "Staff user"}</p>
        </div>
      </section>

      <section className="grid gap-4 border-b border-slate-300 py-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Payment breakdown</p>
          <div className="overflow-hidden rounded-md border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Installment</th>
                  <th className="px-3 py-2">Due date</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.breakdown.map((item) => (
                  <tr key={item.paymentId} className="border-t border-slate-200">
                    <td className="px-3 py-2">{item.installmentLabel}</td>
                    <td className="px-3 py-2">{formatDate(item.dueDate)}</td>
                    <td className="px-3 py-2">{item.notes || "-"}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 bg-slate-50">
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInr(breakdownTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Fee summary</p>
          <div className="overflow-hidden rounded-md border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <tbody>
                {receipt.feeSummary.map((item) => (
                  <tr key={item.label} className="border-t border-slate-200 first:border-t-0">
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 bg-slate-50">
                  <td className="px-3 py-2 font-semibold">Total due</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInr(receipt.totalDue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-3 border-b border-slate-300 py-4 text-sm md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Amount received</p>
          <p className="mt-1 font-semibold text-slate-950">{formatInr(receipt.totalAmount)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Paid to date</p>
          <p className="mt-1 font-semibold text-slate-950">{formatInr(receipt.totalPaidToDate)}</p>
          <p className="mt-1 text-xs text-slate-500">Before this receipt: {formatInr(receipt.totalPaidBeforeReceipt)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Balance after this receipt</p>
          <p className="mt-1 font-semibold text-slate-950">{formatInr(receipt.outstandingAfterReceipt)}</p>
          <p className="mt-1 text-xs text-slate-500">Current outstanding now: {formatInr(receipt.currentOutstanding)}</p>
        </div>
      </section>

      <section className="border-t border-slate-300 pt-4 text-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <span className="font-semibold">Discount:</span> {formatInr(receipt.discountAmount)}
          </div>
          <div>
            <span className="font-semibold">Late fee:</span> {formatInr(receipt.lateFeeAmount)}
          </div>
          <div>
            <span className="font-semibold">Late fee waived:</span> {formatInr(receipt.lateFeeWaived)}
          </div>
        </div>
        {receipt.notes ? (
          <p className="mt-3 text-slate-700">
            <span className="font-semibold">Remarks:</span> {receipt.notes}
          </p>
        ) : null}
      </section>
    </article>
  );
}
