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
    create type public.staff_role as enum ('admin', 'accountant', 'read_only_staff');
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
      and typname = 'collection_close_status'
  ) then
    create type public.collection_close_status as enum ('draft', 'pending_approval', 'closed', 'reopened');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'cash_deposit_status'
  ) then
    create type public.cash_deposit_status as enum ('pending', 'deposited', 'carried_forward', 'not_applicable');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'reconciliation_status'
  ) then
    create type public.reconciliation_status as enum ('pending', 'in_review', 'cleared', 'issue_found');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'refund_request_status'
  ) then
    create type public.refund_request_status as enum ('pending_approval', 'approved', 'processed', 'rejected');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'correction_review_status'
  ) then
    create type public.correction_review_status as enum ('reviewed', 'flagged', 'needs_followup');
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
set search_path = private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.set_actor_columns()
returns trigger
language plpgsql
set search_path = private
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
set search_path = private
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
set search_path = private
as $$
begin
  raise exception '% is append-only and cannot be updated or deleted.', tg_table_name;
end;
$$;

create or replace function private.normalize_staff_role(p_role text)
returns public.staff_role
language sql
immutable
set search_path = public, private
as $$
  select case trim(coalesce(p_role, ''))
    when 'admin' then 'admin'::public.staff_role
    when 'accountant' then 'accountant'::public.staff_role
    when 'read_only_staff' then 'read_only_staff'::public.staff_role
    else 'read_only_staff'::public.staff_role
  end;
$$;

create or replace function private.sync_staff_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  resolved_full_name text;
  resolved_is_active boolean;
begin
  resolved_full_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'School Staff'
  );

  resolved_is_active := case
    when jsonb_typeof(new.raw_app_meta_data -> 'is_active') = 'boolean' then
      (new.raw_app_meta_data->>'is_active')::boolean
    else
      new.deleted_at is null
  end;

  insert into public.users (
    id,
    full_name,
    role,
    phone,
    is_active,
    last_login_at
  )
  values (
    new.id,
    resolved_full_name,
    private.normalize_staff_role(new.raw_app_meta_data->>'staff_role'),
    nullif(trim(coalesce(new.phone, '')), ''),
    resolved_is_active,
    new.last_sign_in_at
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone,
    is_active = excluded.is_active,
    last_login_at = excluded.last_login_at,
    updated_at = now();

  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'read_only_staff',
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
  notes text,
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
  received_by text,
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

create table if not exists public.collection_closures (
  id uuid primary key default gen_random_uuid(),
  payment_date date not null unique,
  status public.collection_close_status not null default 'draft',
  cash_deposit_status public.cash_deposit_status not null default 'pending',
  reconciliation_status public.reconciliation_status not null default 'pending',
  bank_deposit_reference text,
  close_note text,
  summary_snapshot jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(summary_snapshot) = 'object')
);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  refund_date date not null default current_date,
  receipt_id uuid not null references public.receipts(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  requested_amount integer not null check (requested_amount > 0),
  refund_method public.payment_mode not null,
  refund_reference text,
  reason text not null,
  notes text,
  status public.refund_request_status not null default 'pending_approval',
  approval_note text,
  processing_note text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_adjustment_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_adjustment_id uuid not null references public.payment_adjustments(id) on delete restrict,
  review_status public.correction_review_status not null,
  review_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_adjustment_reviews_unique unique (payment_adjustment_id)
);

create unique index if not exists idx_classes_unique_per_session
on public.classes (session_label, class_name, coalesce(section, ''), coalesce(stream_name, ''));

create index if not exists idx_classes_session_sort
on public.classes (session_label, sort_order, class_name);

create index if not exists idx_transport_routes_active
on public.transport_routes (is_active, route_name);

create index if not exists idx_users_created_by
on public.users (created_by);

create index if not exists idx_users_updated_by
on public.users (updated_by);

create index if not exists idx_classes_created_by
on public.classes (created_by);

create index if not exists idx_classes_updated_by
on public.classes (updated_by);

create index if not exists idx_transport_routes_created_by
on public.transport_routes (created_by);

create index if not exists idx_transport_routes_updated_by
on public.transport_routes (updated_by);

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

create index if not exists idx_fee_settings_created_by
on public.fee_settings (created_by);

create index if not exists idx_fee_settings_updated_by
on public.fee_settings (updated_by);

create unique index if not exists idx_student_fee_overrides_active_per_student
on public.student_fee_overrides (student_id)
where is_active;

create index if not exists idx_student_fee_overrides_fee_setting
on public.student_fee_overrides (fee_setting_id);

create index if not exists idx_student_fee_overrides_created_by
on public.student_fee_overrides (created_by);

create index if not exists idx_student_fee_overrides_updated_by
on public.student_fee_overrides (updated_by);

create index if not exists idx_installments_student_due_date
on public.installments (student_id, due_date);

create index if not exists idx_installments_class_due_date
on public.installments (class_id, due_date);

create index if not exists idx_installments_status_due_date
on public.installments (status, due_date);

create index if not exists idx_installments_fee_setting
on public.installments (fee_setting_id);

create index if not exists idx_installments_student_fee_override
on public.installments (student_fee_override_id)
where student_fee_override_id is not null;

create index if not exists idx_installments_created_by
on public.installments (created_by);

create index if not exists idx_installments_updated_by
on public.installments (updated_by);

create index if not exists idx_receipts_student_payment_date
on public.receipts (student_id, payment_date desc);

create index if not exists idx_receipts_payment_date
on public.receipts (payment_date desc);

create index if not exists idx_receipts_created_by
on public.receipts (created_by);

create index if not exists idx_payments_installment
on public.payments (installment_id, created_at desc);

create index if not exists idx_payments_student_created_at
on public.payments (student_id, created_at desc);

create index if not exists idx_payments_receipt_student
on public.payments (receipt_id, student_id);

create index if not exists idx_payments_installment_student
on public.payments (installment_id, student_id);

create index if not exists idx_payments_created_by
on public.payments (created_by);

create index if not exists idx_payment_adjustments_payment
on public.payment_adjustments (payment_id, created_at desc);

create index if not exists idx_payment_adjustments_student
on public.payment_adjustments (student_id, created_at desc);

create index if not exists idx_payment_adjustments_payment_student_installment
on public.payment_adjustments (payment_id, student_id, installment_id);

create index if not exists idx_payment_adjustments_created_by
on public.payment_adjustments (created_by);

create index if not exists idx_collection_closures_payment_date
on public.collection_closures (payment_date desc);

create index if not exists idx_collection_closures_status
on public.collection_closures (status, payment_date desc);

create index if not exists idx_collection_closures_created_by
on public.collection_closures (created_by);

create index if not exists idx_refund_requests_refund_date
on public.refund_requests (refund_date desc);

create index if not exists idx_refund_requests_status
on public.refund_requests (status, refund_date desc);

create index if not exists idx_refund_requests_receipt
on public.refund_requests (receipt_id, refund_date desc);

create index if not exists idx_refund_requests_created_by
on public.refund_requests (created_by);

create index if not exists idx_payment_adjustment_reviews_adjustment
on public.payment_adjustment_reviews (payment_adjustment_id);

create index if not exists idx_payment_adjustment_reviews_status
on public.payment_adjustment_reviews (review_status, created_at desc);

create index if not exists idx_audit_logs_record
on public.audit_logs (table_name, record_id, created_at desc);

create index if not exists idx_audit_logs_changed_by
on public.audit_logs (changed_by, created_at desc);

create index if not exists idx_students_created_by
on public.students (created_by);

create index if not exists idx_students_updated_by
on public.students (updated_by);

drop trigger if exists set_updated_at_on_users on public.users;
create trigger set_updated_at_on_users
before update on public.users
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_users on public.users;
create trigger set_actor_columns_on_users
before insert or update on public.users
for each row execute function private.set_actor_columns();

drop trigger if exists sync_staff_profile_from_auth_users on auth.users;
create trigger sync_staff_profile_from_auth_users
after insert or update of email, phone, raw_user_meta_data, raw_app_meta_data, last_sign_in_at, deleted_at
on auth.users
for each row execute function private.sync_staff_profile_from_auth_user();

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

drop trigger if exists set_updated_at_on_collection_closures on public.collection_closures;
create trigger set_updated_at_on_collection_closures
before update on public.collection_closures
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_collection_closures on public.collection_closures;
create trigger set_actor_columns_on_collection_closures
before insert or update on public.collection_closures
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_refund_requests on public.refund_requests;
create trigger set_updated_at_on_refund_requests
before update on public.refund_requests
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_refund_requests on public.refund_requests;
create trigger set_actor_columns_on_refund_requests
before insert or update on public.refund_requests
for each row execute function private.set_actor_columns();

drop trigger if exists set_created_by_on_payment_adjustment_reviews on public.payment_adjustment_reviews;
create trigger set_created_by_on_payment_adjustment_reviews
before insert on public.payment_adjustment_reviews
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

drop trigger if exists payment_adjustment_reviews_are_append_only on public.payment_adjustment_reviews;
create trigger payment_adjustment_reviews_are_append_only
before update or delete on public.payment_adjustment_reviews
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

drop trigger if exists audit_collection_closures on public.collection_closures;
create trigger audit_collection_closures
after insert or update or delete on public.collection_closures
for each row execute function private.capture_audit_event();

drop trigger if exists audit_refund_requests on public.refund_requests;
create trigger audit_refund_requests
after insert or update or delete on public.refund_requests
for each row execute function private.capture_audit_event();

drop trigger if exists audit_payment_adjustment_reviews on public.payment_adjustment_reviews;
create trigger audit_payment_adjustment_reviews
after insert or update or delete on public.payment_adjustment_reviews
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
alter table public.collection_closures enable row level security;
alter table public.refund_requests enable row level security;
alter table public.payment_adjustment_reviews enable row level security;
alter table public.audit_logs enable row level security;

create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public, auth, private
as $$
  select coalesce(
    (
      select u.role
      from public.users as u
      where u.id = auth.uid()
        and u.is_active = true
      limit 1
    ),
    'read_only_staff'::public.staff_role
  );
$$;

revoke all on function private.current_staff_role() from public;
revoke all on function private.current_staff_role() from anon;
grant execute on function private.current_staff_role() to authenticated;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, private
as $$
  select auth.uid() is not null
    and case private.current_staff_role()
      when 'admin'::public.staff_role then true
      when 'accountant'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'payments:view',
          'payments:write',
          'finance:view',
          'finance:write',
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view'
        ]
      )
      when 'read_only_staff'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'imports:view',
          'reports:view'
        ]
      )
      else false
    end;
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.has_any_permission(p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from unnest(coalesce(p_permissions, array[]::text[])) as permission_name
    where public.has_permission(permission_name)
  );
$$;

revoke all on function public.has_any_permission(text[]) from public;
revoke all on function public.has_any_permission(text[]) from anon;
grant execute on function public.has_any_permission(text[]) to authenticated;

drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users"
on public.users for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'ledger:view', 'receipts:view', 'staff:manage', 'finance:view']));

drop policy if exists "authenticated can insert users" on public.users;
create policy "authenticated can insert users"
on public.users for insert
to authenticated
with check (public.has_permission('staff:manage'));

drop policy if exists "authenticated can update users" on public.users;
create policy "authenticated can update users"
on public.users for update
to authenticated
using (public.has_permission('staff:manage'))
with check (public.has_permission('staff:manage'));

drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes"
on public.classes for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'students:view', 'fees:view', 'payments:view', 'defaulters:view', 'finance:view']));

drop policy if exists "authenticated can insert classes" on public.classes;
create policy "authenticated can insert classes"
on public.classes for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update classes" on public.classes;
create policy "authenticated can update classes"
on public.classes for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read transport routes" on public.transport_routes;
create policy "authenticated can read transport routes"
on public.transport_routes for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'defaulters:view']));

drop policy if exists "authenticated can insert transport routes" on public.transport_routes;
create policy "authenticated can insert transport routes"
on public.transport_routes for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update transport routes" on public.transport_routes;
create policy "authenticated can update transport routes"
on public.transport_routes for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students"
on public.students for select
to authenticated
using (public.has_any_permission(array['students:view', 'payments:view', 'ledger:view', 'receipts:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students"
on public.students for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students"
on public.students for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can read fee settings" on public.fee_settings;
create policy "authenticated can read fee settings"
on public.fee_settings for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert fee settings" on public.fee_settings;
create policy "authenticated can insert fee settings"
on public.fee_settings for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update fee settings" on public.fee_settings;
create policy "authenticated can update fee settings"
on public.fee_settings for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read student fee overrides" on public.student_fee_overrides;
create policy "authenticated can read student fee overrides"
on public.student_fee_overrides for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert student fee overrides" on public.student_fee_overrides;
create policy "authenticated can insert student fee overrides"
on public.student_fee_overrides for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update student fee overrides" on public.student_fee_overrides;
create policy "authenticated can update student fee overrides"
on public.student_fee_overrides for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments"
on public.installments for select
to authenticated
using (public.has_any_permission(array['fees:view', 'payments:view', 'ledger:view', 'defaulters:view', 'finance:view']));

drop policy if exists "authenticated can insert installments" on public.installments;
create policy "authenticated can insert installments"
on public.installments for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update installments" on public.installments;
create policy "authenticated can update installments"
on public.installments for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts"
on public.receipts for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can insert receipts" on public.receipts;
create policy "authenticated can insert receipts"
on public.receipts for insert
to authenticated
with check (public.has_permission('payments:write'));

drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments"
on public.payments for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can insert payments" on public.payments;
create policy "authenticated can insert payments"
on public.payments for insert
to authenticated
with check (public.has_permission('payments:write'));

drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments"
on public.payment_adjustments for select
to authenticated
using (public.has_any_permission(array['ledger:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can insert payment adjustments" on public.payment_adjustments;
create policy "authenticated can insert payment adjustments"
on public.payment_adjustments for insert
to authenticated
with check (public.has_permission('payments:adjust'));

drop policy if exists "authenticated can read collection closures" on public.collection_closures;
create policy "authenticated can read collection closures"
on public.collection_closures for select
to authenticated
using (public.has_permission('finance:view'));

drop policy if exists "authenticated can insert collection closures" on public.collection_closures;
create policy "authenticated can insert collection closures"
on public.collection_closures for insert
to authenticated
with check (public.has_permission('finance:write'));

drop policy if exists "authenticated can update collection closures" on public.collection_closures;
create policy "authenticated can update collection closures"
on public.collection_closures for update
to authenticated
using (public.has_any_permission(array['finance:write', 'finance:approve']))
with check (public.has_any_permission(array['finance:write', 'finance:approve']));

drop policy if exists "authenticated can read refund requests" on public.refund_requests;
create policy "authenticated can read refund requests"
on public.refund_requests for select
to authenticated
using (public.has_permission('finance:view'));

drop policy if exists "authenticated can insert refund requests" on public.refund_requests;
create policy "authenticated can insert refund requests"
on public.refund_requests for insert
to authenticated
with check (public.has_permission('finance:write'));

drop policy if exists "authenticated can update refund requests" on public.refund_requests;
create policy "authenticated can update refund requests"
on public.refund_requests for update
to authenticated
using (public.has_any_permission(array['finance:write', 'finance:approve']))
with check (public.has_any_permission(array['finance:write', 'finance:approve']));

drop policy if exists "authenticated can read payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can read payment adjustment reviews"
on public.payment_adjustment_reviews for select
to authenticated
using (public.has_permission('finance:view'));

drop policy if exists "authenticated can insert payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can insert payment adjustment reviews"
on public.payment_adjustment_reviews for insert
to authenticated
with check (public.has_permission('finance:approve'));

drop policy if exists "authenticated can read audit logs" on public.audit_logs;
create policy "authenticated can read audit logs"
on public.audit_logs for select
to authenticated
using (public.has_permission('staff:manage'));

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
  end as balance_status,
  students.transport_route_id,
  routes.route_name as transport_route_name,
  routes.route_code as transport_route_code
from public.installments
join public.students on students.id = installments.student_id
join public.classes on classes.id = installments.class_id
left join public.transport_routes as routes on routes.id = students.transport_route_id
left join payment_totals on payment_totals.installment_id = installments.id
left join adjustment_totals on adjustment_totals.installment_id = installments.id
where installments.status <> 'cancelled';

create or replace view public.v_transport_route_outstanding
with (security_invoker = true)
as
select
  coalesce(transport_route_id::text, 'unassigned') as route_bucket,
  transport_route_id,
  coalesce(transport_route_name, 'No route') as route_name,
  transport_route_code,
  count(distinct student_id) as students_with_dues,
  count(*) as open_installments,
  count(*) filter (where balance_status = 'overdue') as overdue_installments,
  coalesce(sum(outstanding_amount), 0) as outstanding_amount
from public.v_installment_balances
where outstanding_amount > 0
  and balance_status in ('partial', 'overdue', 'pending')
group by
  coalesce(transport_route_id::text, 'unassigned'),
  transport_route_id,
  coalesce(transport_route_name, 'No route'),
  transport_route_code;

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

insert into public.users (
  id,
  full_name,
  role,
  phone,
  is_active,
  last_login_at
)
select
  au.id,
  coalesce(
    nullif(trim(coalesce(au.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(au.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(split_part(coalesce(au.email, ''), '@', 1)), ''),
    'School Staff'
  ) as full_name,
  private.normalize_staff_role(au.raw_app_meta_data->>'staff_role') as role,
  nullif(trim(coalesce(au.phone, '')), '') as phone,
  case
    when jsonb_typeof(au.raw_app_meta_data -> 'is_active') = 'boolean' then
      (au.raw_app_meta_data->>'is_active')::boolean
    else
      au.deleted_at is null
  end as is_active,
  au.last_sign_in_at as last_login_at
from auth.users as au
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  phone = excluded.phone,
  is_active = excluded.is_active,
  last_login_at = excluded.last_login_at,
  updated_at = now();

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
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert school fee defaults" on public.school_fee_defaults;
create policy "authenticated can insert school fee defaults"
on public.school_fee_defaults for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update school fee defaults" on public.school_fee_defaults;
create policy "authenticated can update school fee defaults"
on public.school_fee_defaults for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

create or replace function public.post_student_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP'
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
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
  total_outstanding integer;
  normalized_prefix text;
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

  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Selected student was not found.';
  end if;

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  select coalesce(sum(outstanding_amount), 0)
  into total_outstanding
  from public.v_installment_balances
  where student_id = p_student_id
    and outstanding_amount > 0;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts
  where receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

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
        received_by
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), '')
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  for balance_row in
    select installment_id, outstanding_amount
    from public.v_installment_balances
    where student_id = p_student_id
      and outstanding_amount > 0
    order by due_date asc, installment_no asc
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
  uuid,
  date,
  public.payment_mode,
  integer,
  text,
  text,
  text,
  text
) to authenticated;

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  import_mode text not null default 'add' check (import_mode in ('add', 'update')),
  target_session_label text,
  filename text not null,
  source_format text not null check (source_format in ('csv', 'xlsx')),
  worksheet_name text,
  file_size_bytes integer not null default 0 check (file_size_bytes >= 0),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validated', 'importing', 'completed', 'failed')),
  detected_headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  validation_completed_at timestamptz,
  import_completed_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_detected_headers_array
    check (jsonb_typeof(detected_headers) = 'array'),
  constraint import_batches_column_mapping_object
    check (jsonb_typeof(column_mapping) = 'object'),
  constraint import_batches_summary_object
    check (jsonb_typeof(summary) = 'object')
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_index integer not null check (row_index > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'invalid', 'duplicate', 'imported', 'skipped')),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'hold', 'skipped')),
  review_note text,
  reviewed_at timestamptz,
  anomaly_categories jsonb not null default '[]'::jsonb,
  import_operation text not null default 'create'
    check (import_operation in ('create', 'update')),
  target_student_id uuid references public.students(id) on delete set null,
  changed_fields jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  duplicate_student_id uuid references public.students(id) on delete set null,
  imported_student_id uuid references public.students(id) on delete set null,
  imported_override_id uuid references public.student_fee_overrides(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_batch_row_unique unique (batch_id, row_index),
  constraint import_rows_raw_payload_object
    check (jsonb_typeof(raw_payload) = 'object'),
  constraint import_rows_normalized_payload_object
    check (normalized_payload is null or jsonb_typeof(normalized_payload) = 'object'),
  constraint import_rows_anomaly_categories_array
    check (jsonb_typeof(anomaly_categories) = 'array'),
  constraint import_rows_changed_fields_array
    check (jsonb_typeof(changed_fields) = 'array'),
  constraint import_rows_errors_array
    check (jsonb_typeof(errors) = 'array'),
  constraint import_rows_warnings_array
    check (jsonb_typeof(warnings) = 'array')
);

create index if not exists idx_import_batches_created_at
on public.import_batches (created_at desc);

create index if not exists idx_import_batches_status_created_at
on public.import_batches (status, created_at desc);

create index if not exists idx_import_batches_created_by
on public.import_batches (created_by);

create index if not exists idx_import_batches_target_session_label
on public.import_batches (target_session_label)
where target_session_label is not null;

create index if not exists idx_import_rows_batch_row_index
on public.import_rows (batch_id, row_index);

create index if not exists idx_import_rows_batch_status
on public.import_rows (batch_id, status);

create index if not exists idx_import_rows_duplicate_student
on public.import_rows (duplicate_student_id)
where duplicate_student_id is not null;

create index if not exists idx_import_rows_target_student
on public.import_rows (target_student_id)
where target_student_id is not null;

create index if not exists idx_import_rows_imported_student
on public.import_rows (imported_student_id)
where imported_student_id is not null;

create index if not exists idx_import_rows_operation
on public.import_rows (batch_id, import_operation);

create index if not exists idx_import_rows_review_status
on public.import_rows (batch_id, review_status)
where review_status <> 'pending';

drop trigger if exists set_updated_at_on_import_batches on public.import_batches;
create trigger set_updated_at_on_import_batches
before update on public.import_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_batches on public.import_batches;
create trigger set_actor_columns_on_import_batches
before insert or update on public.import_batches
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_import_rows on public.import_rows;
create trigger set_updated_at_on_import_rows
before update on public.import_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_rows on public.import_rows;
create trigger set_actor_columns_on_import_rows
before insert or update on public.import_rows
for each row execute function private.set_actor_columns();

drop trigger if exists audit_import_batches on public.import_batches;
create trigger audit_import_batches
after insert or update or delete on public.import_batches
for each row execute function private.capture_audit_event();

drop trigger if exists audit_import_rows on public.import_rows;
create trigger audit_import_rows
after insert or update or delete on public.import_rows
for each row execute function private.capture_audit_event();

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "staff can read import batches" on public.import_batches;
create policy "staff can read import batches"
on public.import_batches for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

drop policy if exists "staff can insert import batches" on public.import_batches;
create policy "staff can insert import batches"
on public.import_batches for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "staff can update import batches" on public.import_batches;
create policy "staff can update import batches"
on public.import_batches for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "staff can read import rows" on public.import_rows;
create policy "staff can read import rows"
on public.import_rows for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

drop policy if exists "staff can insert import rows" on public.import_rows;
create policy "staff can insert import rows"
on public.import_rows for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "staff can update import rows" on public.import_rows;
create policy "staff can update import rows"
on public.import_rows for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

create or replace function public.import_student_batch_row(
  p_batch_id uuid,
  p_row_index integer,
  p_full_name text,
  p_class_id uuid,
  p_admission_no text,
  p_date_of_birth date,
  p_father_name text,
  p_mother_name text,
  p_primary_phone text,
  p_secondary_phone text,
  p_address text,
  p_transport_route_id uuid,
  p_status public.student_status,
  p_notes text,
  p_custom_tuition_fee_amount integer,
  p_custom_transport_fee_amount integer,
  p_custom_books_fee_amount integer,
  p_custom_admission_activity_misc_fee_amount integer,
  p_custom_other_fee_heads jsonb,
  p_custom_late_fee_flat_amount integer,
  p_discount_amount integer,
  p_student_type_override text,
  p_transport_applies_override boolean
)
returns table (
  student_id uuid,
  student_fee_override_id uuid
)
language plpgsql
set search_path = public, private
as $$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$$;

grant execute on function public.import_student_batch_row(
  uuid,
  integer,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  uuid,
  public.student_status,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  integer,
  text,
  boolean
) to authenticated;

-- No delete policies are created for operational finance tables.
-- Payments, receipts, and payment adjustments are intentionally append-only.

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

create table if not exists public.config_change_batches (
  id uuid primary key default gen_random_uuid(),
  change_scope text not null
    check (
      change_scope in (
        'global_policy',
        'school_defaults',
        'class_defaults',
        'transport_defaults',
        'student_override',
        'workbook_setup'
      )
    ),
  target_ref text,
  target_label text not null,
  status text not null default 'preview_ready'
    check (status in ('preview_ready', 'applied', 'stale', 'failed', 'cancelled')),
  before_payload jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  changed_fields jsonb not null default '[]'::jsonb,
  preview_summary jsonb not null default '{}'::jsonb,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(before_payload) = 'object'),
  check (jsonb_typeof(proposed_payload) = 'object'),
  check (jsonb_typeof(changed_fields) = 'array'),
  check (jsonb_typeof(preview_summary) = 'object'),
  check (apply_summary is null or jsonb_typeof(apply_summary) = 'object')
);

create table if not exists public.config_change_blocked_installments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.config_change_batches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  installment_label text not null,
  due_date date not null,
  amount_due integer not null default 0 check (amount_due >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),
  adjustment_amount integer not null default 0,
  outstanding_amount integer not null default 0 check (outstanding_amount >= 0),
  reason_code text not null
    check (reason_code in ('fully_paid', 'partially_paid', 'adjustment_posted')),
  reason_label text not null,
  action_needed text not null check (action_needed in ('update', 'cancel')),
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed')),
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint config_change_blocked_unique unique (batch_id, installment_id, action_needed)
);

create index if not exists idx_config_change_batches_status_created
on public.config_change_batches (status, created_at desc);

create index if not exists idx_config_change_batches_scope_created
on public.config_change_batches (change_scope, created_at desc);

create index if not exists idx_config_change_blocked_batch
on public.config_change_blocked_installments (batch_id, created_at);

create index if not exists idx_config_change_blocked_student
on public.config_change_blocked_installments (student_id, due_date);

drop trigger if exists set_updated_at_on_config_change_batches on public.config_change_batches;
create trigger set_updated_at_on_config_change_batches
before update on public.config_change_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_config_change_batches on public.config_change_batches;
create trigger set_actor_columns_on_config_change_batches
before insert or update on public.config_change_batches
for each row execute function private.set_actor_columns();

drop trigger if exists audit_config_change_batches on public.config_change_batches;
create trigger audit_config_change_batches
after insert or update or delete on public.config_change_batches
for each row execute function private.capture_audit_event();

drop trigger if exists set_updated_at_on_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger set_updated_at_on_config_change_blocked_installments
before update on public.config_change_blocked_installments
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger set_actor_columns_on_config_change_blocked_installments
before insert or update on public.config_change_blocked_installments
for each row execute function private.set_actor_columns();

drop trigger if exists audit_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger audit_config_change_blocked_installments
after insert or update or delete on public.config_change_blocked_installments
for each row execute function private.capture_audit_event();

alter table public.config_change_batches enable row level security;
alter table public.config_change_blocked_installments enable row level security;

drop policy if exists "authenticated can read config change batches" on public.config_change_batches;
create policy "authenticated can read config change batches"
on public.config_change_batches for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert config change batches" on public.config_change_batches;
create policy "authenticated can insert config change batches"
on public.config_change_batches for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update config change batches" on public.config_change_batches;
create policy "authenticated can update config change batches"
on public.config_change_batches for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can read config change blocked installments"
on public.config_change_blocked_installments for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can insert config change blocked installments"
on public.config_change_blocked_installments for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can update config change blocked installments"
on public.config_change_blocked_installments for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

create table if not exists public.ledger_regeneration_batches (
  id uuid primary key default gen_random_uuid(),
  policy_revision_id uuid references public.fee_policy_configs(id) on delete set null,
  policy_revision_label text not null,
  reason text not null,
  status text not null default 'preview_ready'
    check (status in ('preview_ready', 'applied', 'stale', 'failed', 'cancelled')),
  source_snapshot jsonb not null default '{}'::jsonb,
  preview_summary jsonb not null default '{}'::jsonb,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trim(reason) <> ''),
  check (trim(policy_revision_label) <> ''),
  check (jsonb_typeof(source_snapshot) = 'object'),
  check (jsonb_typeof(preview_summary) = 'object'),
  check (apply_summary is null or jsonb_typeof(apply_summary) = 'object')
);

create table if not exists public.ledger_regeneration_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ledger_regeneration_batches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  fee_setting_id uuid not null references public.fee_settings(id) on delete restrict,
  student_fee_override_id uuid references public.student_fee_overrides(id) on delete set null,
  student_label text not null,
  class_label text not null,
  installment_no smallint not null check (installment_no > 0),
  installment_label text not null,
  due_date date not null,
  base_amount integer not null default 0 check (base_amount >= 0),
  transport_amount integer not null default 0 check (transport_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  late_fee_flat_amount integer not null default 0 check (late_fee_flat_amount >= 0),
  amount_due integer not null default 0 check (amount_due >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),
  adjustment_amount integer not null default 0,
  outstanding_amount integer not null default 0 check (outstanding_amount >= 0),
  balance_status text not null
    check (balance_status in ('paid', 'partial', 'unpaid', 'future', 'waived', 'cancelled')),
  action_needed text not null
    check (action_needed in ('insert', 'update', 'cancel', 'skip', 'review')),
  reason_code text not null
    check (
      reason_code in (
        'missing_installment',
        'already_in_sync',
        'fully_paid',
        'partially_paid',
        'adjustment_posted',
        'existing_waived',
        'existing_cancelled',
        'extra_installment',
        'missing_settings'
      )
    ),
  reason_label text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed')),
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ledger_regeneration_batches_status_created
on public.ledger_regeneration_batches (status, created_at desc);

create index if not exists idx_ledger_regeneration_batches_policy_created
on public.ledger_regeneration_batches (policy_revision_id, created_at desc);

create index if not exists idx_ledger_regeneration_rows_batch_created
on public.ledger_regeneration_rows (batch_id, created_at);

create index if not exists idx_ledger_regeneration_rows_batch_action
on public.ledger_regeneration_rows (batch_id, action_needed);

create index if not exists idx_ledger_regeneration_rows_student_due
on public.ledger_regeneration_rows (student_id, due_date);

drop trigger if exists set_updated_at_on_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger set_updated_at_on_ledger_regeneration_batches
before update on public.ledger_regeneration_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger set_actor_columns_on_ledger_regeneration_batches
before insert or update on public.ledger_regeneration_batches
for each row execute function private.set_actor_columns();

drop trigger if exists audit_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger audit_ledger_regeneration_batches
after insert or update or delete on public.ledger_regeneration_batches
for each row execute function private.capture_audit_event();

drop trigger if exists set_updated_at_on_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger set_updated_at_on_ledger_regeneration_rows
before update on public.ledger_regeneration_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger set_actor_columns_on_ledger_regeneration_rows
before insert or update on public.ledger_regeneration_rows
for each row execute function private.set_actor_columns();

drop trigger if exists audit_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger audit_ledger_regeneration_rows
after insert or update or delete on public.ledger_regeneration_rows
for each row execute function private.capture_audit_event();

alter table public.ledger_regeneration_batches enable row level security;
alter table public.ledger_regeneration_rows enable row level security;

drop policy if exists "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can read ledger regeneration batches"
on public.ledger_regeneration_batches for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can insert ledger regeneration batches"
on public.ledger_regeneration_batches for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can update ledger regeneration batches"
on public.ledger_regeneration_batches for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can read ledger regeneration rows"
on public.ledger_regeneration_rows for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can insert ledger regeneration rows"
on public.ledger_regeneration_rows for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can update ledger regeneration rows"
on public.ledger_regeneration_rows for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

create table if not exists public.setup_progress (
  id uuid primary key default gen_random_uuid(),
  setup_completed_at timestamptz,
  completion_notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_active = true)
);

create unique index if not exists idx_setup_progress_active_singleton
on public.setup_progress (is_active)
where is_active;

create index if not exists idx_setup_progress_created_by
on public.setup_progress (created_by);

create index if not exists idx_setup_progress_updated_by
on public.setup_progress (updated_by);

drop trigger if exists set_updated_at_on_setup_progress on public.setup_progress;
create trigger set_updated_at_on_setup_progress
before update on public.setup_progress
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_setup_progress on public.setup_progress;
create trigger set_actor_columns_on_setup_progress
before insert or update on public.setup_progress
for each row execute function private.set_actor_columns();

drop trigger if exists audit_setup_progress on public.setup_progress;
create trigger audit_setup_progress
after insert or update or delete on public.setup_progress
for each row execute function private.capture_audit_event();

alter table public.setup_progress enable row level security;

drop policy if exists "staff can read setup progress" on public.setup_progress;
create policy "staff can read setup progress"
on public.setup_progress for select
to authenticated
using (public.has_permission('dashboard:view'));

drop policy if exists "admins can insert setup progress" on public.setup_progress;
create policy "admins can insert setup progress"
on public.setup_progress for insert
to authenticated
with check (public.has_permission('settings:write'));

drop policy if exists "admins can update setup progress" on public.setup_progress;
create policy "admins can update setup progress"
on public.setup_progress for update
to authenticated
using (public.has_permission('settings:write'))
with check (public.has_permission('settings:write'));

-- Synced from migration: 20260423093000_workbook_v1_ay_2026_27.sql

alter table public.fee_policy_configs
  add column if not exists calculation_model text not null default 'standard'
    check (calculation_model in ('standard', 'workbook_v1')),
  add column if not exists new_student_academic_fee_amount integer not null default 1100
    check (new_student_academic_fee_amount >= 0),
  add column if not exists old_student_academic_fee_amount integer not null default 500
    check (old_student_academic_fee_amount >= 0);

alter table public.transport_routes
  add column if not exists annual_fee_amount integer
    check (annual_fee_amount >= 0);

alter table public.student_fee_overrides
  add column if not exists other_adjustment_head text,
  add column if not exists other_adjustment_amount integer,
  add column if not exists late_fee_waiver_amount integer not null default 0
    check (late_fee_waiver_amount >= 0);

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
    or coalesce(other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(other_adjustment_head, '')), '') is not null
    or late_fee_waiver_amount > 0
  );

create index if not exists idx_transport_routes_annual_fee_amount
on public.transport_routes (annual_fee_amount)
where annual_fee_amount is not null;

create index if not exists idx_receipts_reference_number
on public.receipts (reference_number)
where reference_number is not null;

create or replace function private.normalize_workbook_class_label(
  p_class_name text,
  p_stream_name text default null
)
returns text
language sql
immutable
set search_path = private
as $$
  select case regexp_replace(
    lower(coalesce(p_class_name, '') || coalesce(p_stream_name, '')),
    '[^a-z0-9]+',
    '',
    'g'
  )
    when 'nursery' then 'Nursery'
    when 'kg1' then 'JKG'
    when 'jkg' then 'JKG'
    when 'lkg' then 'JKG'
    when 'kg2' then 'SKG'
    when 'skg' then 'SKG'
    when 'ukg' then 'SKG'
    when 'class1' then 'Class 1'
    when '1' then 'Class 1'
    when '1st' then 'Class 1'
    when 'first' then 'Class 1'
    when 'class2' then 'Class 2'
    when '2' then 'Class 2'
    when '2nd' then 'Class 2'
    when 'second' then 'Class 2'
    when 'class3' then 'Class 3'
    when '3' then 'Class 3'
    when '3rd' then 'Class 3'
    when 'third' then 'Class 3'
    when 'class4' then 'Class 4'
    when '4' then 'Class 4'
    when '4th' then 'Class 4'
    when 'fourth' then 'Class 4'
    when 'class5' then 'Class 5'
    when '5' then 'Class 5'
    when '5th' then 'Class 5'
    when 'fifth' then 'Class 5'
    when 'class6' then 'Class 6'
    when '6' then 'Class 6'
    when '6th' then 'Class 6'
    when 'sixth' then 'Class 6'
    when 'class7' then 'Class 7'
    when '7' then 'Class 7'
    when '7th' then 'Class 7'
    when 'seventh' then 'Class 7'
    when 'class8' then 'Class 8'
    when '8' then 'Class 8'
    when '8th' then 'Class 8'
    when 'eighth' then 'Class 8'
    when 'class9' then 'Class 9'
    when '9' then 'Class 9'
    when '9th' then 'Class 9'
    when 'ninth' then 'Class 9'
    when 'class10' then 'Class 10'
    when '10' then 'Class 10'
    when '10th' then 'Class 10'
    when 'tenth' then 'Class 10'
    when '11arts' then '11 Arts'
    when '11tharts' then '11 Arts'
    when 'class11arts' then '11 Arts'
    when 'xiarts' then '11 Arts'
    when '11commerce' then '11 Commerce'
    when '11thcommerce' then '11 Commerce'
    when 'class11commerce' then '11 Commerce'
    when 'xicommerce' then '11 Commerce'
    when '11science' then '11 Science'
    when '11thscience' then '11 Science'
    when 'class11science' then '11 Science'
    when 'xiscience' then '11 Science'
    when '12arts' then '12 Arts'
    when '12tharts' then '12 Arts'
    when 'class12arts' then '12 Arts'
    when 'xiiarts' then '12 Arts'
    when '12commerce' then '12 Commerce'
    when '12thcommerce' then '12 Commerce'
    when 'class12commerce' then '12 Commerce'
    when 'xiicommerce' then '12 Commerce'
    when '12science' then '12 Science'
    when '12thscience' then '12 Science'
    when 'class12science' then '12 Science'
    when 'xiiscience' then '12 Science'
    else coalesce(nullif(trim(concat_ws(' ', p_class_name, p_stream_name)), ''), 'Unknown class')
  end;
$$;

update public.classes
set session_label = '2026-27'
where trim(session_label) = '2026-2027';

insert into public.academic_sessions (
  session_label,
  status,
  is_current,
  notes
)
values (
  '2026-27',
  'active',
  true,
  'Workbook parity session for AY 2026-27'
)
on conflict (session_label) do update
set
  status = 'active',
  is_current = true,
  notes = excluded.notes,
  updated_at = now();

update public.academic_sessions
set is_current = false,
    status = case when session_label = '2026-27' then 'active' else status end,
    updated_at = now()
where session_label <> '2026-27'
  and is_current = true;

with class_seed as (
  select *
  from (
    values
      ('Nursery', 1, 16000),
      ('JKG', 2, 17000),
      ('SKG', 3, 17000),
      ('Class 1', 4, 18000),
      ('Class 2', 5, 18500),
      ('Class 3', 6, 19000),
      ('Class 4', 7, 19500),
      ('Class 5', 8, 20000),
      ('Class 6', 9, 21000),
      ('Class 7', 10, 22000),
      ('Class 8', 11, 23000),
      ('Class 9', 12, 24000),
      ('Class 10', 13, 25000),
      ('11 Arts', 14, 30000),
      ('11 Commerce', 15, 30000),
      ('11 Science', 16, 35000),
      ('12 Arts', 17, 32000),
      ('12 Commerce', 18, 32000),
      ('12 Science', 19, 38000)
  ) as seed(class_label, sort_order, tuition_fee_amount)
),
existing_match as (
  select
    c.id,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
  from public.classes as c
  where c.session_label = '2026-27'
),
inserted_classes as (
  insert into public.classes (
    session_label,
    class_name,
    section,
    stream_name,
    sort_order,
    status,
    notes
  )
  select
    '2026-27',
    seed.class_label,
    null,
    null,
    seed.sort_order,
    'active'::public.class_status,
    'AY 2026-27 workbook class seed'
  from class_seed as seed
  where not exists (
    select 1
    from existing_match as match_row
    where match_row.class_label = seed.class_label
  )
  returning id, class_name
),
all_session_classes as (
  select
    c.id,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
  from public.classes as c
  where c.session_label = '2026-27'
)
insert into public.fee_settings (
  class_id,
  annual_base_amount,
  late_fee_flat_amount,
  installment_count,
  tuition_fee_amount,
  transport_fee_amount,
  books_fee_amount,
  admission_activity_misc_fee_amount,
  other_fee_heads,
  student_type_default,
  transport_applies_default,
  notes,
  is_active
)
select
  class_row.id,
  seed.tuition_fee_amount,
  1000,
  4,
  seed.tuition_fee_amount,
  0,
  0,
  0,
  '{}'::jsonb,
  'existing',
  false,
  'AY 2026-27 workbook tuition default',
  true
from class_seed as seed
join all_session_classes as class_row
  on class_row.class_label = seed.class_label
where not exists (
  select 1
  from public.fee_settings as fs
  where fs.class_id = class_row.id
    and fs.is_active = true
);

with class_seed as (
  select *
  from (
    values
      ('Nursery', 16000),
      ('JKG', 17000),
      ('SKG', 17000),
      ('Class 1', 18000),
      ('Class 2', 18500),
      ('Class 3', 19000),
      ('Class 4', 19500),
      ('Class 5', 20000),
      ('Class 6', 21000),
      ('Class 7', 22000),
      ('Class 8', 23000),
      ('Class 9', 24000),
      ('Class 10', 25000),
      ('11 Arts', 30000),
      ('11 Commerce', 30000),
      ('11 Science', 35000),
      ('12 Arts', 32000),
      ('12 Commerce', 32000),
      ('12 Science', 38000)
  ) as seed(class_label, tuition_fee_amount)
)
update public.fee_settings as fs
set
  annual_base_amount = seed.tuition_fee_amount,
  late_fee_flat_amount = 1000,
  installment_count = 4,
  tuition_fee_amount = seed.tuition_fee_amount,
  transport_fee_amount = 0,
  books_fee_amount = 0,
  admission_activity_misc_fee_amount = 0,
  other_fee_heads = '{}'::jsonb,
  student_type_default = 'existing',
  transport_applies_default = false,
  notes = 'AY 2026-27 workbook tuition default',
  is_active = true,
  updated_at = now()
from public.classes as c
join class_seed as seed
  on seed.class_label = private.normalize_workbook_class_label(c.class_name, c.stream_name)
where fs.class_id = c.id
  and c.session_label = '2026-27'
  and fs.is_active = true;

with route_seed as (
  select *
  from (
    values
      ('No Transport', 0),
      ('Amet Bus', 5500),
      ('Amet College Side (On Road)', 6000),
      ('Amet College Road (Colony Inside)', 6000),
      ('Amet Railway Station (On Road)', 7000),
      ('Amet Railway Station (Inside)', 7000),
      ('Amet City', 7000),
      ('Bhopji Ka Kheda', 11000),
      ('Ballo Ka Khera', 12000),
      ('Makarda', 14000),
      ('Masingpura', 14000),
      ('Jilola', 17000),
      ('Mund Koshiya', 12000),
      ('Dhelana', 11000),
      ('Selaguda', 9000),
      ('Kanji Ka Kedha', 4000),
      ('Aambaghati', 6000),
      ('Banda', 9500),
      ('Aidana', 11500),
      ('Karera', 13000),
      ('Saprav', 10500),
      ('Dabla', 14500),
      ('Tanvan', 6000),
      ('Sardargarh', 14000),
      ('Agariya Kotari', 9000),
      ('Gugli', 11500),
      ('Ghosundi', 10000),
      ('Agariya', 10000),
      ('Bhakroda', 14000)
  ) as seed(route_name, annual_fee_amount)
)
insert into public.transport_routes (
  route_code,
  route_name,
  default_installment_amount,
  annual_fee_amount,
  is_active,
  notes
)
select
  null,
  seed.route_name,
  floor(seed.annual_fee_amount / 4.0)::integer,
  seed.annual_fee_amount,
  true,
  'AY 2026-27 workbook route seed'
from route_seed as seed
where not exists (
  select 1
  from public.transport_routes as routes
  where lower(trim(routes.route_name)) = lower(trim(seed.route_name))
)
on conflict do nothing;

with route_seed as (
  select *
  from (
    values
      ('No Transport', 0),
      ('Amet Bus', 5500),
      ('Amet College Side (On Road)', 6000),
      ('Amet College Road (Colony Inside)', 6000),
      ('Amet Railway Station (On Road)', 7000),
      ('Amet Railway Station (Inside)', 7000),
      ('Amet City', 7000),
      ('Bhopji Ka Kheda', 11000),
      ('Ballo Ka Khera', 12000),
      ('Makarda', 14000),
      ('Masingpura', 14000),
      ('Jilola', 17000),
      ('Mund Koshiya', 12000),
      ('Dhelana', 11000),
      ('Selaguda', 9000),
      ('Kanji Ka Kedha', 4000),
      ('Aambaghati', 6000),
      ('Banda', 9500),
      ('Aidana', 11500),
      ('Karera', 13000),
      ('Saprav', 10500),
      ('Dabla', 14500),
      ('Tanvan', 6000),
      ('Sardargarh', 14000),
      ('Agariya Kotari', 9000),
      ('Gugli', 11500),
      ('Ghosundi', 10000),
      ('Agariya', 10000),
      ('Bhakroda', 14000)
  ) as seed(route_name, annual_fee_amount)
)
update public.transport_routes as routes
set
  default_installment_amount = floor(seed.annual_fee_amount / 4.0)::integer,
  annual_fee_amount = seed.annual_fee_amount,
  is_active = true,
  notes = 'AY 2026-27 workbook route seed',
  updated_at = now()
from route_seed as seed
where lower(trim(routes.route_name)) = lower(trim(seed.route_name));

update public.fee_policy_configs
set
  academic_session_label = '2026-27',
  calculation_model = 'workbook_v1',
  installment_schedule = jsonb_build_array(
    jsonb_build_object('label', 'Installment 1', 'dueDateLabel', '20-04-2026'),
    jsonb_build_object('label', 'Installment 2', 'dueDateLabel', '20-07-2026'),
    jsonb_build_object('label', 'Installment 3', 'dueDateLabel', '20-10-2026'),
    jsonb_build_object('label', 'Installment 4', 'dueDateLabel', '20-01-2027')
  ),
  late_fee_flat_amount = 1000,
  new_student_academic_fee_amount = 1100,
  old_student_academic_fee_amount = 500,
  accepted_payment_modes = array[
    'cash'::public.payment_mode,
    'upi'::public.payment_mode,
    'bank_transfer'::public.payment_mode,
    'cheque'::public.payment_mode
  ],
  receipt_prefix = 'SVP',
  notes = 'AY 2026-27 workbook policy. Workbook note conflict resolved in favour of editable Fee_Setup value: flat late fee Rs 1000. Books stay excluded from workbook mode.',
  is_active = true,
  updated_at = now()
where is_active = true;

insert into public.fee_policy_configs (
  academic_session_label,
  calculation_model,
  installment_schedule,
  late_fee_flat_amount,
  new_student_academic_fee_amount,
  old_student_academic_fee_amount,
  custom_fee_heads,
  accepted_payment_modes,
  receipt_prefix,
  notes,
  is_active
)
select
  '2026-27',
  'workbook_v1',
  jsonb_build_array(
    jsonb_build_object('label', 'Installment 1', 'dueDateLabel', '20-04-2026'),
    jsonb_build_object('label', 'Installment 2', 'dueDateLabel', '20-07-2026'),
    jsonb_build_object('label', 'Installment 3', 'dueDateLabel', '20-10-2026'),
    jsonb_build_object('label', 'Installment 4', 'dueDateLabel', '20-01-2027')
  ),
  1000,
  1100,
  500,
  '[]'::jsonb,
  array[
    'cash'::public.payment_mode,
    'upi'::public.payment_mode,
    'bank_transfer'::public.payment_mode,
    'cheque'::public.payment_mode
  ],
  'SVP',
  'AY 2026-27 workbook policy. Workbook note conflict resolved in favour of editable Fee_Setup value: flat late fee Rs 1000. Books stay excluded from workbook mode.',
  true
where not exists (
  select 1
  from public.fee_policy_configs
  where is_active = true
);

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
    join public.students as s
      on s.id = i.student_id
    join public.classes as c
      on c.id = i.class_id
    join active_policy as policy_row
      on policy_row.academic_session_label = c.session_label
    left join public.student_fee_overrides as override_row
      on override_row.student_id = i.student_id
     and override_row.is_active = true
    left join public.transport_routes as route_row
      on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      payment_row.last_payment_date,
      coalesce(payment_row.had_payment_after_due, false) as had_payment_after_due
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount), 0) as paid_amount,
        max(receipt_row.payment_date) as last_payment_date,
        bool_or(receipt_row.payment_date > session_installments.due_date) as had_payment_after_due
      from public.payments as payment_row
      join public.receipts as receipt_row
        on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row
      on true
    left join lateral (
      select coalesce(sum(adjustment_row.amount_delta), 0) as adjustment_amount
      from public.payment_adjustments as adjustment_row
      where adjustment_row.installment_id = session_installments.installment_id
    ) as adjustment_row
      on true
  ),
  late_eval as (
    select
      rolled.*,
      greatest(rolled.paid_amount + rolled.adjustment_amount, 0)::integer as applied_amount,
      greatest(
        rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0),
        0
      )::integer as base_pending_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when greatest(
          rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0),
          0
        ) <= 0 then 0
        when rolled.had_payment_after_due then rolled.late_fee_flat_amount
        when p_include_candidate_late and p_as_of_date > rolled.due_date then rolled.late_fee_flat_amount
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
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.applied_amount,
      0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.applied_amount,
        0
      ) <= 0 then 'paid'
      when waiver_eval.applied_amount > 0 then 'partial'
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

create or replace view public.v_workbook_student_financials
with (security_invoker = true)
as
with active_policy as (
  select
    academic_session_label,
    installment_schedule,
    new_student_academic_fee_amount,
    old_student_academic_fee_amount
  from public.fee_policy_configs
  where is_active = true
    and calculation_model = 'workbook_v1'
  order by updated_at desc
  limit 1
),
school_default as (
  select
    tuition_fee_amount,
    transport_fee_amount,
    student_type_default
  from public.school_fee_defaults
  where is_active = true
  order by updated_at desc
  limit 1
),
student_base as (
  select
    s.id as student_id,
    s.admission_no,
    s.full_name as student_name,
    s.date_of_birth,
    s.father_name,
    s.mother_name,
    s.primary_phone as father_phone,
    s.secondary_phone as mother_phone,
    s.status as record_status,
    s.class_id,
    c.session_label,
    c.class_name,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
    c.sort_order,
    s.transport_route_id,
    route_row.route_name as transport_route_name,
    route_row.route_code as transport_route_code,
    coalesce(
      nullif(trim(override_row.student_type_override), ''),
      fee_row.student_type_default,
      school_default.student_type_default,
      'existing'
    ) as student_status_code,
    coalesce(override_row.custom_tuition_fee_amount, fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0) as tuition_fee,
    case
      when override_row.custom_transport_fee_amount is not null then override_row.custom_transport_fee_amount
      when s.transport_route_id is not null then coalesce(
        route_row.annual_fee_amount,
        route_row.default_installment_amount * jsonb_array_length(active_policy.installment_schedule)
      )
      else 0
    end as transport_fee,
    case
      when override_row.other_adjustment_amount is not null then override_row.other_adjustment_amount
      when override_row.custom_other_fee_heads is not null and override_row.custom_other_fee_heads <> '{}'::jsonb then coalesce(
        (
          select sum(value::integer)
          from jsonb_each_text(override_row.custom_other_fee_heads)
        ),
        0
      )
      else 0
    end as other_adjustment_amount,
    case
      when nullif(trim(coalesce(override_row.other_adjustment_head, '')), '') is not null then nullif(trim(coalesce(override_row.other_adjustment_head, '')), '')
      when override_row.custom_other_fee_heads is not null and override_row.custom_other_fee_heads <> '{}'::jsonb then 'Other fee / adjustment'
      else null
    end as other_adjustment_head,
    coalesce(override_row.discount_amount, 0) as raw_discount_amount,
    coalesce(override_row.late_fee_waiver_amount, 0) as late_fee_waiver_amount,
    override_row.reason as override_reason
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  join active_policy
    on active_policy.academic_session_label = c.session_label
  left join school_default
    on true
  left join public.fee_settings as fee_row
    on fee_row.class_id = c.id
   and fee_row.is_active = true
  left join public.student_fee_overrides as override_row
    on override_row.student_id = s.id
   and override_row.is_active = true
  left join public.transport_routes as route_row
    on route_row.id = s.transport_route_id
),
student_profile as (
  select
    student_base.*,
    case
      when student_base.student_status_code = 'new' then active_policy.new_student_academic_fee_amount
      else active_policy.old_student_academic_fee_amount
    end as academic_fee
  from student_base
  join active_policy
    on active_policy.academic_session_label = student_base.session_label
),
student_profile_enriched as (
  select
    student_profile.*,
    greatest(
      0,
      student_profile.tuition_fee +
      student_profile.transport_fee +
      student_profile.academic_fee +
      student_profile.other_adjustment_amount
    ) as gross_base_before_discount,
    least(
      coalesce(student_profile.raw_discount_amount, 0),
      greatest(
        0,
        student_profile.tuition_fee +
        student_profile.transport_fee +
        student_profile.academic_fee +
        student_profile.other_adjustment_amount
      )
    ) as discount_amount
  from student_profile
),
installment_summary as (
  select
    student_id,
    coalesce(sum(base_charge), 0)::integer as base_charge_total,
    coalesce(sum(final_late_fee), 0)::integer as late_fee_total,
    coalesce(sum(total_charge), 0)::integer as total_due,
    coalesce(sum(applied_amount), 0)::integer as total_paid,
    coalesce(sum(pending_amount), 0)::integer as outstanding_amount,
    coalesce(max(last_payment_date), null) as last_payment_date,
    count(*) filter (where pending_amount <= 0) as paid_installment_count,
    count(*) filter (where pending_amount > 0 and applied_amount > 0) as partly_paid_installment_count,
    count(*) filter (where balance_status = 'overdue') as overdue_installment_count,
    max(case when installment_no = 1 then pending_amount end)::integer as inst1_pending,
    max(case when installment_no = 2 then pending_amount end)::integer as inst2_pending,
    max(case when installment_no = 3 then pending_amount end)::integer as inst3_pending,
    max(case when installment_no = 4 then pending_amount end)::integer as inst4_pending
  from public.v_workbook_installment_balances
  group by student_id
),
next_due as (
  select distinct on (student_id)
    student_id,
    due_date as next_due_date,
    pending_amount as next_due_amount,
    installment_label as next_due_label
  from public.v_workbook_installment_balances
  where pending_amount > 0
  order by student_id, due_date, installment_no
)
select
  profile.student_id,
  profile.admission_no,
  profile.student_name,
  profile.date_of_birth,
  profile.father_name,
  profile.mother_name,
  profile.father_phone,
  profile.mother_phone,
  profile.record_status,
  profile.class_id,
  profile.session_label,
  profile.class_name,
  profile.class_label,
  profile.sort_order,
  profile.transport_route_id,
  profile.transport_route_name,
  profile.transport_route_code,
  profile.student_status_code,
  case when profile.student_status_code = 'new' then 'New' else 'Old' end as student_status_label,
  profile.tuition_fee,
  profile.transport_fee,
  profile.academic_fee,
  profile.other_adjustment_head,
  profile.other_adjustment_amount,
  profile.gross_base_before_discount,
  profile.discount_amount,
  profile.late_fee_waiver_amount,
  coalesce(summary.base_charge_total, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as base_charge_total,
  coalesce(summary.late_fee_total, 0) as late_fee_total,
  coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as total_due,
  coalesce(summary.total_paid, 0) as total_paid,
  coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as outstanding_amount,
  next_due.next_due_date,
  next_due.next_due_amount,
  next_due.next_due_label,
  summary.last_payment_date,
  coalesce(summary.paid_installment_count, 0) as paid_installment_count,
  coalesce(summary.partly_paid_installment_count, 0) as partly_paid_installment_count,
  coalesce(summary.overdue_installment_count, 0) as overdue_installment_count,
  coalesce(summary.inst1_pending, 0) as inst1_pending,
  coalesce(summary.inst2_pending, 0) as inst2_pending,
  coalesce(summary.inst3_pending, 0) as inst3_pending,
  coalesce(summary.inst4_pending, 0) as inst4_pending,
  case
    when coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then ''
    when coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then 'PAID'
    when coalesce(summary.total_paid, 0) <= 0 then 'NOT STARTED'
    when next_due.next_due_date is not null and current_date > next_due.next_due_date then 'OVERDUE'
    else 'PARTLY PAID'
  end as status_label,
  profile.override_reason
from student_profile_enriched as profile
left join installment_summary as summary
  on summary.student_id = profile.student_id
left join next_due
  on next_due.student_id = profile.student_id;

create or replace function public.post_student_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP'
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
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
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

  select c.session_label
  into student_session_label
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  where s.id = p_student_id;

  if student_session_label is null then
    raise exception 'Selected student was not found.';
  end if;

  select calculation_model, academic_session_label
  into active_policy_model, active_policy_session
  from public.fee_policy_configs
  where is_active = true
  order by updated_at desc
  limit 1;

  use_workbook_mode :=
    active_policy_model = 'workbook_v1'
    and student_session_label = active_policy_session;

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  if use_workbook_mode then
    select coalesce(sum(pending_amount), 0)
    into total_outstanding
    from private.workbook_installment_snapshot(
      p_student_id,
      p_payment_date,
      true
    )
    where pending_amount > 0;
  else
    select coalesce(sum(outstanding_amount), 0)
    into total_outstanding
    from public.v_installment_balances
    where student_id = p_student_id
      and outstanding_amount > 0;
  end if;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts
  where receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

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
        received_by
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), '')
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  if use_workbook_mode then
    for balance_row in
      select installment_id, pending_amount
      from private.workbook_installment_snapshot(
        p_student_id,
        p_payment_date,
        true
      )
      where pending_amount > 0
      order by due_date asc, installment_no asc
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
      select installment_id, outstanding_amount
      from public.v_installment_balances
      where student_id = p_student_id
        and outstanding_amount > 0
      order by due_date asc, installment_no asc
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
  uuid,
  date,
  public.payment_mode,
  integer,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.import_student_batch_row(
  p_batch_id uuid,
  p_row_index integer,
  p_full_name text,
  p_class_id uuid,
  p_admission_no text,
  p_date_of_birth date,
  p_father_name text,
  p_mother_name text,
  p_primary_phone text,
  p_secondary_phone text,
  p_address text,
  p_transport_route_id uuid,
  p_status public.student_status,
  p_notes text,
  p_custom_tuition_fee_amount integer,
  p_custom_transport_fee_amount integer,
  p_custom_books_fee_amount integer,
  p_custom_admission_activity_misc_fee_amount integer,
  p_custom_other_fee_heads jsonb,
  p_custom_late_fee_flat_amount integer,
  p_discount_amount integer,
  p_student_type_override text,
  p_transport_applies_override boolean,
  p_other_adjustment_head text default null,
  p_other_adjustment_amount integer default null,
  p_late_fee_waiver_amount integer default 0
)
returns table (
  student_id uuid,
  student_fee_override_id uuid
)
language plpgsql
set search_path = public, private
as $$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null
    or coalesce(p_other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(p_other_adjustment_head, '')), '') is not null
    or coalesce(p_late_fee_waiver_amount, 0) > 0;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      other_adjustment_head,
      other_adjustment_amount,
      late_fee_waiver_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      nullif(trim(coalesce(p_other_adjustment_head, '')), ''),
      p_other_adjustment_amount,
      greatest(coalesce(p_late_fee_waiver_amount, 0), 0),
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$$;

grant execute on function public.import_student_batch_row(
  uuid,
  integer,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  uuid,
  public.student_status,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  integer,
  text,
  boolean,
  text,
  integer,
  integer
) to authenticated;

