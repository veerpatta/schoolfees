-- Staging tables for the admin-only bulk payment upload (Payment Desk
-- sub-surface /protected/payments/bulk).
--
-- Mirrors the student-import staging pattern (import_batches / import_rows)
-- but as separate tables: the student tables carry student-specific FK
-- columns and orchestration. Money NEVER moves from these tables directly —
-- commit posts each row through post_student_payment_with_adjustments (the
-- single posting path), keyed by the per-row client_request_id so a re-run
-- of a failed batch cannot double-post.
--
-- Access is gated on has_permission('payments:bulk') — admin-only at the
-- app layer, and public.has_permission grants admin every permission string,
-- so no permission-mapping change is needed here.

create table if not exists public.payment_import_batches (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  file_name text not null,
  source_format text not null check (source_format in ('csv', 'xlsx')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validated', 'committing', 'committed', 'failed', 'cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  posted_rows integer not null default 0,
  created_by uuid default auth.uid() references public.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payment_import_batches (id) on delete cascade,
  row_number integer not null,
  raw_payload jsonb not null,
  admission_no text,
  student_id uuid references public.students (id),
  student_name text,
  payment_date date,
  payment_mode public.payment_mode,
  amount integer,
  remarks text,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'warning', 'error')),
  validation_messages jsonb not null default '[]'::jsonb,
  duplicate_acknowledged boolean not null default false,
  client_request_id uuid not null default gen_random_uuid(),
  receipt_id uuid references public.receipts (id),
  receipt_number text,
  posted_at timestamptz,
  post_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_import_rows_batch_id
  on public.payment_import_rows (batch_id, row_number);

alter table public.payment_import_batches enable row level security;
alter table public.payment_import_rows enable row level security;

create policy payment_import_batches_select on public.payment_import_batches
  for select to authenticated
  using ((select public.has_permission('payments:bulk')));

create policy payment_import_batches_insert on public.payment_import_batches
  for insert to authenticated
  with check ((select public.has_permission('payments:bulk')));

create policy payment_import_batches_update on public.payment_import_batches
  for update to authenticated
  using ((select public.has_permission('payments:bulk')))
  with check ((select public.has_permission('payments:bulk')));

create policy payment_import_rows_select on public.payment_import_rows
  for select to authenticated
  using ((select public.has_permission('payments:bulk')));

create policy payment_import_rows_insert on public.payment_import_rows
  for insert to authenticated
  with check ((select public.has_permission('payments:bulk')));

create policy payment_import_rows_update on public.payment_import_rows
  for update to authenticated
  using ((select public.has_permission('payments:bulk')))
  with check ((select public.has_permission('payments:bulk')));
