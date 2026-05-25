create table if not exists public.promotion_runs (
  id uuid primary key default gen_random_uuid(),
  source_session_label text not null,
  target_session_label text not null,
  status text not null default 'preview'
    check (status in ('preview', 'applied', 'rolled_back')),
  triggered_by uuid references auth.users(id) on delete set null,
  triggered_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  preview_count integer not null default 0,
  applied_count integer not null default 0,
  graduated_count integer not null default 0,
  credit_carry_forward_count integer not null default 0,
  credit_carry_forward_total integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotion_run_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.promotion_runs(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  previous_class_id uuid references public.classes(id) on delete set null,
  new_class_id uuid references public.classes(id) on delete set null,
  previous_status public.student_status,
  new_status public.student_status,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  opening_credit_amount integer not null default 0 check (opening_credit_amount >= 0),
  applied boolean not null default false,
  decision text not null default 'pending'
    check (decision in ('pending', 'promote', 'graduate', 'skip', 'manual')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, student_id)
);

create index if not exists idx_promotion_runs_status_triggered_at
  on public.promotion_runs (status, triggered_at desc);

create index if not exists idx_promotion_run_entries_run_student
  on public.promotion_run_entries (run_id, student_id);

drop trigger if exists set_updated_at_on_promotion_runs on public.promotion_runs;
create trigger set_updated_at_on_promotion_runs
  before update on public.promotion_runs
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at_on_promotion_run_entries on public.promotion_run_entries;
create trigger set_updated_at_on_promotion_run_entries
  before update on public.promotion_run_entries
  for each row execute function private.set_updated_at();

drop trigger if exists audit_promotion_runs on public.promotion_runs;
create trigger audit_promotion_runs
  after insert or update or delete on public.promotion_runs
  for each row execute function private.capture_audit_event();

drop trigger if exists audit_promotion_run_entries on public.promotion_run_entries;
create trigger audit_promotion_run_entries
  after insert or update or delete on public.promotion_run_entries
  for each row execute function private.capture_audit_event();

alter table public.promotion_runs enable row level security;
alter table public.promotion_run_entries enable row level security;

drop policy if exists "admin can read promotion runs" on public.promotion_runs;
create policy "admin can read promotion runs"
  on public.promotion_runs for select
  to authenticated
  using (public.has_permission('students:write'));

drop policy if exists "admin can insert promotion runs" on public.promotion_runs;
create policy "admin can insert promotion runs"
  on public.promotion_runs for insert
  to authenticated
  with check (public.has_permission('students:write'));

drop policy if exists "admin can update promotion runs" on public.promotion_runs;
create policy "admin can update promotion runs"
  on public.promotion_runs for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));

drop policy if exists "admin can read promotion run entries" on public.promotion_run_entries;
create policy "admin can read promotion run entries"
  on public.promotion_run_entries for select
  to authenticated
  using (public.has_permission('students:write'));

drop policy if exists "admin can insert promotion run entries" on public.promotion_run_entries;
create policy "admin can insert promotion run entries"
  on public.promotion_run_entries for insert
  to authenticated
  with check (public.has_permission('students:write'));

drop policy if exists "admin can update promotion run entries" on public.promotion_run_entries;
create policy "admin can update promotion run entries"
  on public.promotion_run_entries for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
