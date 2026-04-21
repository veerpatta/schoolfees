-- Shri Veer Patta Senior Secondary School
-- Initial fee management schema for an internal Supabase admin app.
-- This schema keeps payment history append-only and models corrections
-- through separate adjustment rows instead of rewriting old receipts.

create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'staff_role'
  ) then
    create type public.staff_role as enum ('admin', 'accounts', 'clerk');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'class_status'
  ) then
    create type public.class_status as enum ('active', 'inactive', 'archived');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'student_status'
  ) then
    create type public.student_status as enum ('active', 'inactive', 'left', 'graduated');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'installment_status'
  ) then
    create type public.installment_status as enum ('scheduled', 'waived', 'cancelled');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'payment_mode'
  ) then
    create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'adjustment_type'
  ) then
    create type public.adjustment_type as enum ('reversal', 'correction', 'discount', 'writeoff');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'audit_action'
  ) then
    create type public.audit_action as enum ('insert', 'update', 'delete');
  end if;
end
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.set_actor_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by = auth.uid();
    end if;

    if new.updated_by is null then
      new.updated_by = coalesce(auth.uid(), new.created_by);
    end if;
  else
    new.updated_by = coalesce(auth.uid(), new.updated_by, old.updated_by);
  end if;

  return new;
end;
$$;

create or replace function private.set_created_by_column()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function private.prevent_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only and cannot be updated or deleted.', tg_table_name;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'clerk',
  phone text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  class_name text not null,
  section text,
  stream_name text,
  sort_order integer not null default 0 check (sort_order >= 0),
  status public.class_status not null default 'active',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  route_code text unique,
  route_name text not null,
  default_installment_amount integer not null default 0 check (default_installment_amount >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  full_name text not null,
  date_of_birth date,
  father_name text,
  mother_name text,
  primary_phone text,
  secondary_phone text,
  address text,
  class_id uuid not null references public.classes(id) on delete restrict,
  transport_route_id uuid references public.transport_routes(id) on delete set null,
  status public.student_status not null default 'active',
  joined_on date,
  left_on date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_on is null or joined_on is null or left_on >= joined_on)
);

create table if not exists public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  annual_base_amount integer not null check (annual_base_amount >= 0),
  late_fee_flat_amount integer not null default 1000 check (late_fee_flat_amount >= 0),
  installment_count integer not null default 4 check (installment_count > 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_fee_overrides (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  fee_setting_id uuid not null references public.fee_settings(id) on delete restrict,
  custom_annual_base_amount integer check (custom_annual_base_amount >= 0),
  custom_transport_installment_amount integer check (custom_transport_installment_amount >= 0),
  custom_late_fee_flat_amount integer check (custom_late_fee_flat_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  reason text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    custom_annual_base_amount is not null
    or custom_transport_installment_amount is not null
    or custom_late_fee_flat_amount is not null
    or discount_amount > 0
  )
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  fee_setting_id uuid not null references public.fee_settings(id) on delete restrict,
  student_fee_override_id uuid references public.student_fee_overrides(id) on delete set null,
  installment_no smallint not null check (installment_no > 0),
  installment_label text not null,
  due_date date not null,
  base_amount integer not null default 0 check (base_amount >= 0),
  transport_amount integer not null default 0 check (transport_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  amount_due integer generated always as ((base_amount + transport_amount) - discount_amount) stored,
  late_fee_flat_amount integer not null default 1000 check (late_fee_flat_amount >= 0),
  status public.installment_status not null default 'scheduled',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installments_non_negative_due check (base_amount + transport_amount >= discount_amount),
  constraint installments_id_student_unique unique (id, student_id),
  constraint installments_student_class_installment_unique unique (student_id, class_id, installment_no)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  student_id uuid not null references public.students(id) on delete restrict,
  payment_date date not null default current_date,
  payment_mode public.payment_mode not null,
  total_amount integer not null check (total_amount > 0),
  reference_number text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint receipts_id_student_unique unique (id, student_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  amount integer not null check (amount > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_receipt_fk
    foreign key (receipt_id, student_id)
    references public.receipts(id, student_id)
    on delete restrict,
  constraint payments_installment_fk
    foreign key (installment_id, student_id)
    references public.installments(id, student_id)
    on delete restrict,
  constraint payments_receipt_installment_unique unique (receipt_id, installment_id),
  constraint payments_id_student_installment_unique unique (id, student_id, installment_id)
);

create table if not exists public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  adjustment_type public.adjustment_type not null,
  amount_delta integer not null check (amount_delta <> 0),
  reason text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_adjustments_payment_fk
    foreign key (payment_id, student_id, installment_id)
    references public.payments(id, student_id, installment_id)
    on delete restrict
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action public.audit_action not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (before_data is not null or after_data is not null)
);

create unique index if not exists idx_classes_unique_per_session
on public.classes (session_label, class_name, coalesce(section, ''), coalesce(stream_name, ''));

create index if not exists idx_classes_session_sort
on public.classes (session_label, sort_order, class_name);

create index if not exists idx_transport_routes_active
on public.transport_routes (is_active, route_name);

create index if not exists idx_students_class_status
on public.students (class_id, status);

create index if not exists idx_students_transport_route
on public.students (transport_route_id)
where transport_route_id is not null;

create index if not exists idx_students_full_name
on public.students (lower(full_name));

create unique index if not exists idx_fee_settings_active_per_class
on public.fee_settings (class_id)
where is_active;

create unique index if not exists idx_student_fee_overrides_active_per_student
on public.student_fee_overrides (student_id)
where is_active;

create index if not exists idx_installments_student_due_date
on public.installments (student_id, due_date);

create index if not exists idx_installments_class_due_date
on public.installments (class_id, due_date);

create index if not exists idx_installments_status_due_date
on public.installments (status, due_date);

create index if not exists idx_receipts_student_payment_date
on public.receipts (student_id, payment_date desc);

create index if not exists idx_receipts_payment_date
on public.receipts (payment_date desc);

create index if not exists idx_payments_installment
on public.payments (installment_id, created_at desc);

create index if not exists idx_payments_student_created_at
on public.payments (student_id, created_at desc);

create index if not exists idx_payment_adjustments_payment
on public.payment_adjustments (payment_id, created_at desc);

create index if not exists idx_payment_adjustments_student
on public.payment_adjustments (student_id, created_at desc);

create index if not exists idx_audit_logs_record
on public.audit_logs (table_name, record_id, created_at desc);

create index if not exists idx_audit_logs_changed_by
on public.audit_logs (changed_by, created_at desc);

drop trigger if exists set_updated_at_on_users on public.users;
create trigger set_updated_at_on_users
before update on public.users
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_users on public.users;
create trigger set_actor_columns_on_users
before insert or update on public.users
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_classes on public.classes;
create trigger set_updated_at_on_classes
before update on public.classes
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_classes on public.classes;
create trigger set_actor_columns_on_classes
before insert or update on public.classes
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_transport_routes on public.transport_routes;
create trigger set_updated_at_on_transport_routes
before update on public.transport_routes
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_transport_routes on public.transport_routes;
create trigger set_actor_columns_on_transport_routes
before insert or update on public.transport_routes
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_students on public.students;
create trigger set_updated_at_on_students
before update on public.students
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_students on public.students;
create trigger set_actor_columns_on_students
before insert or update on public.students
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_fee_settings on public.fee_settings;
create trigger set_updated_at_on_fee_settings
before update on public.fee_settings
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_fee_settings on public.fee_settings;
create trigger set_actor_columns_on_fee_settings
before insert or update on public.fee_settings
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_fee_overrides on public.student_fee_overrides;
create trigger set_updated_at_on_student_fee_overrides
before update on public.student_fee_overrides
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_student_fee_overrides on public.student_fee_overrides;
create trigger set_actor_columns_on_student_fee_overrides
before insert or update on public.student_fee_overrides
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_installments on public.installments;
create trigger set_updated_at_on_installments
before update on public.installments
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_installments on public.installments;
create trigger set_actor_columns_on_installments
before insert or update on public.installments
for each row execute function private.set_actor_columns();

drop trigger if exists set_created_by_on_receipts on public.receipts;
create trigger set_created_by_on_receipts
before insert on public.receipts
for each row execute function private.set_created_by_column();

drop trigger if exists set_created_by_on_payments on public.payments;
create trigger set_created_by_on_payments
before insert on public.payments
for each row execute function private.set_created_by_column();

drop trigger if exists set_created_by_on_payment_adjustments on public.payment_adjustments;
create trigger set_created_by_on_payment_adjustments
before insert on public.payment_adjustments
for each row execute function private.set_created_by_column();

drop trigger if exists receipts_are_append_only on public.receipts;
create trigger receipts_are_append_only
before update or delete on public.receipts
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists payments_are_append_only on public.payments;
create trigger payments_are_append_only
before update or delete on public.payments
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists payment_adjustments_are_append_only on public.payment_adjustments;
create trigger payment_adjustments_are_append_only
before update or delete on public.payment_adjustments
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists audit_logs_are_append_only on public.audit_logs;
create trigger audit_logs_are_append_only
before update or delete on public.audit_logs
for each row execute function private.prevent_append_only_mutation();

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  before_row jsonb;
  after_row jsonb;
  actor_id uuid;
  record_key uuid;
  audit_event public.audit_action;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  actor_id := coalesce(
    auth.uid(),
    nullif(
      coalesce(
        after_row ->> 'updated_by',
        before_row ->> 'updated_by',
        after_row ->> 'created_by',
        before_row ->> 'created_by'
      ),
      ''
    )::uuid
  );

  record_key := coalesce(
    nullif(after_row ->> 'id', '')::uuid,
    nullif(before_row ->> 'id', '')::uuid
  );

  audit_event := case tg_op
    when 'INSERT' then 'insert'::public.audit_action
    when 'UPDATE' then 'update'::public.audit_action
    else 'delete'::public.audit_action
  end;

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    changed_by
  )
  values (
    tg_table_name,
    record_key,
    audit_event,
    before_row,
    after_row,
    actor_id
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_users on public.users;
create trigger audit_users
after insert or update or delete on public.users
for each row execute function private.capture_audit_event();

drop trigger if exists audit_classes on public.classes;
create trigger audit_classes
after insert or update or delete on public.classes
for each row execute function private.capture_audit_event();

drop trigger if exists audit_transport_routes on public.transport_routes;
create trigger audit_transport_routes
after insert or update or delete on public.transport_routes
for each row execute function private.capture_audit_event();

drop trigger if exists audit_students on public.students;
create trigger audit_students
after insert or update or delete on public.students
for each row execute function private.capture_audit_event();

drop trigger if exists audit_fee_settings on public.fee_settings;
create trigger audit_fee_settings
after insert or update or delete on public.fee_settings
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_fee_overrides on public.student_fee_overrides;
create trigger audit_student_fee_overrides
after insert or update or delete on public.student_fee_overrides
for each row execute function private.capture_audit_event();

drop trigger if exists audit_installments on public.installments;
create trigger audit_installments
after insert or update or delete on public.installments
for each row execute function private.capture_audit_event();

drop trigger if exists audit_receipts on public.receipts;
create trigger audit_receipts
after insert or update or delete on public.receipts
for each row execute function private.capture_audit_event();

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
after insert or update or delete on public.payments
for each row execute function private.capture_audit_event();

drop trigger if exists audit_payment_adjustments on public.payment_adjustments;
create trigger audit_payment_adjustments
after insert or update or delete on public.payment_adjustments
for each row execute function private.capture_audit_event();

alter table public.users enable row level security;
alter table public.classes enable row level security;
alter table public.transport_routes enable row level security;
alter table public.students enable row level security;
alter table public.fee_settings enable row level security;
alter table public.student_fee_overrides enable row level security;
alter table public.installments enable row level security;
alter table public.receipts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_adjustments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users"
on public.users for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert users" on public.users;
create policy "authenticated can insert users"
on public.users for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update users" on public.users;
create policy "authenticated can update users"
on public.users for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes"
on public.classes for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert classes" on public.classes;
create policy "authenticated can insert classes"
on public.classes for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update classes" on public.classes;
create policy "authenticated can update classes"
on public.classes for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read transport routes" on public.transport_routes;
create policy "authenticated can read transport routes"
on public.transport_routes for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert transport routes" on public.transport_routes;
create policy "authenticated can insert transport routes"
on public.transport_routes for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update transport routes" on public.transport_routes;
create policy "authenticated can update transport routes"
on public.transport_routes for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students"
on public.students for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students"
on public.students for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students"
on public.students for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read fee settings" on public.fee_settings;
create policy "authenticated can read fee settings"
on public.fee_settings for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert fee settings" on public.fee_settings;
create policy "authenticated can insert fee settings"
on public.fee_settings for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update fee settings" on public.fee_settings;
create policy "authenticated can update fee settings"
on public.fee_settings for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read student fee overrides" on public.student_fee_overrides;
create policy "authenticated can read student fee overrides"
on public.student_fee_overrides for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert student fee overrides" on public.student_fee_overrides;
create policy "authenticated can insert student fee overrides"
on public.student_fee_overrides for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update student fee overrides" on public.student_fee_overrides;
create policy "authenticated can update student fee overrides"
on public.student_fee_overrides for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments"
on public.installments for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert installments" on public.installments;
create policy "authenticated can insert installments"
on public.installments for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can update installments" on public.installments;
create policy "authenticated can update installments"
on public.installments for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts"
on public.receipts for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert receipts" on public.receipts;
create policy "authenticated can insert receipts"
on public.receipts for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments"
on public.payments for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert payments" on public.payments;
create policy "authenticated can insert payments"
on public.payments for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments"
on public.payment_adjustments for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated can insert payment adjustments" on public.payment_adjustments;
create policy "authenticated can insert payment adjustments"
on public.payment_adjustments for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated can read audit logs" on public.audit_logs;
create policy "authenticated can read audit logs"
on public.audit_logs for select
to authenticated
using ((select auth.uid()) is not null);

create or replace view public.v_installment_balances
with (security_invoker = true)
as
with payment_totals as (
  select
    installment_id,
    coalesce(sum(amount), 0) as payments_total
  from public.payments
  group by installment_id
),
adjustment_totals as (
  select
    installment_id,
    coalesce(sum(amount_delta), 0) as adjustments_total
  from public.payment_adjustments
  group by installment_id
)
select
  installments.id as installment_id,
  installments.student_id,
  students.admission_no,
  students.full_name,
  classes.session_label,
  classes.class_name,
  coalesce(classes.section, '') as section,
  coalesce(classes.stream_name, '') as stream_name,
  installments.installment_no,
  installments.installment_label,
  installments.due_date,
  installments.status as installment_status,
  installments.amount_due,
  coalesce(payment_totals.payments_total, 0) as payments_total,
  coalesce(adjustment_totals.adjustments_total, 0) as adjustments_total,
  case
    when installments.status = 'waived' then 0
    else greatest(
      installments.amount_due
      - (coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0)),
      0
    )
  end as outstanding_amount,
  case
    when installments.status = 'waived' then 'waived'
    when installments.status = 'cancelled' then 'cancelled'
    when greatest(
      installments.amount_due
      - (coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0)),
      0
    ) = 0 then 'paid'
    when coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0) > 0 then 'partial'
    when current_date > installments.due_date then 'overdue'
    else 'pending'
  end as balance_status
from public.installments
join public.students on students.id = installments.student_id
join public.classes on classes.id = installments.class_id
left join payment_totals on payment_totals.installment_id = installments.id
left join adjustment_totals on adjustment_totals.installment_id = installments.id
where installments.status <> 'cancelled';

create or replace view public.v_outstanding_summary
with (security_invoker = true)
as
select
  session_label,
  class_name,
  section,
  stream_name,
  count(distinct student_id) filter (where outstanding_amount > 0) as students_with_dues,
  count(*) filter (where outstanding_amount > 0) as open_installments,
  coalesce(sum(outstanding_amount), 0) as outstanding_amount
from public.v_installment_balances
where balance_status not in ('paid', 'cancelled')
group by session_label, class_name, section, stream_name;

-- No delete policies are created for operational finance tables.
-- Payments, receipts, and payment adjustments are intentionally append-only.
