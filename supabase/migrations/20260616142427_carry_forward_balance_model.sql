-- Future-proof carry-forward balances
--
-- The first previous-year dues pass stored old dues as a special installment
-- row. This migration keeps that payment-compatible backing row, but adds the
-- missing business model around it: source year, target year, fee head, import
-- traceability, and a read model that can be shown throughout the app without
-- exposing the internal installment number.

set search_path = public, private;

create table if not exists public.student_carry_forward_balances (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  source_session_label text not null,
  target_session_label text not null,
  fee_head text not null default 'tuition'
    check (fee_head in ('tuition')),
  original_amount integer not null check (original_amount > 0),
  backing_installment_id uuid references public.installments(id) on delete restrict,
  import_batch_id uuid references public.prev_year_import_batches(id) on delete set null,
  import_row_id uuid references public.prev_year_import_rows(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'collected', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trim(source_session_label) <> ''),
  check (trim(target_session_label) <> ''),
  check (source_session_label <> target_session_label)
);

comment on table public.student_carry_forward_balances is
  'Audited previous-session balances carried into a target session. The linked installment remains the payment allocation target; this table is the business model shown to staff.';

comment on column public.student_carry_forward_balances.backing_installment_id is
  'Payment-compatible installment row that receives allocations for this carried-forward balance.';

create unique index if not exists idx_student_carry_forward_active_unique
  on public.student_carry_forward_balances (student_id, source_session_label, target_session_label, fee_head)
  where status <> 'cancelled';

create unique index if not exists idx_student_carry_forward_installment_unique
  on public.student_carry_forward_balances (backing_installment_id)
  where backing_installment_id is not null;

create index if not exists idx_student_carry_forward_target_session
  on public.student_carry_forward_balances (target_session_label, status, source_session_label);

create index if not exists idx_student_carry_forward_student
  on public.student_carry_forward_balances (student_id, target_session_label);

alter table public.installments
  add column if not exists carry_forward_balance_id uuid references public.student_carry_forward_balances(id) on delete set null,
  add column if not exists source_session_label text,
  add column if not exists target_session_label text,
  add column if not exists carry_forward_fee_head text;

comment on column public.installments.carry_forward_balance_id is
  'Links an internal carry-forward installment to the first-class student_carry_forward_balances row.';
comment on column public.installments.source_session_label is
  'For carry-forward rows, the session where the unpaid balance originated.';
comment on column public.installments.target_session_label is
  'For carry-forward rows, the session where the balance is collected.';
comment on column public.installments.carry_forward_fee_head is
  'For carry-forward rows, the fee head being carried forward, currently tuition.';

create index if not exists idx_installments_carry_forward_balance
  on public.installments (carry_forward_balance_id)
  where carry_forward_balance_id is not null;

create index if not exists idx_installments_carry_forward_source_target
  on public.installments (target_session_label, source_session_label, carry_forward_fee_head)
  where is_carry_forward = true;

with carry_forward_installments as (
  select
    i.id as installment_id,
    i.student_id,
    coalesce(
      nullif(i.source_session_label, ''),
      substring(i.installment_label from '\(([^)]+)\)'),
      '2025-26'
    ) as source_session_label,
    coalesce(nullif(i.target_session_label, ''), c.session_label) as target_session_label,
    coalesce(nullif(i.carry_forward_fee_head, ''), 'tuition') as fee_head,
    i.base_amount,
    row_number() over (
      partition by
        i.student_id,
        coalesce(nullif(i.source_session_label, ''), substring(i.installment_label from '\(([^)]+)\)'), '2025-26'),
        coalesce(nullif(i.target_session_label, ''), c.session_label),
        coalesce(nullif(i.carry_forward_fee_head, ''), 'tuition')
      order by i.created_at, i.id
    ) as rn
  from public.installments i
  join public.classes c on c.id = i.class_id
  where i.is_carry_forward = true
    and i.base_amount > 0
),
inserted as (
  insert into public.student_carry_forward_balances (
    student_id,
    source_session_label,
    target_session_label,
    fee_head,
    original_amount,
    backing_installment_id,
    status,
    notes
  )
  select
    student_id,
    source_session_label,
    target_session_label,
    fee_head,
    base_amount,
    installment_id,
    'active',
    'Backfilled from existing carry-forward installment.'
  from carry_forward_installments
  where rn = 1
  on conflict do nothing
  returning id, backing_installment_id
)
update public.installments i
set
  carry_forward_balance_id = coalesce(i.carry_forward_balance_id, cfb.id),
  source_session_label = coalesce(nullif(i.source_session_label, ''), cfb.source_session_label),
  target_session_label = coalesce(nullif(i.target_session_label, ''), cfb.target_session_label),
  carry_forward_fee_head = coalesce(nullif(i.carry_forward_fee_head, ''), cfb.fee_head)
from public.student_carry_forward_balances cfb
where i.id = cfb.backing_installment_id
  and i.is_carry_forward = true;

alter table public.student_carry_forward_balances enable row level security;

drop policy if exists "authenticated can read carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can read carry forward balances"
on public.student_carry_forward_balances for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can insert carry forward balances"
on public.student_carry_forward_balances for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can update carry forward balances"
on public.student_carry_forward_balances for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop trigger if exists set_updated_at_on_student_carry_forward_balances on public.student_carry_forward_balances;
create trigger set_updated_at_on_student_carry_forward_balances
before update on public.student_carry_forward_balances
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_student_carry_forward_balances on public.student_carry_forward_balances;
create trigger set_actor_columns_on_student_carry_forward_balances
before insert or update on public.student_carry_forward_balances
for each row execute function private.set_actor_columns();

drop trigger if exists audit_student_carry_forward_balances on public.student_carry_forward_balances;
create trigger audit_student_carry_forward_balances
after insert or update or delete on public.student_carry_forward_balances
for each row execute function private.capture_audit_event();

create or replace view public.v_student_carry_forward_balances
with (security_invoker = true)
as
select
  cfb.id,
  cfb.student_id,
  s.admission_no,
  s.full_name as student_name,
  s.father_name,
  s.primary_phone as father_phone,
  i.class_id,
  private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
  cfb.source_session_label,
  cfb.target_session_label,
  cfb.fee_head,
  cfb.original_amount,
  cfb.backing_installment_id,
  i.installment_no,
  i.installment_label,
  i.due_date,
  coalesce(wib.applied_amount, 0)::integer as collected_amount,
  coalesce(wib.pending_amount, cfb.original_amount)::integer as remaining_amount,
  coalesce(wib.balance_status, 'pending') as balance_status,
  cfb.status,
  cfb.import_batch_id,
  cfb.import_row_id,
  cfb.created_at,
  cfb.updated_at
from public.student_carry_forward_balances cfb
join public.students s on s.id = cfb.student_id
join public.installments i on i.id = cfb.backing_installment_id
join public.classes c on c.id = i.class_id
left join public.v_workbook_installment_balances wib on wib.installment_id = i.id;

grant select on public.v_student_carry_forward_balances to authenticated;

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
  is_carry_forward boolean,
  source_session_label text,
  target_session_label text,
  carry_forward_fee_head text,
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
set search_path = public, private, pg_temp
as $function$
  select
    snapshot_row.installment_id,
    snapshot_row.student_id,
    snapshot_row.admission_no,
    snapshot_row.student_name,
    snapshot_row.father_name,
    snapshot_row.father_phone,
    snapshot_row.session_label,
    snapshot_row.class_id,
    snapshot_row.class_name,
    snapshot_row.class_label,
    snapshot_row.section,
    snapshot_row.stream_name,
    snapshot_row.installment_no,
    snapshot_row.installment_label,
    coalesce(installment_row.is_carry_forward, false) as is_carry_forward,
    installment_row.source_session_label,
    installment_row.target_session_label,
    installment_row.carry_forward_fee_head,
    snapshot_row.due_date,
    snapshot_row.base_charge,
    snapshot_row.paid_amount,
    snapshot_row.adjustment_amount,
    snapshot_row.applied_amount,
    snapshot_row.raw_late_fee,
    snapshot_row.waiver_applied,
    snapshot_row.final_late_fee,
    snapshot_row.total_charge,
    snapshot_row.pending_amount,
    snapshot_row.balance_status,
    snapshot_row.last_payment_date,
    snapshot_row.transport_route_id,
    snapshot_row.transport_route_name,
    snapshot_row.transport_route_code
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  join public.installments as installment_row
    on installment_row.id = snapshot_row.installment_id
  where (
    coalesce(auth.role(), '') = 'service_role'
    or public.has_any_permission(array[
      'payments:view',
      'payments:write',
      'ledger:view',
      'receipts:view',
      'dashboard:view',
      'finance:view'
    ])
  )
    and snapshot_row.pending_amount > 0
  order by snapshot_row.due_date asc, snapshot_row.installment_no asc;
$function$;

revoke all on function public.preview_workbook_payment_allocation(uuid, date) from public;
revoke execute on function public.preview_workbook_payment_allocation(uuid, date) from anon;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;
