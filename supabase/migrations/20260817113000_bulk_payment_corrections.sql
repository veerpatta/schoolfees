-- Bulk correction of wrongly-entered payment data, for the CLI harness only.
--
-- Two objects, and neither of them lets anything edit a posted row.
--
-- 1. `post_corrected_payment` — reposts a receipt with an EXPLICIT allocation.
--
--    Correcting a wrong entry is reverse + repost. The reversal half already
--    exists (`reverse_receipt_admin`). The repost half could not use the desk's
--    RPC for one case: `post_student_payment_with_adjustments` allocates by
--    `plan_priority, due_date, installment_no`, so reposting money that landed
--    on the wrong installment would re-derive the same wrong answer. And
--    `payment_adjustments` cannot express a cross-installment move either — its
--    FK pins an adjustment to its payment's own installment.
--
--    So this takes the allocation as an argument. Everything else — the receipt
--    number sequence, the advisory lock, the client_request_id idempotency —
--    is the desk RPC's, on purpose: two receipt-numbering schemes would collide.
--
--    Gated on `service_role` ALONE. There is deliberately no staff permission
--    for it, so no browser session can reach it and the Payment Desk remains the
--    only posting surface a human can use.
--
-- 2. A column-selective guard on `receipts`.
--
--    `prevent_append_only_mutation()` is one unconditional raise shared with
--    `payments`, `payment_adjustments` and `audit_logs`. Weakening it would
--    weaken all four. Instead `receipts` gets its own guard that names the money
--    columns and refuses those, while allowing three purely descriptive ones —
--    `reference_number`, `notes`, `received_by`. Fixing a typo'd UPI reference
--    should not require voiding a parent's receipt and issuing a new number.
--
--    Every money column stays exactly as immutable as it was. DELETE stays
--    refused outright. The audit trigger still records before/after.
--    Pattern follows `private.protect_repayment_plan_terms`.

-- ---------------------------------------------------------------------------
-- 1. Repost with an explicit allocation
-- ---------------------------------------------------------------------------

create or replace function public.post_corrected_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_allocations jsonb,
  p_client_request_id uuid,
  p_reference_number text default null,
  p_received_by text default null,
  p_notes text default null,
  p_receipt_prefix text default 'SVP'
)
returns table (receipt_id uuid, receipt_number text, allocated_total integer)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_normalized_prefix text;
  v_daily_sequence integer;
  v_candidate_receipt_id uuid;
  v_candidate_receipt_number text;
  v_existing_receipt_id uuid;
  v_existing_receipt_number text;
  v_existing_total integer;
  v_total integer := 0;
  v_attempt integer;
  alloc record;
begin
  -- Service role only. No `has_permission` arm: this must not be reachable from
  -- a staff session, or it becomes a second posting surface for humans.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'post_corrected_payment is callable only by the correction harness.';
  end if;

  if p_client_request_id is null then
    raise exception 'A client_request_id is required so a re-run cannot double-post.';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'p_allocations must be a non-empty JSON array of { installment_id, amount }.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- Idempotency, same contract as the desk RPC: a repeated run resolves to the
  -- receipt it already wrote instead of writing a second one.
  select r.id, r.receipt_number, r.total_amount
  into v_existing_receipt_id, v_existing_receipt_number, v_existing_total
  from public.receipts as r
  where r.student_id = p_student_id
    and r.client_request_id = p_client_request_id
  limit 1;

  if v_existing_receipt_id is not null then
    return query select v_existing_receipt_id, v_existing_receipt_number, v_existing_total;
    return;
  end if;

  create temporary table _corrected_allocations on commit drop as
  select
    (item->>'installment_id')::uuid as installment_id,
    (item->>'amount')::integer      as amount
  from jsonb_array_elements(p_allocations) as item;

  if exists (select 1 from _corrected_allocations where amount is null or amount <= 0) then
    raise exception 'Every allocation needs a positive amount.';
  end if;

  if exists (
    select 1
    from _corrected_allocations as a
    group by a.installment_id
    having count(*) > 1
  ) then
    raise exception 'The same installment appears twice in the allocation. Combine it into one row.';
  end if;

  -- Every installment must be this student's own.
  if exists (
    select 1
    from _corrected_allocations as a
    left join public.installments as i
      on i.id = a.installment_id and i.student_id = p_student_id
    where i.id is null
  ) then
    raise exception 'An allocation names an installment that does not belong to this student.';
  end if;

  -- …and must have room for it. Read the LIVE snapshot function, never the
  -- materialized view: the matview lags a posting by up to two minutes, and a
  -- correction runs immediately after a reversal. Pricing a repost off stale
  -- balances is what re-committed a family to their pre-payment total once.
  if exists (
    select 1
    from _corrected_allocations as a
    join private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snap
      on snap.installment_id = a.installment_id
    where a.amount > snap.total_pending
  ) then
    raise exception 'An allocation is larger than what that installment still owes.';
  end if;

  select coalesce(sum(amount), 0) into v_total from _corrected_allocations;

  v_normalized_prefix := coalesce(nullif(trim(p_receipt_prefix), ''), 'SVP');

  -- Receipt numbers are a per-day sequence derived by max(), not a sequence
  -- object, and the trailing group MUST stay exactly four digits: the desk RPC
  -- reads it back with '-([0-9]{4})$'. A correction number of any other shape
  -- makes that regex miss, max() return 0, and the next real posting on that
  -- date collide through all its retries.
  select coalesce(max((regexp_match(r.receipt_number, '-([0-9]{4})$'))[1]::integer), 0)
  into v_daily_sequence
  from public.receipts as r
  where r.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for v_attempt in 1..12 loop
    v_daily_sequence := v_daily_sequence + 1;
    v_candidate_receipt_number :=
      v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-'
      || lpad(v_daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number, student_id, payment_date, payment_mode, total_amount,
        reference_number, notes, received_by, client_request_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, v_total,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into v_candidate_receipt_id;
      exit;
    exception
      when unique_violation then
        -- Could be the receipt number racing another posting, or the
        -- client_request_id landing concurrently. Re-check the latter before
        -- trying a new number.
        select r.id, r.receipt_number, r.total_amount
        into v_existing_receipt_id, v_existing_receipt_number, v_existing_total
        from public.receipts as r
        where r.student_id = p_student_id
          and r.client_request_id = p_client_request_id
        limit 1;

        if v_existing_receipt_id is not null then
          return query select v_existing_receipt_id, v_existing_receipt_number, v_existing_total;
          return;
        end if;

        continue;
    end;
  end loop;

  if v_candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  -- The four snapshot columns are left NULL/0 on purpose. They are frozen
  -- display values — "the balance the parent was told at the counter" — and a
  -- correction posted months later was never told to anybody. Same choice the
  -- 20260727113603 allocation repair made.
  for alloc in select installment_id, amount from _corrected_allocations order by installment_id loop
    insert into public.payments (
      receipt_id, student_id, installment_id, amount, notes,
      discount_applied_at_posting, waiver_applied_at_posting,
      pending_before_posting, pending_after_posting
    )
    values (
      v_candidate_receipt_id, p_student_id, alloc.installment_id, alloc.amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      0, 0, null, null
    );
  end loop;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, v_total;
end;
$$;

revoke all on function public.post_corrected_payment(
  uuid, date, public.payment_mode, jsonb, uuid, text, text, text, text
) from public;
revoke all on function public.post_corrected_payment(
  uuid, date, public.payment_mode, jsonb, uuid, text, text, text, text
) from anon;
revoke all on function public.post_corrected_payment(
  uuid, date, public.payment_mode, jsonb, uuid, text, text, text, text
) from authenticated;
grant execute on function public.post_corrected_payment(
  uuid, date, public.payment_mode, jsonb, uuid, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Money columns on `receipts` stay immutable; three descriptive ones do not
-- ---------------------------------------------------------------------------

create or replace function private.protect_receipt_money_columns()
returns trigger
language plpgsql
set search_path to 'private', 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'receipts is append-only and cannot be deleted.';
  end if;

  if new.id is distinct from old.id
     or new.receipt_number is distinct from old.receipt_number
     or new.student_id is distinct from old.student_id
     or new.payment_date is distinct from old.payment_date
     or new.payment_mode is distinct from old.payment_mode
     or new.total_amount is distinct from old.total_amount
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.client_request_id is distinct from old.client_request_id
     or new.family_payment_id is distinct from old.family_payment_id
  then
    raise exception
      'A posted receipt''s money cannot be edited. Reverse it and post a corrected one.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_receipt_money_columns() from public, anon;
grant execute on function private.protect_receipt_money_columns() to authenticated, service_role;

drop trigger if exists receipts_are_append_only on public.receipts;
create trigger receipts_are_append_only
before update or delete on public.receipts
for each row execute function private.protect_receipt_money_columns();
