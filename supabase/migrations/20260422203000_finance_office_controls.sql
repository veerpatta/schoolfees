do $$
begin
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
end
$$;

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

drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users"
on public.users for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'ledger:view', 'receipts:view', 'staff:manage', 'finance:view']));

drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes"
on public.classes for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'students:view', 'fees:view', 'payments:view', 'defaulters:view', 'finance:view']));

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students"
on public.students for select
to authenticated
using (public.has_any_permission(array['students:view', 'payments:view', 'ledger:view', 'receipts:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments"
on public.installments for select
to authenticated
using (public.has_any_permission(array['fees:view', 'payments:view', 'ledger:view', 'defaulters:view', 'finance:view']));

drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts"
on public.receipts for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments"
on public.payments for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments"
on public.payment_adjustments for select
to authenticated
using (public.has_any_permission(array['ledger:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

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

alter table public.collection_closures enable row level security;
alter table public.refund_requests enable row level security;
alter table public.payment_adjustment_reviews enable row level security;

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
