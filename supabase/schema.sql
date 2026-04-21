-- Shri Veer Patta Senior Secondary School
-- Internal fee management starter schema for Supabase
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'staff_role'
  ) then
    create type public.staff_role as enum ('admin', 'accounts', 'clerk');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'student_status'
  ) then
    create type public.student_status as enum ('active', 'inactive', 'left', 'graduated');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'record_source'
  ) then
    create type public.record_source as enum ('manual', 'import');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ledger_status'
  ) then
    create type public.ledger_status as enum ('pending', 'partial', 'paid', 'waived');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'payment_mode'
  ) then
    create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'import_batch_status'
  ) then
    create type public.import_batch_status as enum ('draft', 'validated', 'posted', 'failed');
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'audit_action'
  ) then
    create type public.audit_action as enum ('insert', 'update', 'delete');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'clerk',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_label text not null,
  source_filename text,
  status public.import_batch_status not null default 'draft',
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  full_name text not null,
  guardian_name text,
  mobile_no text,
  class_name text not null,
  section text,
  session_label text not null,
  status public.student_status not null default 'active',
  source public.record_source not null default 'manual',
  import_batch_id uuid references public.import_batches(id) on delete set null,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  class_name text not null,
  stream_name text,
  annual_fee integer not null check (annual_fee >= 0),
  installment_count integer not null default 4 check (installment_count > 0),
  late_fee_flat integer not null default 1000 check (late_fee_flat >= 0),
  installment_due_dates jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_ledgers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  fee_structure_id uuid references public.fee_structures(id) on delete set null,
  session_label text not null,
  installment_no smallint not null check (installment_no > 0),
  installment_label text not null,
  due_date date not null,
  scheduled_amount integer not null check (scheduled_amount >= 0),
  late_fee_flat integer not null default 1000 check (late_fee_flat >= 0),
  concession_amount integer not null default 0 check (concession_amount >= 0),
  received_amount integer not null default 0 check (received_amount >= 0),
  status public.ledger_status not null default 'pending',
  last_collection_on date,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_label, installment_no)
);

create table if not exists public.fee_collections (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.fee_ledgers(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  receipt_no text not null unique,
  payment_date date not null default current_date,
  payment_mode public.payment_mode not null,
  amount_received integer not null check (amount_received >= 0),
  late_fee_collected integer not null default 0 check (late_fee_collected >= 0),
  reference_no text,
  remarks text,
  source public.record_source not null default 'manual',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  action public.audit_action not null,
  payload jsonb not null default '{}'::jsonb,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_fee_structures_unique_active
on public.fee_structures (session_label, class_name, coalesce(stream_name, ''))
where is_active;

create index if not exists idx_import_batches_status_created_at
on public.import_batches(status, created_at desc);

create index if not exists idx_students_class_session
on public.students(session_label, class_name, coalesce(section, ''), status);

create index if not exists idx_students_import_batch
on public.students(import_batch_id);

create index if not exists idx_fee_ledgers_student_session
on public.fee_ledgers(student_id, session_label);

create index if not exists idx_fee_ledgers_due_status
on public.fee_ledgers(due_date, status);

create index if not exists idx_fee_collections_payment_date
on public.fee_collections(payment_date desc);

create index if not exists idx_fee_collections_student
on public.fee_collections(student_id, payment_date desc);

create index if not exists idx_audit_log_entity
on public.audit_log(entity_table, entity_id, created_at desc);

drop trigger if exists set_updated_at_on_staff_profiles on public.staff_profiles;
create trigger set_updated_at_on_staff_profiles
before update on public.staff_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_import_batches on public.import_batches;
create trigger set_updated_at_on_import_batches
before update on public.import_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_students on public.students;
create trigger set_updated_at_on_students
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_fee_structures on public.fee_structures;
create trigger set_updated_at_on_fee_structures
before update on public.fee_structures
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_fee_ledgers on public.fee_ledgers;
create trigger set_updated_at_on_fee_ledgers
before update on public.fee_ledgers
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_fee_collections on public.fee_collections;
create trigger set_updated_at_on_fee_collections
before update on public.fee_collections
for each row execute function public.set_updated_at();

alter table public.staff_profiles enable row level security;
alter table public.import_batches enable row level security;
alter table public.students enable row level security;
alter table public.fee_structures enable row level security;
alter table public.fee_ledgers enable row level security;
alter table public.fee_collections enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_key uuid;
  audit_payload jsonb;
  audit_event public.audit_action;
begin
  if tg_op = 'DELETE' then
    entity_key := old.id;
    audit_payload := jsonb_build_object('before', to_jsonb(old));
    audit_event := 'delete'::public.audit_action;
  elsif tg_op = 'UPDATE' then
    entity_key := new.id;
    audit_payload := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    audit_event := 'update'::public.audit_action;
  else
    entity_key := new.id;
    audit_payload := jsonb_build_object('after', to_jsonb(new));
    audit_event := 'insert'::public.audit_action;
  end if;

  insert into public.audit_log (
    entity_table,
    entity_id,
    action,
    payload,
    performed_by
  )
  values (
    tg_table_name,
    entity_key,
    audit_event,
    audit_payload,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_staff_profiles on public.staff_profiles;
create trigger audit_staff_profiles
after insert or update or delete on public.staff_profiles
for each row execute function public.capture_audit_event();

drop trigger if exists audit_import_batches on public.import_batches;
create trigger audit_import_batches
after insert or update or delete on public.import_batches
for each row execute function public.capture_audit_event();

drop trigger if exists audit_students on public.students;
create trigger audit_students
after insert or update or delete on public.students
for each row execute function public.capture_audit_event();

drop trigger if exists audit_fee_structures on public.fee_structures;
create trigger audit_fee_structures
after insert or update or delete on public.fee_structures
for each row execute function public.capture_audit_event();

drop trigger if exists audit_fee_ledgers on public.fee_ledgers;
create trigger audit_fee_ledgers
after insert or update or delete on public.fee_ledgers
for each row execute function public.capture_audit_event();

drop trigger if exists audit_fee_collections on public.fee_collections;
create trigger audit_fee_collections
after insert or update or delete on public.fee_collections
for each row execute function public.capture_audit_event();

drop policy if exists "authenticated can read staff profiles" on public.staff_profiles;
create policy "authenticated can read staff profiles"
on public.staff_profiles for select
to authenticated
using (true);

drop policy if exists "authenticated can insert staff profiles" on public.staff_profiles;
create policy "authenticated can insert staff profiles"
on public.staff_profiles for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update staff profiles" on public.staff_profiles;
create policy "authenticated can update staff profiles"
on public.staff_profiles for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read import batches" on public.import_batches;
create policy "authenticated can read import batches"
on public.import_batches for select
to authenticated
using (true);

drop policy if exists "authenticated can insert import batches" on public.import_batches;
create policy "authenticated can insert import batches"
on public.import_batches for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update import batches" on public.import_batches;
create policy "authenticated can update import batches"
on public.import_batches for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students"
on public.students for select
to authenticated
using (true);

drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students"
on public.students for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students"
on public.students for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read fee structures" on public.fee_structures;
create policy "authenticated can read fee structures"
on public.fee_structures for select
to authenticated
using (true);

drop policy if exists "authenticated can insert fee structures" on public.fee_structures;
create policy "authenticated can insert fee structures"
on public.fee_structures for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update fee structures" on public.fee_structures;
create policy "authenticated can update fee structures"
on public.fee_structures for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read fee ledgers" on public.fee_ledgers;
create policy "authenticated can read fee ledgers"
on public.fee_ledgers for select
to authenticated
using (true);

drop policy if exists "authenticated can insert fee ledgers" on public.fee_ledgers;
create policy "authenticated can insert fee ledgers"
on public.fee_ledgers for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update fee ledgers" on public.fee_ledgers;
create policy "authenticated can update fee ledgers"
on public.fee_ledgers for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read fee collections" on public.fee_collections;
create policy "authenticated can read fee collections"
on public.fee_collections for select
to authenticated
using (true);

drop policy if exists "authenticated can insert fee collections" on public.fee_collections;
create policy "authenticated can insert fee collections"
on public.fee_collections for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update fee collections" on public.fee_collections;
create policy "authenticated can update fee collections"
on public.fee_collections for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read audit log" on public.audit_log;
create policy "authenticated can read audit log"
on public.audit_log for select
to authenticated
using (true);

create or replace view public.v_outstanding_summary as
select
  students.session_label,
  students.class_name,
  coalesce(students.section, '') as section,
  count(distinct students.id) as student_count,
  count(fee_ledgers.id) filter (where fee_ledgers.status <> 'paid') as open_installments,
  coalesce(
    sum(
      greatest(
        fee_ledgers.scheduled_amount
        + fee_ledgers.late_fee_flat
        - fee_ledgers.concession_amount
        - fee_ledgers.received_amount,
        0
      )
    ),
    0
  ) as outstanding_amount
from public.students
join public.fee_ledgers on fee_ledgers.student_id = students.id
group by students.session_label, students.class_name, coalesce(students.section, '');

-- No delete policies are created for core operational tables.
-- Prefer explicit correction flows and audit-safe updates over destructive deletes.
