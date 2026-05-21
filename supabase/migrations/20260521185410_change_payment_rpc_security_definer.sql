-- Set payment-related RPC functions to security definer so they run with owner context
-- and bypass direct schema permissions issues when invoked byauthenticated staff roles.

-- 1. public.post_student_payment_with_adjustments
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
security definer
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
      insert into public.payments (receipt_id, student_id, installment_id, amount, notes)
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, v_payment_allocation,
        nullif(trim(coalesce(p_remarks, '')), '')
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
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) to authenticated;

-- 2. public.preview_workbook_payment_allocation
drop function if exists public.preview_workbook_payment_allocation(uuid, date);

create or replace function public.preview_workbook_payment_allocation(
  p_student_id uuid,
  p_payment_date date
)
returns table (
  installment_id uuid,
  student_id uuid,
  admission_no text,
  student_name text,
  father_name text,
  father_phone text,
  session_label text,
  class_id uuid,
  class_name text,
  class_label text,
  section text,
  stream_name text,
  installment_no smallint,
  installment_label text,
  due_date date,
  base_charge integer,
  paid_amount integer,
  adjustment_amount integer,
  applied_amount integer,
  raw_late_fee integer,
  waiver_applied integer,
  final_late_fee integer,
  total_charge integer,
  pending_amount integer,
  balance_status text,
  last_payment_date date,
  transport_route_id uuid,
  transport_route_name text,
  transport_route_code text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select *
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true)
  where pending_amount > 0
  order by due_date asc, installment_no asc;
$$;

grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;

-- 3. public.post_student_payment
drop function if exists public.post_student_payment(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid
);

create or replace function public.post_student_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP',
  p_client_request_id uuid default null
)
returns table (
  receipt_id uuid,
  receipt_number text,
  allocated_total integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  balance_row record;
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
  existing_receipt_number text;
  existing_total_amount integer;
  total_outstanding integer;
  normalized_prefix text;
  active_policy_model text;
  active_policy_session text;
  student_session_label text;
  use_workbook_mode boolean := false;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select r.id, r.receipt_number, r.total_amount
    into candidate_receipt_id, existing_receipt_number, existing_total_amount
    from public.receipts as r
    where r.student_id = p_student_id
      and r.client_request_id = p_client_request_id
    order by r.created_at desc
    limit 1;

    if candidate_receipt_id is not null then
      return query
      select
        candidate_receipt_id as receipt_id,
        existing_receipt_number as receipt_number,
        existing_total_amount as allocated_total;
      return;
    end if;
  end if;

  select c.session_label
  into student_session_label
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  where s.id = p_student_id;

  if student_session_label is null then
    raise exception 'Selected student was not found.';
  end if;

  select fpc.calculation_model, fpc.academic_session_label
  into active_policy_model, active_policy_session
  from public.fee_policy_configs as fpc
  where fpc.academic_session_label = student_session_label
  order by fpc.updated_at desc
  limit 1;

  use_workbook_mode := active_policy_model = 'workbook_v1';

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  if use_workbook_mode then
    select coalesce(sum(snapshot_row.pending_amount), 0)
    into total_outstanding
    from private.workbook_installment_snapshot(
      p_student_id,
      p_payment_date,
      true
    ) as snapshot_row
    where snapshot_row.pending_amount > 0;
  else
    select coalesce(sum(balance_view.outstanding_amount), 0)
    into total_outstanding
    from public.v_installment_balances as balance_view
    where balance_view.student_id = p_student_id
      and balance_view.outstanding_amount > 0;
  end if;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts as receipt_row
  where receipt_row.receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    daily_sequence := daily_sequence + 1;
    candidate_receipt_number :=
      normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number,
        student_id,
        payment_date,
        payment_mode,
        total_amount,
        reference_number,
        notes,
        received_by,
        client_request_id
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        if p_client_request_id is not null then
          select r.id, r.receipt_number, r.total_amount
          into candidate_receipt_id, existing_receipt_number, existing_total_amount
          from public.receipts as r
          where r.student_id = p_student_id
            and r.client_request_id = p_client_request_id
          order by r.created_at desc
          limit 1;

          if candidate_receipt_id is not null then
            return query
            select
              candidate_receipt_id as receipt_id,
              existing_receipt_number as receipt_number,
              existing_total_amount as allocated_total;
            return;
          end if;
        end if;

        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  if use_workbook_mode then
    for balance_row in
      select
        snapshot_row.installment_id,
        snapshot_row.pending_amount
      from private.workbook_installment_snapshot(
        p_student_id,
        p_payment_date,
        true
      ) as snapshot_row
      where snapshot_row.pending_amount > 0
      order by snapshot_row.due_date asc, snapshot_row.installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.pending_amount);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  else
    for balance_row in
      select
        balance_view.installment_id,
        balance_view.outstanding_amount
      from public.v_installment_balances as balance_view
      where balance_view.student_id = p_student_id
        and balance_view.outstanding_amount > 0
      order by balance_view.due_date asc, balance_view.installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.outstanding_amount);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  end if;

  if remaining_amount <> 0 then
    raise exception 'Unable to allocate payment cleanly. Please retry.';
  end if;

  return query
  select
    candidate_receipt_id as receipt_id,
    candidate_receipt_number as receipt_number,
    p_total_amount as allocated_total;
end;
$$;

grant execute on function public.post_student_payment(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
