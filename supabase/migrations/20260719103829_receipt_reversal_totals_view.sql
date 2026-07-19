-- Per-receipt reversal totals, so every receipt LIST (Transactions, Receipts,
-- Payment Desk recents, student profile, exports) can cheaply flag receipts
-- that were reversed (undo / refund / duplicate correction) instead of only
-- the receipt detail page knowing.
--
-- security_invoker so the caller's RLS on payment_adjustments/payments
-- applies, matching every other view in this schema.

create or replace view public.v_receipt_reversal_totals
with (security_invoker = true) as
select
  p.receipt_id,
  sum(-a.amount_delta)::integer as reversed_amount
from public.payment_adjustments as a
join public.payments as p on p.id = a.payment_id
where a.adjustment_type = 'reversal'
  and a.amount_delta < 0
group by p.receipt_id;

grant select on public.v_receipt_reversal_totals to authenticated;
