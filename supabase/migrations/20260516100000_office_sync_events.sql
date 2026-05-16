create table if not exists public.office_sync_events (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  entity_type text not null,
  entity_id text,
  action text not null,
  affected_student_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);

create index if not exists idx_office_sync_events_session_created
  on public.office_sync_events (session_label, created_at desc);

create index if not exists idx_office_sync_events_entity
  on public.office_sync_events (entity_type, entity_id);

alter table public.office_sync_events enable row level security;
alter table public.office_sync_events replica identity full;

create policy "staff can read office sync events" on public.office_sync_events
  for select to authenticated using (
    public.has_any_permission(array[
      'dashboard:view',
      'students:view',
      'fees:view',
      'payments:view',
      'reports:view',
      'defaulters:view'
    ])
  );

create policy "staff can insert office sync events" on public.office_sync_events
  for insert to authenticated with check (
    public.has_permission('students:write') or
    public.has_permission('fees:write') or
    public.has_permission('payments:write')
  );

grant select, insert on public.office_sync_events to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.office_sync_events;
exception
  when duplicate_object then null;
end
$$;
