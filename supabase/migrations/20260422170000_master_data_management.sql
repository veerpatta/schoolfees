create table if not exists public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  session_label text not null unique,
  status public.class_status not null default 'active',
  is_current boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(session_label)) > 0),
  check (not is_current or status = 'active')
);

create unique index if not exists idx_academic_sessions_current_unique
on public.academic_sessions (is_current)
where is_current;

create or replace function private.ensure_single_current_academic_session()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.is_current and new.status <> 'active' then
    raise exception 'Current academic session must be active.';
  end if;

  if new.is_current then
    update public.academic_sessions
    set is_current = false
    where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and is_current;
  end if;

  return new;
end;
$$;

drop trigger if exists set_updated_at_on_academic_sessions on public.academic_sessions;
create trigger set_updated_at_on_academic_sessions
before update on public.academic_sessions
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_academic_sessions on public.academic_sessions;
create trigger set_actor_columns_on_academic_sessions
before insert or update on public.academic_sessions
for each row execute function private.set_actor_columns();

drop trigger if exists ensure_single_current_academic_session on public.academic_sessions;
create trigger ensure_single_current_academic_session
before insert or update on public.academic_sessions
for each row execute function private.ensure_single_current_academic_session();

drop trigger if exists audit_academic_sessions on public.academic_sessions;
create trigger audit_academic_sessions
after insert or update or delete on public.academic_sessions
for each row execute function private.capture_audit_event();

alter table public.academic_sessions enable row level security;

drop policy if exists "authenticated can read academic sessions" on public.academic_sessions;
create policy "authenticated can read academic sessions"
on public.academic_sessions for select
to authenticated
using (
  public.has_any_permission(
    array[
      'dashboard:view',
      'students:view',
      'fees:view',
      'payments:view',
      'defaulters:view',
      'imports:view',
      'reports:view',
      'settings:view'
    ]
  )
);

drop policy if exists "authenticated can insert academic sessions" on public.academic_sessions;
create policy "authenticated can insert academic sessions"
on public.academic_sessions for insert
to authenticated
with check (public.has_permission('settings:write'));

drop policy if exists "authenticated can update academic sessions" on public.academic_sessions;
create policy "authenticated can update academic sessions"
on public.academic_sessions for update
to authenticated
using (public.has_permission('settings:write'))
with check (public.has_permission('settings:write'));

drop policy if exists "authenticated can delete academic sessions" on public.academic_sessions;
create policy "authenticated can delete academic sessions"
on public.academic_sessions for delete
to authenticated
using (public.has_permission('settings:write'));

create unique index if not exists idx_classes_unique_active_per_session_ci
on public.classes (
  lower(session_label),
  lower(class_name),
  lower(coalesce(section, '')),
  lower(coalesce(stream_name, ''))
)
where status = 'active';

create unique index if not exists idx_transport_routes_unique_active_name_ci
on public.transport_routes (lower(route_name))
where is_active;

insert into public.academic_sessions (session_label, status, is_current)
select distinct
  label_source.session_label,
  case
    when label_source.session_label = current_policy.current_label then 'active'::public.class_status
    else 'inactive'::public.class_status
  end,
  label_source.session_label = current_policy.current_label
from (
  select trim(session_label) as session_label
  from public.classes
  where trim(session_label) <> ''
  union
  select trim(academic_session_label) as session_label
  from public.fee_policy_configs
  where is_active
    and trim(academic_session_label) <> ''
) as label_source
cross join lateral (
  select nullif(trim(academic_session_label), '') as current_label
  from public.fee_policy_configs
  where is_active
  order by updated_at desc
  limit 1
) as current_policy
on conflict (session_label) do update
set
  status = excluded.status,
  is_current = excluded.is_current,
  updated_at = now();

insert into public.academic_sessions (session_label, status, is_current)
select distinct
  trim(session_label),
  'active'::public.class_status,
  false
from public.classes
where trim(session_label) <> ''
on conflict (session_label) do nothing;

update public.academic_sessions
set is_current = true,
    status = 'active'
where session_label = (
  select nullif(trim(academic_session_label), '')
  from public.fee_policy_configs
  where is_active
  order by updated_at desc
  limit 1
);

with any_current as (
  select exists(select 1 from public.academic_sessions where is_current) as has_current
)
update public.academic_sessions
set is_current = true,
    status = 'active'
where id = (
  select id
  from public.academic_sessions
  order by created_at desc
  limit 1
)
and (select not has_current from any_current);
