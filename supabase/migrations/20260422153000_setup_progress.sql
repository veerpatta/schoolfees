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
