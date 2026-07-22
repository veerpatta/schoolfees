import type { Metadata } from "next";

import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";
import { formatMediumDate } from "@/lib/helpers/date";
import {
  getReceiptReversalTotals,
  isReceiptReversed,
} from "@/lib/receipts/reversals";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public receipt verification page — the target of the QR printed on every
 * V3 receipt (`/r/{receiptNumber}`).
 *
 * Deliberately minimal disclosure: it confirms that a receipt number is a
 * genuine school receipt, its date, amount, and whether it has since been
 * reversed. No student identity, class, or balance information is exposed —
 * a parent holding the paper receipt already knows more than this page shows.
 *
 * Uses the service-role client (server only) because the visitor is
 * unauthenticated; the query is a single receipt_number point lookup.
 */

export const metadata: Metadata = {
  title: "Receipt verification",
  robots: { index: false, follow: false },
};

type VerifyPageProps = {
  params: Promise<{ code: string }>;
};

type VerifyResult =
  | { state: "invalid" }
  | {
      state: "valid" | "reversed";
      receiptNumber: string;
      paymentDate: string;
      totalAmount: number;
    };

async function verifyReceipt(code: string): Promise<VerifyResult> {
  const receiptNumber = decodeURIComponent(code).trim();

  // Receipt numbers are short prefixed identifiers — reject anything odd
  // before touching the database.
  if (!receiptNumber || receiptNumber.length > 64 || /[^\w\-/]/.test(receiptNumber)) {
    return { state: "invalid" };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("receipts")
      .select("id, receipt_number, payment_date, total_amount")
      .eq("receipt_number", receiptNumber)
      .maybeSingle();

    if (error || !data) {
      return { state: "invalid" };
    }

    const reversalTotals = await getReceiptReversalTotals([data.id], supabase);
    const reversed = isReceiptReversed(reversalTotals, data.id, data.total_amount ?? 0);

    return {
      state: reversed ? "reversed" : "valid",
      receiptNumber: data.receipt_number,
      paymentDate: data.payment_date,
      totalAmount: data.total_amount ?? 0,
    };
  } catch {
    return { state: "invalid" };
  }
}

export default async function ReceiptVerifyPage({ params }: VerifyPageProps) {
  const { code } = await params;
  const result = await verifyReceipt(code);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          {schoolProfile.name}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-foreground">
          Receipt verification · रसीद सत्यापन
        </h1>

        {result.state === "invalid" ? (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3">
            <p className="text-sm font-semibold text-destructive-soft-foreground">
              Not a recognised receipt
            </p>
            <p className="mt-1 text-xs text-destructive-soft-foreground/80" lang="hi">
              यह रसीद संख्या हमारे रिकॉर्ड में नहीं मिली। कृपया स्कूल कार्यालय से संपर्क करें।
            </p>
          </div>
        ) : (
          <>
            <div
              className={
                result.state === "valid"
                  ? "mt-4 rounded-xl border border-success/30 bg-success-soft px-4 py-3"
                  : "mt-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3"
              }
            >
              <p
                className={
                  result.state === "valid"
                    ? "text-sm font-semibold text-success-soft-foreground"
                    : "text-sm font-semibold text-warning-soft-foreground"
                }
              >
                {result.state === "valid"
                  ? "✓ Valid school receipt · मान्य रसीद"
                  : "This receipt has been reversed · यह रसीद निरस्त की जा चुकी है"}
              </p>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Receipt no · रसीद संख्या</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {result.receiptNumber}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Date · दिनांक</dt>
                <dd className="font-medium text-foreground">
                  {formatMediumDate(result.paymentDate)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Amount · राशि</dt>
                <dd className="font-display-money text-lg text-foreground">
                  {formatInr(result.totalAmount)}
                </dd>
              </div>
            </dl>
          </>
        )}

        <p className="mt-5 text-[11px] leading-4 text-muted-foreground">
          For any question about this receipt, please contact the school fee
          office with the printed copy.
        </p>
      </div>
    </main>
  );
}
