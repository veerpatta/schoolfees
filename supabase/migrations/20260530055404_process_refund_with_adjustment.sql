-- Wire refunds into the financial engine.
--
-- Until now, "processing" a refund only flipped refund_requests.status — it
-- moved no money in v_student_financial_state, the ledger, or Transactions.
-- This RPC makes processing a refund post real reversal payment_adjustments
-- (negative amount_delta) against the receipt's payment rows, so the student's
-- applied/paid amount drops and pending rises, exactly like the financial views
-- expect (applied_amount = greatest(paid_amount + adjustment_amount, 0)).
--
-- Posted payments/receipts are never mutated (append-only). The refund effect
-- is expressed purely as new append-only adjustment rows, plus the status flip,
-- all in one transaction.

create or replace function public.process_refund_with_adjustment(p_refund_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status public.refund_request_status;
  v_receipt_id uuid;
  v_student_id uuid;
  v_amount integer;
  v_remaining integer;
  v_alloc integer;
  pay record;
begin
  if not public.has_permission('finance:write') then
    raise exception 'You do not have permission to process refunds.';
  end if;

  select status, receipt_id, student_id, requested_amount
  into v_status, v_receipt_id, v_student_id, v_amount
  from public.refund_requests
  where id = p_refund_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_status <> 'approved' then
    raise exception 'Only approved refund requests can be processed.';
  end if;

  v_remaining := v_amount;

  -- Allocate the refund across the receipt's payment rows. Each payment's
  -- refundable headroom is its gross amount net of any prior adjustments
  -- (reversals are negative), so repeated partial refunds against the same
  -- receipt can never sum past what was actually paid — guarding cumulative
  -- over-refund, not just a single oversized request.
  for pay in
    select
      p.id,
      p.installment_id,
      (
        p.amount
        + coalesce(
            (
              select sum(a.amount_delta)
              from public.payment_adjustments as a
              where a.payment_id = p.id
            ),
            0
          )
      )::integer as available
    from public.payments as p
    where p.receipt_id = v_receipt_id
      and p.student_id = v_student_id
    order by available desc, p.id
  loop
    exit when v_remaining <= 0;
    continue when pay.available <= 0;

    v_alloc := least(v_remaining, pay.available);

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, v_student_id, pay.installment_id, 'reversal', -v_alloc,
      'Refund processed',
      'refund_request:' || p_refund_request_id::text
    );

    v_remaining := v_remaining - v_alloc;
  end loop;

  if v_remaining > 0 then
    raise exception 'Refund amount exceeds the remaining refundable balance on this receipt.';
  end if;

  update public.refund_requests
  set status = 'processed',
      processed_at = now(),
      processed_by = auth.uid()
  where id = p_refund_request_id;
end;
$$;

revoke all on function public.process_refund_with_adjustment(uuid) from public;
revoke all on function public.process_refund_with_adjustment(uuid) from anon;
grant execute on function public.process_refund_with_adjustment(uuid) to authenticated;
