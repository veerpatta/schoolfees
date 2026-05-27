-- Persist payment allocation snapshot on every payments row.
--
-- WHY (Phase 4 of the money-clarity pass):
--   `payments.amount` alone cannot answer "where did this money go?". The
--   Payment Desk preview computes per-installment discount/waiver/pending-
--   before/pending-after when posting, but the RPC has been throwing that
--   context away. As a result, the receipt and transactions surfaces either
--   re-derive the values (drifts when policy changes later) or hide them
--   (which is what Receipt V2 currently does — see receipt-document-v2.tsx
--   lines 138-149). This migration locks the moment-of-posting context onto
--   the payments row itself so every receipt remains accurate forever.
--
-- SAFETY:
--   * Additive only — all new columns have sensible defaults / nullable.
--   * Never rewrites `amount` or any existing financial value.
--   * Backwards compatible — old code that ignores the new columns still
--     works; new UI surfaces handle nulls via the canonical `<Money fallback="—" />`.

alter table public.payments
  add column if not exists discount_applied_at_posting integer not null default 0
    check (discount_applied_at_posting >= 0),
  add column if not exists waiver_applied_at_posting integer not null default 0
    check (waiver_applied_at_posting >= 0),
  add column if not exists pending_before_posting integer
    check (pending_before_posting is null or pending_before_posting >= 0),
  add column if not exists pending_after_posting integer
    check (pending_after_posting is null or pending_after_posting >= 0);

comment on column public.payments.discount_applied_at_posting is
  'Quick discount applied to this installment AT POSTING (frozen). Cross-check: the corresponding receipt_adjustments row carries the same delta.';
comment on column public.payments.waiver_applied_at_posting is
  'Late-fee waiver applied to this installment AT POSTING (frozen). Cross-check: receipt_adjustments writeoff row carries the same delta.';
comment on column public.payments.pending_before_posting is
  'Snapshot of the installment pending amount immediately before this payment row was applied. NULL for rows posted before this column existed.';
comment on column public.payments.pending_after_posting is
  'Snapshot of the installment pending amount immediately after this payment row was applied (= pending_before - amount - discount - waiver). NULL for rows posted before this column existed.';

-- Extend post_student_payment_with_adjustments to populate the new columns.
-- The existing per-installment loop already computes all four values; we just
-- need to pass them into the payments insert.
drop function if exists public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
);

create or replace function public.post_student_payment_with_adjustments(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP',
  p_client_request_id uuid default null,
  p_quick_discount_amount integer default 0,
  p_quick_late_fee_waiver_amount integer default 0
)
returns table (
  receipt_id uuid,
  receipt_number text,
  allocated_total integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  balance_row record;
  v_payment_allocation integer;
  v_discount_allocation integer;
  v_waiver_allocation integer;
  v_remaining_payment integer;
  v_remaining_discount integer;
  v_remaining_waiver integer;
  v_daily_sequence integer;
  v_candidate_receipt_number text;
  v_candidate_receipt_id uuid;
  v_existing_receipt_number text;
  v_existing_total_amount integer;
  v_total_pending integer;
  v_revised_pending integer;
  v_normalized_prefix text;
  v_pending_after integer;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_payment_mode in ('upi', 'bank_transfer', 'cheque') and nullif(trim(coalesce(p_reference_number, '')), '') is null then
    raise exception 'Reference number is required for UPI, bank transfer, and cheque payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  v_remaining_discount := greatest(coalesce(p_quick_discount_amount, 0), 0);
  v_remaining_waiver := greatest(coalesce(p_quick_late_fee_waiver_amount, 0), 0);
  v_remaining_payment := p_total_amount;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select r.id, r.receipt_number, r.total_amount
    into v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount
    from public.receipts as r
    where r.student_id = p_student_id
      and r.client_request_id = p_client_request_id
    order by r.created_at desc
    limit 1;

    if v_candidate_receipt_id is not null then
      return query select v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount;
      return;
    end if;
  end if;

  select coalesce(sum(snapshot_row.pending_amount), 0)
  into v_total_pending
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  where snapshot_row.pending_amount > 0;

  v_revised_pending := v_total_pending - v_remaining_discount - v_remaining_waiver;

  if v_total_pending <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if v_revised_pending <= 0 then
    raise exception 'No payable dues found after discount and late fee waiver.';
  end if;

  if p_total_amount > v_revised_pending then
    raise exception 'Payment amount cannot exceed revised payable amount.';
  end if;

  v_normalized_prefix := coalesce(nullif(trim(coalesce(p_receipt_prefix, '')), ''), 'SVP');

  select coalesce(max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer), 0)
  into v_daily_sequence
  from public.receipts as receipt_row
  where receipt_row.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    v_daily_sequence := v_daily_sequence + 1;
    v_candidate_receipt_number := v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(v_daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number, student_id, payment_date, payment_mode, total_amount,
        reference_number, notes, received_by, client_request_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into v_candidate_receipt_id;
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;

  if v_candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  for balance_row in
    select installment_id, pending_amount, due_date, installment_no
    from private.workbook_installment_snapshot(p_student_id, p_payment_date, true)
    where pending_amount > 0
    order by due_date asc, installment_no asc
  loop
    exit when v_remaining_payment <= 0 and v_remaining_discount <= 0 and v_remaining_waiver <= 0;

    v_discount_allocation := least(v_remaining_discount, balance_row.pending_amount);
    v_waiver_allocation := least(v_remaining_waiver, balance_row.pending_amount - v_discount_allocation);
    v_payment_allocation := least(v_remaining_payment, balance_row.pending_amount - v_discount_allocation - v_waiver_allocation);

    if v_discount_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'discount',
        v_discount_allocation, 'Payment Desk quick discount', nullif(trim(coalesce(p_remarks, '')), '')
      );
      v_remaining_discount := v_remaining_discount - v_discount_allocation;
    end if;

    if v_waiver_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'writeoff',
        v_waiver_allocation, 'Payment Desk late fee waiver', nullif(trim(coalesce(p_remarks, '')), '')
      );
      v_remaining_waiver := v_remaining_waiver - v_waiver_allocation;
    end if;

    if v_payment_allocation > 0 then
      v_pending_after := balance_row.pending_amount
        - v_discount_allocation - v_waiver_allocation - v_payment_allocation;
      insert into public.payments (
        receipt_id, student_id, installment_id, amount, notes,
        discount_applied_at_posting, waiver_applied_at_posting,
        pending_before_posting, pending_after_posting
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, v_payment_allocation,
        nullif(trim(coalesce(p_remarks, '')), ''),
        v_discount_allocation, v_waiver_allocation,
        balance_row.pending_amount, v_pending_after
      );
      v_remaining_payment := v_remaining_payment - v_payment_allocation;
    elsif v_discount_allocation > 0 or v_waiver_allocation > 0 then
      -- Discount or waiver landed on an installment with no cash payment.
      -- Insert a zero-cash bookkeeping payments row so the per-installment
      -- timeline ALWAYS has one row per (receipt × installment) — this is
      -- what UI queries iterate over. The `amount > 0` check on the table
      -- prevents zero rows today, so we bump the check via a partial-zero
      -- migration in a follow-up. For now we skip this branch — the
      -- adjustment row alone carries the audit; this just means no
      -- payments-table snapshot for adjustment-only allocations. UI
      -- handles this by reading both tables.
      null;
    end if;
  end loop;

  if v_remaining_payment <> 0 or v_remaining_discount <> 0 or v_remaining_waiver <> 0 then
    raise exception 'Unable to allocate payment and concessions cleanly. Please retry.';
  end if;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, p_total_amount;
end;
$$;

grant execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
