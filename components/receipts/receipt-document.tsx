import Image from "next/image";

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

function wordsBelowThousand(value: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const parts: string[] = [];

  if (value >= 100) {
    parts.push(`${ones[Math.floor(value / 100)]} Hundred`);
    value %= 100;
  }

  if (value >= 20) {
    parts.push(tens[Math.floor(value / 10)]);
    value %= 10;
  }

  if (value > 0) {
    parts.push(ones[value]);
  }

  return parts.join(" ");
}

function amountInWords(value: number) {
  const amount = Math.max(Math.round(value), 0);

  if (amount === 0) {
    return "Zero Rupees Only";
  }

  const groups: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [1, ""],
  ];
  const parts: string[] = [];
  let remaining = amount;

  groups.forEach(([size, label]) => {
    const groupValue = Math.floor(remaining / size);

    if (groupValue > 0) {
      parts.push(`${wordsBelowThousand(groupValue)}${label ? ` ${label}` : ""}`);
      remaining %= size;
    }
  });

  return `${parts.join(" ")} Rupees Only`;
}

function feeLabelHindi(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("tuition")) {
    return "शिक्षण शुल्क";
  }

  if (normalized.includes("transport")) {
    return "परिवहन शुल्क";
  }

  if (normalized.includes("academic")) {
    return "शैक्षणिक शुल्क";
  }

  if (normalized.includes("late")) {
    return "विलंब शुल्क";
  }

  if (normalized.includes("discount") || normalized.includes("waiver")) {
    return "छूट";
  }

  if (normalized.includes("book")) {
    return "पुस्तक शुल्क";
  }

  return "शुल्क";
}

type ReceiptDocumentProps = {
  receipt: ReceiptDetail;
  className?: string;
};

function BilingualLabel({ english, hindi }: { english: string; hindi: string }) {
  return (
    <span className="block">
      <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{english}</span>
      <span className="block text-[10px] font-medium text-muted-foreground">{hindi}</span>
    </span>
  );
}

export function ReceiptDocument({ receipt, className }: ReceiptDocumentProps) {
  const breakdownTotal = receipt.breakdown.reduce((sum, item) => sum + item.amount, 0);

  return (
    <article
      className={`receipt-print-page anim-slide-up relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card p-5 text-foreground shadow-sm print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none ${className ?? ""}`.trim()}
    >
      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }

        .receipt-print-page {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .receipt-print-page table {
          border-collapse: collapse;
        }

        @media print {
          .receipt-print-page {
            break-inside: avoid;
            page-break-inside: avoid;
            width: 190mm;
            height: 277mm;
            max-height: 277mm;
            overflow: hidden;
            font-size: 10px;
            line-height: 1.16;
            margin: 0 auto;
          }

          .receipt-print-page * {
            animation: none !important;
            transition: none !important;
          }

          .receipt-print-page section,
          .receipt-print-page table,
          .receipt-print-page tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .receipt-print-page .print-compact {
            padding-top: 0.34rem;
            padding-bottom: 0.34rem;
          }

          .receipt-print-page th,
          .receipt-print-page td {
            padding-top: 0.2rem;
            padding-bottom: 0.2rem;
          }
        }
      `}</style>

      <div className="receipt-watermark pointer-events-none absolute inset-0 flex items-center justify-center text-center text-5xl font-semibold uppercase text-foreground/8 print:text-foreground/8">
        VPPS Receipt
      </div>
      <div className="security-strip absolute inset-x-0 top-0 h-2 bg-foreground/85" />

      <div className="relative z-10 space-y-3 pt-2">
        <header className="rounded-lg border border-border bg-card p-4 print-compact">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <Image
                  src="/branding/veer-patta-school-logo.jpg"
                  alt={`${schoolProfile.name} logo`}
                  fill
                  sizes="56px"
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div>
                <p className="text-lg font-semibold uppercase text-foreground">{schoolProfile.name}</p>
                <p className="text-xs font-medium text-muted-foreground">Fee Receipt / शुल्क रसीद</p>
                <p className="mt-1 text-xs text-muted-foreground">Academic Year / शैक्षणिक सत्र: {receipt.sessionLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-right">
              <BilingualLabel english="Receipt No" hindi="रसीद संख्या" />
              <p className="mt-1 text-lg font-semibold text-foreground">{receipt.receiptNumber}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(receipt.paymentDate)}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 print-compact">
            <BilingualLabel english="Total Fee Due" hindi="कुल देय शुल्क" />
            <p className="mt-1 text-lg font-semibold text-foreground">{formatInr(receipt.totalDue)}</p>
          </div>
          <div className="rounded-lg border bg-info-soft px-3 py-3 print-compact">
            <BilingualLabel english="Paid Till Date" hindi="अब तक जमा" />
            <p className="mt-1 text-lg font-semibold text-foreground">{formatInr(receipt.totalPaidToDate)}</p>
          </div>
          <div className="rounded-lg border bg-success-soft px-3 py-3 print-compact">
            <BilingualLabel english="Paid Today" hindi="आज जमा" />
            <p className="mt-1 text-xl font-semibold text-success-soft-foreground">{formatInr(receipt.totalAmount)}</p>
          </div>
           <div className="rounded-lg border bg-warning-soft px-3 py-3 print-compact">
             <BilingualLabel english="Balance Due" hindi="शेष राशि" />
             <p className="mt-1 text-lg font-semibold text-warning-soft-foreground">{formatInr(receipt.outstandingAfterReceipt)}</p>
             <p className="mt-1 text-[10px] text-warning-soft-foreground">Balance after this receipt / इस रसीद के बाद शेष</p>
             <p className="mt-1 text-[10px] text-warning-soft-foreground">
               Current outstanding now / वर्तमान बकाया: {formatInr(receipt.currentOutstanding)}
             </p>
           </div>
        </section>

        <section className="grid gap-3 md:grid-cols-[1fr_0.82fr]">
          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">Student Details / विद्यार्थी विवरण</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <BilingualLabel english="Student Name" hindi="विद्यार्थी का नाम" />
                <p className="font-semibold text-foreground">{receipt.studentFullName}</p>
              </div>
              <div>
                <BilingualLabel english="SR No" hindi="एस.आर. नंबर" />
                <p className="font-medium">{receipt.admissionNo}</p>
              </div>
              <div>
                <BilingualLabel english="Class" hindi="कक्षा" />
                <p className="font-medium">{receipt.classLabel}</p>
              </div>
              <div>
                <BilingualLabel english="Father Name" hindi="पिता का नाम" />
                <p className="font-medium">{receipt.fatherName || "-"}</p>
              </div>
              <div>
                <BilingualLabel english="Phone" hindi="फोन" />
                <p className="font-medium">{receipt.fatherPhone || "-"}</p>
              </div>
              <div>
                <BilingualLabel english="Route" hindi="मार्ग" />
                <p className="font-medium">{receipt.transportRouteLabel}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">Payment Details / भुगतान विवरण</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <BilingualLabel english="Date" hindi="दिनांक" />
                <p className="font-medium">{formatDate(receipt.paymentDate)}</p>
              </div>
              <div>
                <BilingualLabel english="Payment Mode" hindi="भुगतान माध्यम" />
                <p className="font-medium">{paymentModeLabel(receipt.paymentMode)}</p>
              </div>
              <div>
                <BilingualLabel english="Reference No" hindi="संदर्भ संख्या" />
                <p className="font-medium">{receipt.referenceNumber || "-"}</p>
              </div>
              <div>
                <BilingualLabel english="Received By" hindi="प्राप्तकर्ता" />
                <p className="font-medium">{receipt.receivedBy || "-"}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card/95 p-4 print-compact">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Installment Details / किस्त विवरण</h2>
            <p className="text-xs text-muted-foreground">Paid today rows / आज जमा विवरण</p>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Installment / किस्त</th>
                  <th className="px-2 py-2">Due Date / देय दिनांक</th>
                  <th className="px-2 py-2">Note / टिप्पणी</th>
                  <th className="px-2 py-2 text-right">Paid Today / आज जमा</th>
                </tr>
              </thead>
              <tbody>
                {receipt.breakdown.map((item) => (
                  <tr key={item.paymentId} className="border-t border-border">
                    <td className="px-2 py-2 font-medium text-foreground">{item.installmentLabel}</td>
                    <td className="px-2 py-2">{formatDate(item.dueDate)}</td>
                    <td className="px-2 py-2">{item.notes || "-"}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-2">
                  <td colSpan={3} className="px-2 py-2 text-right font-semibold">Paid Today Total / आज कुल जमा</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatInr(breakdownTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-border bg-card/95 p-4 print-compact">
            <h2 className="text-sm font-semibold text-foreground">Fee Breakup / शुल्क विवरण</h2>
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <tbody>
                  {receipt.feeSummary.map((item) => (
                    <tr key={item.label} className="border-t border-border first:border-t-0">
                      <td className="px-2 py-1.5">
                        {item.label} / {item.label === "Other Fees" ? "अन्य शुल्क" : feeLabelHindi(item.label)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">{formatInr(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm print-compact">
            <p>
              <span className="font-semibold">Amount in Words / राशि शब्दों में:</span>{" "}
              {amountInWords(receipt.totalAmount)}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p><span className="font-semibold">Discount / छूट:</span> {formatInr(receipt.discountAmount)}</p>
              <p><span className="font-semibold">Late Fee / विलंब शुल्क:</span> {formatInr(receipt.lateFeeAmount)}</p>
              <p><span className="font-semibold">Late Fee Waived / विलंब शुल्क माफ:</span> {formatInr(receipt.lateFeeWaived)}</p>
              <p><span className="font-semibold">Paid Before / पहले जमा:</span> {formatInr(receipt.totalPaidBeforeReceipt)}</p>
            </div>
            {receipt.notes ? (
              <p className="mt-2 text-foreground">
                <span className="font-semibold">Remarks / टिप्पणी:</span> {receipt.notes}
              </p>
            ) : null}
          </div>
        </section>

        <footer className="flex items-end justify-between gap-4 pt-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">This is an official school fee receipt. / यह विद्यालय की आधिकारिक शुल्क रसीद है।</p>
            <p>Please keep this receipt for your records. / कृपया इस रसीद को सुरक्षित रखें।</p>
          </div>
          <div className="min-w-48 border-t border-border-strong pt-2 text-center">
            Authorised Signature / अधिकृत हस्ताक्षर
          </div>
        </footer>
      </div>
    </article>
  );
}
