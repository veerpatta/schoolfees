-- Payment Desk receipt-specific concessions.
-- Discounts and late-fee waivers are not cash collections. They are stored as
-- append-only receipt adjustments so receipt history can show the concession
-- applied with that receipt while financial projections reduce payable dues.

create table if not exists public.receipt_adjustments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  adjustment_type public.adjustment_type not null check (adjustment_type in ('discount', 'writeoff')),
  amount_delta integer not null check (amount_delta > 0),
  reason text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_receipt_adjustments_receipt
on public.receipt_adjustments (receipt_id, created_at desc);

create index if not exists idx_receipt_adjustments_student
on public.receipt_adjustments (student_id, created_at desc);

alter table public.receipt_adjustments enable row level security;

drop policy if exists "authenticated can read receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can read receipt adjustments"
on public.receipt_adjustments for select
to authenticated
using (public.has_any_permission(array['payments:view', 'receipts:view', 'reports:view', 'defaulters:view']));

drop policy if exists "authenticated can insert receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can insert receipt adjustments"
on public.receipt_adjustments for insert
to authenticated
with check (public.has_permission('payments:write'));

create or replace function private.prevent_receipt_adjustment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Receipt adjustments are append-only.';
end;
$$;

drop trigger if exists receipt_adjustments_are_append_only on public.receipt_adjustments;
create trigger receipt_adjustments_are_append_only
before update or delete on public.receipt_adjustments
for each row execute function private.prevent_receipt_adjustment_mutation();

drop trigger if exists set_created_by_on_receipt_adjustments on public.receipt_adjustments;
create trigger set_created_by_on_receipt_adjustments
before insert on public.receipt_adjustments
for each row execute function private.set_created_by_column();

drop trigger if exists audit_receipt_adjustments on public.receipt_adjustments;
create trigger audit_receipt_adjustments
after insert or update or delete on public.receipt_adjustments
for each row execute function private.capture_audit_event();

create or replace function private.workbook_installment_snapshot(
  p_student_id uuid default null,
  p_as_of_date date default current_date,
  p_include_candidate_late boolean default false
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
set search_path = public, private
as $$
  with active_policy as (
    select academic_session_label
    from public.fee_policy_configs
    where is_active = true
      and calculation_model = 'workbook_v1'
    order by updated_at desc
    limit 1
  ),
  session_installments as (
    select
      i.id as installment_id,
      i.student_id,
      s.admission_no,
      s.full_name as student_name,
      s.father_name,
      s.primary_phone as father_phone,
      c.session_label,
      i.class_id,
      c.class_name,
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
      coalesce(c.section, '') as section,
      coalesce(c.stream_name, '') as stream_name,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.amount_due as base_charge,
      i.status as installment_status,
      i.late_fee_flat_amount,
      coalesce(override_row.late_fee_waiver_amount, 0) as late_fee_waiver_total,
      s.transport_route_id,
      route_row.route_name as transport_route_name,
      route_row.route_code as transport_route_code
    from public.installments as i
    join public.students as s on s.id = i.student_id
    join public.classes as c on c.id = i.class_id
    join active_policy as policy_row on policy_row.academic_session_label = c.session_label
    left join public.student_fee_overrides as override_row
      on override_row.student_id = i.student_id
     and override_row.is_active = true
    left join public.transport_routes as route_row on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(payment_row.paid_by_due_amount, 0)::integer as paid_by_due_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      payment_row.last_payment_date,
      coalesce(payment_row.had_payment_after_due, false) as had_payment_after_due
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount), 0) as paid_amount,
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_date <= session_installments.due_date), 0) as paid_by_due_amount,
        max(receipt_row.payment_date) as last_payment_date,
        bool_or(receipt_row.payment_date > session_installments.due_date) as had_payment_after_due
      from public.payments as payment_row
      join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row on true
    left join lateral (
      select coalesce(sum(adjustment_amount), 0) as adjustment_amount
      from (
        select amount_delta as adjustment_amount
        from public.payment_adjustments
        where installment_id = session_installments.installment_id
        union all
        select amount_delta as adjustment_amount
        from public.receipt_adjustments
        where installment_id = session_installments.installment_id
      ) as all_adjustments
    ) as adjustment_row on true
  ),
  late_eval as (
    select
      rolled.*,
      greatest(rolled.paid_amount, 0)::integer as applied_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when rolled.base_charge <= 0 then 0
        when rolled.paid_by_due_amount >= rolled.base_charge then 0
        when rolled.had_payment_after_due then rolled.late_fee_flat_amount
        when p_include_candidate_late
          and p_as_of_date > rolled.due_date
          and greatest(rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0), 0) > 0
          then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
    from rolled
  ),
  waiver_eval as (
    select
      late_eval.*,
      least(
        late_eval.raw_late_fee,
        greatest(
          late_eval.late_fee_waiver_total - coalesce(
            sum(late_eval.raw_late_fee) over (
              partition by late_eval.student_id
              order by late_eval.installment_no
              rows between unbounded preceding and 1 preceding
            ),
            0
          ),
          0
        )
      )::integer as waiver_applied
    from late_eval
  )
  select
    waiver_eval.installment_id,
    waiver_eval.student_id,
    waiver_eval.admission_no,
    waiver_eval.student_name,
    waiver_eval.father_name,
    waiver_eval.father_phone,
    waiver_eval.session_label,
    waiver_eval.class_id,
    waiver_eval.class_name,
    waiver_eval.class_label,
    waiver_eval.section,
    waiver_eval.stream_name,
    waiver_eval.installment_no,
    waiver_eval.installment_label,
    waiver_eval.due_date,
    waiver_eval.base_charge,
    waiver_eval.paid_amount,
    waiver_eval.adjustment_amount,
    waiver_eval.applied_amount,
    waiver_eval.raw_late_fee,
    waiver_eval.waiver_applied,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.adjustment_amount, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.paid_amount - waiver_eval.adjustment_amount,
      0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.paid_amount - waiver_eval.adjustment_amount,
        0
      ) <= 0 then 'paid'
      when waiver_eval.paid_amount > 0 then 'partial'
      when p_as_of_date > waiver_eval.due_date then 'overdue'
      else 'pending'
    end as balance_status,
    waiver_eval.last_payment_date,
    waiver_eval.transport_route_id,
    waiver_eval.transport_route_name,
    waiver_eval.transport_route_code
  from waiver_eval
  order by waiver_eval.student_id, waiver_eval.installment_no;
$$;

create or replace view public.v_workbook_installment_balances
with (security_invoker = true)
as
select *
from private.workbook_installment_snapshot(null, current_date, false);

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
    v_payment_allocation := least(
      v_remaining_payment,
      balance_row.pending_amount - v_discount_allocation - v_waiver_allocation
    );

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
