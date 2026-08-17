-- An admin can reverse a receipt at any age, for a wrong fee entry.
--
-- `undo_recent_payment` covers the first ten minutes and refuses everything
-- after. That is the right shape for "I just mis-clicked". It is the wrong shape
-- for the mistake this function exists for: a receipt typed against the wrong
-- child, for the wrong amount, or twice, found a week later. No cash moved, so
-- the refund workflow — request, approve, process — is describing an event that
-- never happened.
--
-- Nothing here rewrites history. Like every other correction path this inserts
-- compensating `payment_adjustments` rows and touches neither `payments` nor
-- `receipts`; `payment_adjustments_are_append_only` then makes the reversal
-- itself permanent. The receipt stays on file, stamped VOID, excluded from every
-- collection figure. Dues come back on their own, because `pending_amount` is
-- derived from payments + adjustments and never stored.
--
-- Four things it deliberately does NOT undo, because each is a separate decision
-- with its own record:
--
--   * `receipt_adjustments` — a Payment Desk quick discount or late-fee waiver
--     line. Append-only, and not part of the engine's pending arithmetic. The
--     caller is told how much is there (`concession_amount`) so the UI can say so
--     rather than implying a cleaner reversal than actually happened.
--   * `student_late_fee_waivers` — waiving a late fee is its own decision with
--     its own approver. `void_late_fee_waiver` bills it again.
--   * `student_repayment_receipt_links` — append-only on purpose, and the plan's
--     remaining balance derives from `v_workbook_installment_balances`, so it
--     self-corrects.
--   * Anything on a day already closed. `collection_closures.summary_snapshot` is
--     frozen JSONB; the day-close reader nets reversals instead.
--
-- Reversal rows carry notes = 'admin_reversal:<receipt_id>' — a third convention
-- beside 'payment_undo:' and 'refund_request:'. That matters: the Finance
-- Controls correction-review queue filters out only 'refund_request:', so these
-- fall through into it. Every reversal of an old receipt gets a second look.

create or replace function public.reverse_receipt_admin(
  p_receipt_id uuid,
  p_reason text
)
returns table (
  receipt_id uuid,
  receipt_number text,
  reversed_amount integer,
  already_reversed_amount integer,
  concession_amount integer
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_receipt record;
  v_reversed integer := 0;
  v_already_reversed integer := 0;
  v_concessions integer := 0;
  v_open_refunds integer;
  v_alloc integer;
  pay record;
begin
  -- Dual-gated. A browser session needs the permission; the headless bulk
  -- correction path runs as the service role, where `auth.uid()` is null and
  -- `has_permission` can only ever answer false. Same shape as
  -- get_dashboard_repayment_summary.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (select public.has_permission('payments:reverse_any'))
  then
    raise exception 'You do not have permission to reverse a posted receipt.';
  end if;

  -- The explanation is the point of this function, so unlike undo there is no
  -- default reason to fall back to.
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reverse a receipt.';
  end if;

  select r.id, r.receipt_number, r.student_id, r.total_amount, r.payment_date
  into v_receipt
  from public.receipts as r
  where r.id = p_receipt_id;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  -- Serialize against concurrent posts, refunds and undos for the same student.
  -- Same lock key scheme as post_student_payment_with_adjustments.
  perform pg_advisory_xact_lock(hashtextextended(v_receipt.student_id::text, 0));

  -- No time window. That is the whole point of this function existing.

  select count(*)
  into v_open_refunds
  from public.refund_requests as rr
  where rr.receipt_id = p_receipt_id
    and rr.status <> 'rejected';

  if v_open_refunds > 0 then
    raise exception 'This receipt has a refund request in progress. Resolve that first, in Finance Controls.';
  end if;

  select coalesce(sum(-a.amount_delta), 0)::integer
  into v_already_reversed
  from public.payment_adjustments as a
  join public.payments as p on p.id = a.payment_id
  where p.receipt_id = p_receipt_id
    and a.adjustment_type = 'reversal'
    and a.amount_delta < 0;

  select coalesce(sum(ra.amount_delta), 0)::integer
  into v_concessions
  from public.receipt_adjustments as ra
  where ra.receipt_id = p_receipt_id;

  -- Reverse what is LEFT on each payment row, not its gross amount. A receipt
  -- that already carries a partial refund, or a stray manual ledger adjustment,
  -- reverses cleanly down to zero instead of being refused or over-reversed.
  -- Same headroom arithmetic as process_refund_with_adjustment.
  for pay in
    select
      p.id,
      p.student_id,
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
    where p.receipt_id = p_receipt_id
    order by p.id
  loop
    continue when pay.available <= 0;

    v_alloc := pay.available;

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, pay.student_id, pay.installment_id, 'reversal', -v_alloc,
      trim(p_reason),
      'admin_reversal:' || p_receipt_id::text
    );

    v_reversed := v_reversed + v_alloc;
  end loop;

  if v_reversed = 0 then
    raise exception 'This receipt is already fully reversed. Nothing left to give back.';
  end if;

  return query
  select
    v_receipt.id,
    v_receipt.receipt_number,
    v_reversed,
    v_already_reversed,
    v_concessions;
end;
$$;

revoke all on function public.reverse_receipt_admin(uuid, text) from public;
revoke all on function public.reverse_receipt_admin(uuid, text) from anon;
grant execute on function public.reverse_receipt_admin(uuid, text) to authenticated;
grant execute on function public.reverse_receipt_admin(uuid, text) to service_role;
