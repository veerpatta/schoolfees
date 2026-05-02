-- Per-receipt quick discount/late-fee waiver audit trail.
create table if not exists public.receipt_finance_adjustments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  quick_discount_amount integer not null default 0 check (quick_discount_amount >= 0),
  quick_late_fee_waiver_amount integer not null default 0 check (quick_late_fee_waiver_amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (receipt_id)
);

alter table public.receipt_finance_adjustments enable row level security;

drop policy if exists "authenticated can read receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "authenticated can read receipt finance adjustments"
on public.receipt_finance_adjustments for select
to authenticated
using (true);

drop policy if exists "authenticated can insert receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "authenticated can insert receipt finance adjustments"
on public.receipt_finance_adjustments for insert
to authenticated
with check (true);

create or replace function public.post_student_payment_with_adjustments(
  p_student_id uuid,p_payment_date date,p_payment_mode public.payment_mode,p_total_amount integer,
  p_reference_number text default null,p_remarks text default null,p_received_by text default null,p_receipt_prefix text default 'SVP',
  p_client_request_id uuid default null,p_quick_discount_amount integer default 0,p_quick_late_fee_waiver_amount integer default 0
)
returns table (receipt_id uuid, receipt_number text, allocated_total integer)
language plpgsql security invoker set search_path = public as $$
declare
  override_row public.student_fee_overrides%rowtype;
  effective_discount integer := greatest(coalesce(p_quick_discount_amount, 0), 0);
  effective_waiver integer := greatest(coalesce(p_quick_late_fee_waiver_amount, 0), 0);
  active_fee_setting_id uuid;
  posted_row record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  if effective_discount > 0 or effective_waiver > 0 then
    select o.* into override_row from public.student_fee_overrides o where o.student_id = p_student_id and o.is_active = true order by o.updated_at desc limit 1;
    if override_row.id is null then
      select fs.id into active_fee_setting_id from public.students s join public.fee_settings fs on fs.class_id = s.class_id and fs.is_active = true where s.id = p_student_id limit 1;
      if active_fee_setting_id is null then raise exception 'No active fee settings found for this student class.'; end if;
      insert into public.student_fee_overrides (student_id, fee_setting_id, discount_amount, late_fee_waiver_amount, reason, is_active)
      values (p_student_id, active_fee_setting_id, effective_discount, effective_waiver, 'Payment Desk quick adjustment', true);
    else
      update public.student_fee_overrides set discount_amount = greatest(coalesce(discount_amount, 0) + effective_discount, 0), late_fee_waiver_amount = greatest(coalesce(late_fee_waiver_amount, 0) + effective_waiver, 0), reason = 'Payment Desk quick adjustment', updated_at = timezone('utc', now()) where id = override_row.id;
    end if;
  end if;

  select * into posted_row from public.post_student_payment(p_student_id,p_payment_date,p_payment_mode,p_total_amount,p_reference_number,p_remarks,p_received_by,p_receipt_prefix,p_client_request_id) limit 1;

  if posted_row.receipt_id is not null then
    insert into public.receipt_finance_adjustments (receipt_id, student_id, quick_discount_amount, quick_late_fee_waiver_amount)
    values (posted_row.receipt_id, p_student_id, effective_discount, effective_waiver)
    on conflict (receipt_id) do nothing;
  end if;

  return query select posted_row.receipt_id, posted_row.receipt_number, posted_row.allocated_total;
end;
$$;
