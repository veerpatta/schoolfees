-- Re-enable family/multi-student payment posting (Phase 9 — item 6).
-- Keep the historical RPC behavior but gate at the app layer with the
-- FAMILY_PAYMENTS_ENABLED env flag. Re-grant insert on family_payments
-- so the RPC can write rows again.

drop policy if exists "authenticated can insert family payments" on public.family_payments;
create policy "authenticated can insert family payments"
on public.family_payments for insert
to authenticated
with check (public.has_permission('payments:write'));

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

comment on table public.family_payments is
  'Pay-together batches re-enabled (gated by FAMILY_PAYMENTS_ENABLED env flag at the app layer). Each batch links to per-child receipts via receipts.family_payment_id.';
