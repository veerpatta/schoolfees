-- Take the financial materialized-view refresh off the payment-posting path.
--
-- This restores the design that shipped in 20260523213000_tier3_finance_performance
-- and was reverted four days later by 20260527090332.
--
-- What it costs today: trigger_refresh_financial_views() is a STATEMENT-level
-- trigger on payments, receipts and receipt_adjustments, and each firing runs
-- three CHAINED refreshes (v_workbook_installment_balances ->
-- v_workbook_student_financials -> v_student_financial_state).
-- post_student_payment_with_adjustments inserts one row PER INSTALLMENT in a
-- loop, so a single payment fires the trigger 2-5 times:
--
--     1 installment   -> 2 firings -> 6 refreshes
--     4 installments  -> 5 firings -> 15 refreshes
--     + a late-fee waiver adds 3 more, in an earlier transaction
--
-- all inside the cashier's transaction, while a parent waits at the counter.
--
-- CONCURRENTLY did not make this cheaper for the writer — it materialises the
-- result, builds an index on it and diffs against the live matview, which is
-- MORE work. It was chosen to stop readers being blocked, and it traded
-- posting latency away to buy that.
--
-- After this migration the trigger only enqueues. Two things drain the queue:
--   1. the payment server action, immediately after the response is sent
--      (lib/system-sync/financial-view-refresh.ts, called from after())
--   2. the existing */2 pg_cron job, unchanged, as the backstop
--
-- Receipts are unaffected: payments.pending_before_posting / pending_after_posting
-- are computed from the in-RPC snapshot and stored on the row at post time, so a
-- receipt's "balance after" never reads these views.

create or replace function public.trigger_refresh_financial_views()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Enqueue only. This is a single upsert plus a NOTIFY — microseconds, and it
  -- collapses the 6-15 firings of one posting transaction into one pending flag.
  perform public.queue_workbook_materialized_view_refresh();
  return null;
end;
$$;

comment on function public.trigger_refresh_financial_views() is
  'Enqueues a workbook matview refresh. Deliberately does NOT refresh inline — see 20260726000002. Drained by the payment action post-response and by the */2 cron backstop.';
