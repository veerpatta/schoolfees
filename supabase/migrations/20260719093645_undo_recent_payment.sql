-- Admin-only "undo accidental payment" within 10 minutes of posting.
--
-- The undo is a full-amount reversal via payment_adjustments (append-only,
-- audit-safe) — receipts and payments rows are never mutated. Reversal rows
-- carry notes = 'payment_undo:<receipt_id>' so downstream reporting can tell
-- an undo from a refund ('refund_request:<id>'). Unlike refund reversals,
-- payment_undo rows deliberately REMAIN visible in the Finance Controls
-- correction-review queue: every undo should get a second pair of eyes.

create or replace function public.undo_recent_payment(
  p_receipt_id uuid,
  p_reason text default null
)
returns table (receipt_id uuid, receipt_number text, reversed_amount integer)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_receipt record;
  v_reversed integer := 0;
  v_existing_adjustments integer;
  v_open_refunds integer;
  pay record;
begin
  if not (select public.has_permission('payments:adjust')) then
    raise exception 'You do not have permission to undo payments.';
  end if;

  select r.id, r.receipt_number, r.student_id, r.total_amount, r.created_at
  into v_receipt
  from public.receipts as r
  where r.id = p_receipt_id;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  -- Serialize against concurrent posts/refunds/undos for the same student
  -- (same lock key scheme as post_student_payment).
  perform pg_advisory_xact_lock(hashtextextended(v_receipt.student_id::text, 0));

  if v_receipt.created_at < now() - interval '10 minutes' then
    raise exception 'Undo window has passed (10 minutes). Use the refund workflow in Finance Controls instead.';
  end if;

  select count(*)
  into v_existing_adjustments
  from public.payment_adjustments as a
  join public.payments as p on p.id = a.payment_id
  where p.receipt_id = p_receipt_id;

  if v_existing_adjustments > 0 then
    raise exception 'This receipt already has adjustments and cannot be undone. Use the refund workflow in Finance Controls instead.';
  end if;

  select count(*)
  into v_open_refunds
  from public.refund_requests as rr
  where rr.receipt_id = p_receipt_id
    and rr.status <> 'rejected';

  if v_open_refunds > 0 then
    raise exception 'This receipt has a refund request in progress and cannot be undone.';
  end if;

  for pay in
    select p.id, p.student_id, p.installment_id, p.amount
    from public.payments as p
    where p.receipt_id = p_receipt_id
    order by p.id
  loop
    continue when pay.amount <= 0;

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, pay.student_id, pay.installment_id, 'reversal', -pay.amount,
      coalesce(nullif(trim(p_reason), ''), 'Payment undone — accidental posting'),
      'payment_undo:' || p_receipt_id::text
    );

    v_reversed := v_reversed + pay.amount;
  end loop;

  if v_reversed = 0 then
    raise exception 'This receipt has no payment amount to undo.';
  end if;

  return query
  select v_receipt.id, v_receipt.receipt_number, v_reversed;
end;
$$;

revoke all on function public.undo_recent_payment(uuid, text) from public;
revoke all on function public.undo_recent_payment(uuid, text) from anon;
grant execute on function public.undo_recent_payment(uuid, text) to authenticated;
