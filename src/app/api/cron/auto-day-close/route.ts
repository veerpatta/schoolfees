import { NextResponse } from "next/server";

import { requireJobSecret } from "@/platform/jobs/job-secret";
import { runJob, type JobContext } from "@/platform/jobs/run-job";

import {
  getReceiptReversalTotals,
  isReceiptReversed,
} from "@/modules/receipts/data/reversals";
import { createAdminClient } from "@/platform/supabase/admin";

const JOB_NAME = "auto_day_close";

// Automatic day close.
//
// The office no longer taps a button or waits for an approval. A nightly cron
// snapshots the previous day's collection totals into `collection_closures`
// with status `closed`. Cash-to-bank reconciliation was intentionally dropped —
// the close is a read-only record of what was collected, nothing to action.
//
// Scheduled in vercel.json at 18:30 UTC (00:00 IST) so it closes the IST day
// that just ended. Idempotent on the unique `payment_date`.

const IST_OFFSET_MINUTES = 5 * 60 + 30;

function istYesterday(now: Date): string {
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  istNow.setUTCDate(istNow.getUTCDate() - 1);
  return istNow.toISOString().slice(0, 10);
}

type ModeTotal = {
  paymentMode: "cash" | "upi" | "bank_transfer" | "cheque";
  totalAmount: number;
  receiptCount: number;
};

export async function GET(request: Request) {
  // Authorisation happens BEFORE runJob: an unauthenticated prober must not be
  // able to fill job_runs with rows.
  const auth = requireJobSecret(request, JOB_NAME, { allowQuery: true });
  if (!auth.ok) {
    return auth.response;
  }

  return runJob({ name: JOB_NAME, request }, (ctx) => closeDay(request, ctx));
}

async function closeDay(request: Request, ctx: JobContext) {
  // Allow ?date=YYYY-MM-DD for manual backfill; default to IST yesterday.
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const targetDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : istYesterday(new Date());

  const supabase = createAdminClient();

  const { data: receiptRows, error: receiptError } = await supabase
    .from("receipts")
    .select("id, payment_mode, total_amount")
    .eq("payment_date", targetDate)
    .neq("payment_mode", "discount");

  if (receiptError) {
    ctx.fail(receiptError.message);
    return NextResponse.json(
      { ok: false, targetDate, error: receiptError.message },
      { status: 500 },
    );
  }

  const { data: processedRefundRows, error: refundError } = await supabase
    .from("refund_requests")
    .select("requested_amount")
    .eq("refund_date", targetDate)
    .eq("status", "processed");

  if (refundError) {
    ctx.fail(refundError.message);
    return NextResponse.json(
      { ok: false, targetDate, error: refundError.message },
      { status: 500 },
    );
  }

  const allReceipts = (receiptRows ?? []) as Array<{
    id: string;
    payment_mode: ModeTotal["paymentMode"];
    total_amount: number;
  }>;

  /**
   * A reversed receipt is not collection.
   *
   * `receipts.total_amount` never changes when a receipt is reversed — the
   * reversal is a compensating `payment_adjustments` row — so summing the column
   * counts money the school gave back or never took. Every other money surface
   * has excluded them since 20260726172238; this one did not, and its output is
   * a FROZEN snapshot, so a day closed before the reversal kept overstating
   * collection with no way to self-heal.
   *
   * Now a re-run for an old date (`?date=YYYY-MM-DD`) actually corrects it,
   * which is what makes reversing an old receipt safe.
   */
  const reversalTotals = await getReceiptReversalTotals(
    allReceipts.map((row) => row.id),
    supabase,
  );
  const reversedReceipts = allReceipts.filter((row) =>
    isReceiptReversed(reversalTotals, row.id, row.total_amount),
  );
  const reversedTotal = reversedReceipts.reduce((sum, row) => sum + row.total_amount, 0);
  const receipts = allReceipts.filter(
    (row) => !isReceiptReversed(reversalTotals, row.id, row.total_amount),
  );

  const modeMap = new Map<ModeTotal["paymentMode"], ModeTotal>();
  let receiptTotal = 0;
  for (const row of receipts) {
    receiptTotal += row.total_amount;
    const existing = modeMap.get(row.payment_mode);
    if (existing) {
      existing.totalAmount += row.total_amount;
      existing.receiptCount += 1;
    } else {
      modeMap.set(row.payment_mode, {
        paymentMode: row.payment_mode,
        totalAmount: row.total_amount,
        receiptCount: 1,
      });
    }
  }

  const processedRefunds = (processedRefundRows ?? []) as Array<{ requested_amount: number }>;
  const refundProcessedTotal = processedRefunds.reduce((sum, row) => sum + row.requested_amount, 0);

  const summarySnapshot = {
    receiptCount: receipts.length,
    receiptTotal,
    // Recorded rather than merely subtracted: a day whose figure moved after it
    // was closed should say so on its own row, not just disagree with an
    // earlier printout.
    reversedReceiptCount: reversedReceipts.length,
    reversedTotal,
    refundProcessedCount: processedRefunds.length,
    refundProcessedTotal,
    netCashTotal: receiptTotal - refundProcessedTotal,
    modeTotals: Array.from(modeMap.values()).sort((left, right) =>
      left.paymentMode.localeCompare(right.paymentMode),
    ),
    closeStatus: "closed",
    autoClosedAt: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from("collection_closures").upsert(
    {
      payment_date: targetDate,
      status: "closed",
      cash_deposit_status: "not_applicable",
      reconciliation_status: "cleared",
      summary_snapshot: summarySnapshot,
      closed_at: new Date().toISOString(),
    },
    { onConflict: "payment_date" },
  );

  if (upsertError) {
    ctx.fail(upsertError.message);
    return NextResponse.json(
      { ok: false, targetDate, error: upsertError.message },
      { status: 500 },
    );
  }

  await ctx.progress(receipts.length);
  ctx.detail({ targetDate, receiptCount: receipts.length, receiptTotal });

  return NextResponse.json({
    ok: true,
    targetDate,
    receiptCount: receipts.length,
    receiptTotal,
    refundProcessedTotal,
  });
}
