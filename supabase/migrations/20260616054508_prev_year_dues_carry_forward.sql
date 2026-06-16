-- Previous-Year Dues Carry-Forward (A2)
--
-- Adds the infrastructure to carry unpaid prior-year (2025-26) tuition balances
-- into the current 2026-27 collection workflow as a dedicated, audited
-- "carry-forward" installment, without ever creating a student or posting a
-- payment.
--
-- Three pieces:
--   1. installments.is_carry_forward  — a durable marker so Fee Setup ledger
--      regeneration (lib/fees/generator.ts + lib/fees/regeneration.ts) can
--      recalculate ONLY normal policy installments and NEVER cancel/rewrite the
--      carry-forward line. The distinctive installment_label is the human key;
--      this boolean is the machine key the regeneration sweep tests against.
--   2. prev_year_import_batches — one row per uploaded confirm spreadsheet
--      (file name + sha256 hash + totals + status), for traceability.
--   3. prev_year_import_rows — one row per spreadsheet line (raw payload + the
--      owner's decision + match outcome + the installment it produced or the
--      reason it was skipped).
--
-- All financial-immutability rules still apply: carry-forward rows are normal
-- `installments` and are collected through the regular Payment Desk + posting
-- RPCs. Late fee is forced to 0 at the application layer; nothing here charges
-- a fine.

set search_path = public, private;

-- 1. Durable carry-forward marker on installments -----------------------------

alter table public.installments
  add column if not exists is_carry_forward boolean not null default false;

comment on column public.installments.is_carry_forward is
  'True for previous-year dues carry-forward lines. Excluded from Fee Setup ledger regeneration cancel/rewrite sweeps; always zero late fee.';

-- Fast lookup of every carry-forward row (small partial index).
create index if not exists idx_installments_carry_forward
  on public.installments (student_id)
  where is_carry_forward = true;

-- 2. Import batch + row audit tables ------------------------------------------

create table if not exists public.prev_year_import_batches (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  file_name text not null,
  file_sha256 text not null,
  source_sheet text,
  -- Echoed envelope figures captured from the parsed file / owner confirm step.
  candidate_row_count integer not null default 0 check (candidate_row_count >= 0),
  confirmed_row_count integer not null default 0 check (confirmed_row_count >= 0),
  confirmed_subtotal integer not null default 0 check (confirmed_subtotal >= 0),
  applied_row_count integer not null default 0 check (applied_row_count >= 0),
  applied_subtotal integer not null default 0 check (applied_subtotal >= 0),
  status text not null default 'dry_run'
    check (status in ('dry_run', 'applied', 'rolled_back', 'failed', 'cancelled')),
  dry_run_summary jsonb not null default '{}'::jsonb,
  apply_summary jsonb,
  apply_notes text,
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trim(session_label) <> ''),
  check (trim(file_name) <> ''),
  check (trim(file_sha256) <> ''),
  check (jsonb_typeof(dry_run_summary) = 'object'),
  check (apply_summary is null or jsonb_typeof(apply_summary) = 'object')
);

create table if not exists public.prev_year_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.prev_year_import_batches(id) on delete cascade,
  row_index integer not null check (row_index >= 0),
  -- Raw source columns, preserved verbatim for traceability.
  raw_row jsonb not null default '{}'::jsonb,
  source_admission_no text,
  source_name text,
  prev_year_due integer check (prev_year_due is null or prev_year_due >= 0),
  -- The owner's decision in the CONFIRM? column, normalized.
  owner_decision text not null default 'pending'
    check (owner_decision in ('confirm', 'write_off', 'reject', 'pending')),
  -- How (and whether) the row resolved to an app student.
  match_method text not null default 'unmatched'
    check (match_method in ('admission_no', 'name_phone', 'manual', 'unmatched', 'ambiguous')),
  matched_student_id uuid references public.students(id) on delete set null,
  matched_admission_no text,
  -- The carry-forward installment this row produced (null until applied / if skipped).
  applied_installment_id uuid references public.installments(id) on delete set null,
  applied_amount integer check (applied_amount is null or applied_amount >= 0),
  -- Why a row was not applied (write-off, no confirm, no match, no fee setting…).
  skip_reason text,
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'applied', 'skipped', 'error')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(raw_row) = 'object'),
  unique (batch_id, row_index)
);

create index if not exists idx_prev_year_import_batches_session_created
  on public.prev_year_import_batches (session_label, created_at desc);

create index if not exists idx_prev_year_import_batches_status_created
  on public.prev_year_import_batches (status, created_at desc);

create index if not exists idx_prev_year_import_rows_batch
  on public.prev_year_import_rows (batch_id, row_index);

create index if not exists idx_prev_year_import_rows_student
  on public.prev_year_import_rows (matched_student_id);

create index if not exists idx_prev_year_import_rows_installment
  on public.prev_year_import_rows (applied_installment_id);

-- Standard triggers (match ledger_regeneration_* pattern) ---------------------

drop trigger if exists set_updated_at_on_prev_year_import_batches on public.prev_year_import_batches;
create trigger set_updated_at_on_prev_year_import_batches
before update on public.prev_year_import_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_prev_year_import_batches on public.prev_year_import_batches;
create trigger set_actor_columns_on_prev_year_import_batches
before insert or update on public.prev_year_import_batches
for each row execute function private.set_actor_columns();

drop trigger if exists audit_prev_year_import_batches on public.prev_year_import_batches;
create trigger audit_prev_year_import_batches
after insert or update or delete on public.prev_year_import_batches
for each row execute function private.capture_audit_event();

drop trigger if exists set_updated_at_on_prev_year_import_rows on public.prev_year_import_rows;
create trigger set_updated_at_on_prev_year_import_rows
before update on public.prev_year_import_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_prev_year_import_rows on public.prev_year_import_rows;
create trigger set_actor_columns_on_prev_year_import_rows
before insert or update on public.prev_year_import_rows
for each row execute function private.set_actor_columns();

drop trigger if exists audit_prev_year_import_rows on public.prev_year_import_rows;
create trigger audit_prev_year_import_rows
after insert or update or delete on public.prev_year_import_rows
for each row execute function private.capture_audit_event();

-- RLS (match ledger_regeneration_* permission gating) -------------------------

alter table public.prev_year_import_batches enable row level security;
alter table public.prev_year_import_rows enable row level security;

drop policy if exists "authenticated can read prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can read prev year import batches"
on public.prev_year_import_batches for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can insert prev year import batches"
on public.prev_year_import_batches for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can update prev year import batches"
on public.prev_year_import_batches for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can read prev year import rows"
on public.prev_year_import_rows for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can insert prev year import rows"
on public.prev_year_import_rows for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can update prev year import rows"
on public.prev_year_import_rows for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));
