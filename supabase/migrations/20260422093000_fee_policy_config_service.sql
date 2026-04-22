create table if not exists public.fee_policy_configs (
  id uuid primary key default gen_random_uuid(),
  academic_session_label text not null,
  installment_schedule jsonb not null default '[]'::jsonb,
  late_fee_flat_amount integer not null default 1000 check (late_fee_flat_amount >= 0),
  custom_fee_heads jsonb not null default '[]'::jsonb,
  accepted_payment_modes public.payment_mode[] not null default array['cash', 'upi', 'bank_transfer', 'cheque']::public.payment_mode[],
  receipt_prefix text not null default 'SVP',
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (academic_session_label <> ''),
  check (jsonb_typeof(installment_schedule) = 'array'),
  check (jsonb_typeof(custom_fee_heads) = 'array'),
  check (coalesce(array_length(accepted_payment_modes, 1), 0) >= 1),
  check (receipt_prefix = upper(receipt_prefix)),
  check (receipt_prefix ~ '^[A-Z0-9][A-Z0-9-]{1,11}$')
);

create unique index if not exists idx_fee_policy_configs_active_singleton
on public.fee_policy_configs (is_active)
where is_active;

create index if not exists idx_fee_policy_configs_created_by
on public.fee_policy_configs (created_by);

create index if not exists idx_fee_policy_configs_updated_by
on public.fee_policy_configs (updated_by);

drop trigger if exists set_updated_at_on_fee_policy_configs on public.fee_policy_configs;
create trigger set_updated_at_on_fee_policy_configs
before update on public.fee_policy_configs
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_fee_policy_configs on public.fee_policy_configs;
create trigger set_actor_columns_on_fee_policy_configs
before insert or update on public.fee_policy_configs
for each row execute function private.set_actor_columns();

drop trigger if exists audit_fee_policy_configs on public.fee_policy_configs;
create trigger audit_fee_policy_configs
after insert or update or delete on public.fee_policy_configs
for each row execute function private.capture_audit_event();

alter table public.fee_policy_configs enable row level security;

drop policy if exists "authenticated can read fee policy configs" on public.fee_policy_configs;
create policy "authenticated can read fee policy configs"
on public.fee_policy_configs for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert fee policy configs" on public.fee_policy_configs;
create policy "authenticated can insert fee policy configs"
on public.fee_policy_configs for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update fee policy configs" on public.fee_policy_configs;
create policy "authenticated can update fee policy configs"
on public.fee_policy_configs for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

with source_row as (
  select
    coalesce(
      (
        select late_fee_flat_amount
        from public.school_fee_defaults
        where is_active = true
        limit 1
      ),
      1000
    ) as late_fee_flat_amount,
    coalesce(
      (
        select installment_due_dates
        from public.school_fee_defaults
        where is_active = true
        limit 1
      ),
      array['20 April', '20 July', '20 October', '20 January']::text[]
    ) as installment_due_dates
)
insert into public.fee_policy_configs (
  academic_session_label,
  installment_schedule,
  late_fee_flat_amount,
  custom_fee_heads,
  accepted_payment_modes,
  receipt_prefix,
  notes,
  is_active
)
select
  '2026-2027',
  (
    select jsonb_agg(
      jsonb_build_object(
        'label',
        format('Installment %s', due_dates.ordinality),
        'dueDateLabel',
        due_dates.due_date
      )
      order by due_dates.ordinality
    )
    from unnest(source_row.installment_due_dates) with ordinality as due_dates(due_date, ordinality)
  ),
  source_row.late_fee_flat_amount,
  '[]'::jsonb,
  array['cash', 'upi', 'bank_transfer', 'cheque']::public.payment_mode[],
  'SVP',
  'Canonical fee policy for academic session, installment schedule, late fee, payment modes, receipt prefix, and custom fee heads.',
  true
from source_row
where not exists (
  select 1
  from public.fee_policy_configs
  where is_active = true
);
