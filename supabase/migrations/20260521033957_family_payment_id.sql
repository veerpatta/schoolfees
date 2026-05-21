create table if not exists public.family_payments (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.student_family_groups(id) on delete restrict,
  academic_session_label text not null,
  payment_date date not null,
  total_amount integer not null check (total_amount >= 0),
  received_by text,
  notes text,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  client_request_id text not null,
  unique (client_request_id)
);

alter table public.receipts
  add column if not exists family_payment_id uuid references public.family_payments(id) on delete restrict;

alter table public.payments
  add column if not exists family_payment_id uuid references public.family_payments(id) on delete restrict;

create index if not exists idx_receipts_family_payment_id
on public.receipts (family_payment_id);

create index if not exists idx_payments_family_payment_id
on public.payments (family_payment_id);

alter table public.family_payments enable row level security;

drop policy if exists "authenticated can read family payments" on public.family_payments;
create policy "authenticated can read family payments"
on public.family_payments for select
to authenticated
using (public.has_any_permission(array['receipts:view', 'payments:view', 'reports:view']));

drop policy if exists "authenticated can insert family payments" on public.family_payments;
create policy "authenticated can insert family payments"
on public.family_payments for insert
to authenticated
with check (public.has_permission('payments:write'));

drop trigger if exists audit_family_payments on public.family_payments;
create trigger audit_family_payments
after insert on public.family_payments
for each row execute function private.capture_audit_event();

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
  p_quick_late_fee_waiver_amount integer default 0,
  p_family_payment_id uuid default null
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
  v_payable_for_row integer;
  v_credit_for_row integer;
  v_payment_notes text;
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
        reference_number, notes, received_by, client_request_id, family_payment_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id,
        p_family_payment_id
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
    select
      snapshot.installment_id,
      snapshot.pending_amount,
      snapshot.due_date,
      snapshot.installment_no,
      row_number() over (order by snapshot.due_date asc, snapshot.installment_no asc) as row_no,
      count(*) over () as row_count
    from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot
    where snapshot.pending_amount > 0
    order by snapshot.due_date asc, snapshot.installment_no asc
  loop
    exit when v_remaining_payment <= 0 and v_remaining_discount <= 0 and v_remaining_waiver <= 0;

    v_discount_allocation := least(v_remaining_discount, balance_row.pending_amount);
    v_waiver_allocation := least(v_remaining_waiver, balance_row.pending_amount - v_discount_allocation);
    v_payable_for_row := greatest(balance_row.pending_amount - v_discount_allocation - v_waiver_allocation, 0);
    v_payment_allocation := least(v_remaining_payment, v_payable_for_row);

    if balance_row.row_no = balance_row.row_count then
      v_payment_allocation := v_remaining_payment;
    end if;

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
      v_credit_for_row := greatest(v_payment_allocation - v_payable_for_row, 0);
      v_payment_notes := nullif(trim(coalesce(p_remarks, '')), '');

      if v_credit_for_row > 0 then
        v_payment_notes := concat_ws(' | ', v_payment_notes, 'Family payment credit portion: ' || v_credit_for_row::text);
      end if;

      insert into public.payments (receipt_id, student_id, installment_id, amount, notes, family_payment_id)
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, v_payment_allocation,
        v_payment_notes, p_family_payment_id
      );
      v_remaining_payment := v_remaining_payment - v_payment_allocation;
    end if;
  end loop;

  if v_remaining_payment <> 0 or v_remaining_discount <> 0 or v_remaining_waiver <> 0 then
    raise exception 'Unable to allocate payment and concessions cleanly. Please retry.';
  end if;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, p_total_amount;
end;
$$;

grant execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer, uuid
) to authenticated;

create or replace function private.derive_family_child_client_request_id(
  p_client_request_id text,
  p_student_id uuid
)
returns uuid
language sql
immutable
as $$
  select (
    substr(hash_value, 1, 8) || '-' ||
    substr(hash_value, 9, 4) || '-4' ||
    substr(hash_value, 14, 3) || '-8' ||
    substr(hash_value, 18, 3) || '-' ||
    substr(hash_value, 21, 12)
  )::uuid
  from (select md5(p_client_request_id || '::' || p_student_id::text) as hash_value) as derived;
$$;

create or replace function public.post_family_payment(
  p_family_group_id uuid,
  p_session_label text,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_reference_number text default null,
  p_received_by text default null,
  p_notes text default null,
  p_total_amount integer default 0,
  p_allocations jsonb default '[]'::jsonb,
  p_client_request_id text default null,
  p_receipt_prefix text default 'SVP'
)
returns table (
  family_payment_id uuid,
  receipt_ids uuid[]
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  allocation_row record;
  child_receipt record;
  v_existing_family_payment_id uuid;
  v_family_payment_id uuid;
  v_allocation_sum integer;
  v_child_request_id uuid;
  v_receipt_ids uuid[] := array[]::uuid[];
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post family payments.';
  end if;

  if p_client_request_id is null or nullif(trim(p_client_request_id), '') is null then
    raise exception 'Family payment attempt is required.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Family payment amount must be greater than 0.';
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Family allocations must be an array.';
  end if;

  select fp.id
  into v_existing_family_payment_id
  from public.family_payments as fp
  where fp.client_request_id = p_client_request_id
  limit 1;

  if v_existing_family_payment_id is not null then
    select coalesce(array_agg(r.id order by r.created_at asc), array[]::uuid[])
    into v_receipt_ids
    from public.receipts as r
    where r.family_payment_id = v_existing_family_payment_id;

    return query select v_existing_family_payment_id, v_receipt_ids;
    return;
  end if;

  if not exists (
    select 1
    from public.student_family_groups as family_group
    where family_group.id = p_family_group_id
      and family_group.academic_session_label = p_session_label
  ) then
    raise exception 'Confirmed family group was not found for this session.';
  end if;

  select coalesce(sum(greatest((allocation->>'amount')::integer, 0)), 0)
  into v_allocation_sum
  from jsonb_array_elements(p_allocations) as allocation;

  if v_allocation_sum <> p_total_amount then
    raise exception 'Family allocation total must match payment total exactly.';
  end if;

  insert into public.family_payments (
    family_group_id, academic_session_label, payment_date, total_amount,
    received_by, notes, posted_by, client_request_id
  )
  values (
    p_family_group_id, p_session_label, p_payment_date, p_total_amount,
    nullif(trim(coalesce(p_received_by, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    p_client_request_id
  )
  returning id into v_family_payment_id;

  for allocation_row in
    select *
    from jsonb_to_recordset(p_allocations) as allocation(
      student_id uuid,
      amount integer,
      discount integer,
      late_fee_waiver integer
    )
  loop
    if allocation_row.amount is null or allocation_row.amount <= 0 then
      raise exception 'Each family allocation must be greater than 0.';
    end if;

    if not exists (
      select 1
      from public.student_family_members as member
      where member.family_group_id = p_family_group_id
        and member.student_id = allocation_row.student_id
        and member.academic_session_label = p_session_label
    ) then
      raise exception 'Family allocation contains a student outside the confirmed family group.';
    end if;

    v_child_request_id := private.derive_family_child_client_request_id(
      p_client_request_id,
      allocation_row.student_id
    );

    select *
    into child_receipt
    from public.post_student_payment_with_adjustments(
      p_student_id := allocation_row.student_id,
      p_payment_date := p_payment_date,
      p_payment_mode := p_payment_mode,
      p_total_amount := allocation_row.amount,
      p_reference_number := p_reference_number,
      p_remarks := p_notes,
      p_received_by := p_received_by,
      p_receipt_prefix := p_receipt_prefix,
      p_client_request_id := v_child_request_id,
      p_quick_discount_amount := greatest(coalesce(allocation_row.discount, 0), 0),
      p_quick_late_fee_waiver_amount := greatest(coalesce(allocation_row.late_fee_waiver, 0), 0),
      p_family_payment_id := v_family_payment_id
    );

    v_receipt_ids := array_append(v_receipt_ids, child_receipt.receipt_id);
  end loop;

  return query select v_family_payment_id, v_receipt_ids;
end;
$$;

grant execute on function public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
) to authenticated;
