create table if not exists public.session_reconcile_log (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  prepared_count int not null default 0,
  updated_count int not null default 0,
  locked_count int not null default 0,
  attention_count int not null default 0,
  error_message text,
  run_by uuid references auth.users(id)
);

create index if not exists idx_session_reconcile_log_session_started
on public.session_reconcile_log (session_label, started_at desc);

alter table public.session_reconcile_log enable row level security;

drop policy if exists "fees:view can read reconcile log" on public.session_reconcile_log;
create policy "fees:view can read reconcile log" on public.session_reconcile_log
  for select to authenticated using (public.has_permission('fees:view'));

drop policy if exists "fees:write can write reconcile log" on public.session_reconcile_log;
create policy "fees:write can write reconcile log" on public.session_reconcile_log
  for insert to authenticated with check (public.has_permission('fees:write'));

drop policy if exists "fees:write can update reconcile log" on public.session_reconcile_log;
create policy "fees:write can update reconcile log" on public.session_reconcile_log
  for update to authenticated using (public.has_permission('fees:write'));

grant select, insert, update on public.session_reconcile_log to authenticated;
