-- Fee setup module foundation:
-- 1) school-wide defaults
-- 2) per-class fee head defaults
-- 3) per-student optional override fields

create table if not exists public.school_fee_defaults (
  id uuid primary key default gen_random_uuid(),
  tuition_fee_amount integer not null default 0 check (tuition_fee_amount >= 0),
  transport_fee_amount integer not null default 0 check (transport_fee_amount >= 0),
  books_fee_amount integer not null default 0 check (books_fee_amount >= 0),
  admission_activity_misc_fee_amount integer not null default 0 check (admission_activity_misc_fee_amount >= 0),
  other_fee_heads jsonb not null default '{}'::jsonb,
  late_fee_flat_amount integer not null default 1000 check (late_fee_flat_amount >= 0),
  installment_count integer not null default 4 check (installment_count > 0),
  installment_due_dates text[] not null default array['20 April', '20 July', '20 October', '20 January'],
  student_type_default text not null default 'existing' check (student_type_default in ('new', 'existing')),
  transport_applies_default boolean not null default false,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(other_fee_heads) = 'object'),
  check (array_length(installment_due_dates, 1) >= 1)
);

alter table public.fee_settings
  add column if not exists tuition_fee_amount integer not null default 0 check (tuition_fee_amount >= 0),
  add column if not exists transport_fee_amount integer not null default 0 check (transport_fee_amount >= 0),
  add column if not exists books_fee_amount integer not null default 0 check (books_fee_amount >= 0),
  add column if not exists admission_activity_misc_fee_amount integer not null default 0 check (admission_activity_misc_fee_amount >= 0),
  add column if not exists other_fee_heads jsonb not null default '{}'::jsonb,
  add column if not exists student_type_default text not null default 'existing' check (student_type_default in ('new', 'existing')),
  add column if not exists transport_applies_default boolean not null default false;

alter table public.student_fee_overrides
  add column if not exists custom_tuition_fee_amount integer check (custom_tuition_fee_amount >= 0),
  add column if not exists custom_transport_fee_amount integer check (custom_transport_fee_amount >= 0),
  add column if not exists custom_books_fee_amount integer check (custom_books_fee_amount >= 0),
  add column if not exists custom_admission_activity_misc_fee_amount integer check (custom_admission_activity_misc_fee_amount >= 0),
  add column if not exists custom_other_fee_heads jsonb,
  add column if not exists custom_late_fee_flat_amount integer check (custom_late_fee_flat_amount >= 0),
  add column if not exists student_type_override text check (student_type_override in ('new', 'existing')),
  add column if not exists transport_applies_override boolean;

create unique index if not exists idx_school_fee_defaults_active_singleton
on public.school_fee_defaults (is_active)
where is_active;

create index if not exists idx_school_fee_defaults_created_by
on public.school_fee_defaults (created_by);

create index if not exists idx_school_fee_defaults_updated_by
on public.school_fee_defaults (updated_by);

alter table public.fee_settings
  drop constraint if exists fee_settings_other_fee_heads_object,
  add constraint fee_settings_other_fee_heads_object
  check (jsonb_typeof(other_fee_heads) = 'object');

alter table public.student_fee_overrides
  drop constraint if exists student_fee_overrides_custom_other_fee_heads_object,
  add constraint student_fee_overrides_custom_other_fee_heads_object
  check (
    custom_other_fee_heads is null
    or jsonb_typeof(custom_other_fee_heads) = 'object'
  );

alter table public.student_fee_overrides
  drop constraint if exists student_fee_overrides_override_payload_check,
  add constraint student_fee_overrides_override_payload_check
  check (
    custom_annual_base_amount is not null
    or custom_transport_installment_amount is not null
    or custom_late_fee_flat_amount is not null
    or discount_amount > 0
    or custom_tuition_fee_amount is not null
    or custom_transport_fee_amount is not null
    or custom_books_fee_amount is not null
    or custom_admission_activity_misc_fee_amount is not null
    or (
      custom_other_fee_heads is not null
      and custom_other_fee_heads <> '{}'::jsonb
    )
    or student_type_override is not null
    or transport_applies_override is not null
  );

drop trigger if exists set_updated_at_on_school_fee_defaults on public.school_fee_defaults;
create trigger set_updated_at_on_school_fee_defaults
before update on public.school_fee_defaults
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_school_fee_defaults on public.school_fee_defaults;
create trigger set_actor_columns_on_school_fee_defaults
before insert or update on public.school_fee_defaults
for each row execute function private.set_actor_columns();

drop trigger if exists audit_school_fee_defaults on public.school_fee_defaults;
create trigger audit_school_fee_defaults
after insert or update or delete on public.school_fee_defaults
for each row execute function private.capture_audit_event();

alter table public.school_fee_defaults enable row level security;

drop policy if exists "authenticated can read school fee defaults" on public.school_fee_defaults;
create policy "authenticated can read school fee defaults"
on public.school_fee_defaults for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert school fee defaults" on public.school_fee_defaults;
create policy "authenticated can insert school fee defaults"
on public.school_fee_defaults for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update school fee defaults" on public.school_fee_defaults;
create policy "authenticated can update school fee defaults"
on public.school_fee_defaults for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
